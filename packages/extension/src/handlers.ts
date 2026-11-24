import { allowsHost, allowsTab } from './allowances';
import { clearCache } from './cache';
import { hasCapability, recordCapability } from './capabilities';
import { findSite } from './list-matching';
import { devLog } from './log';
import type {
  BlockedMessage,
  BlockedResponse,
  ClearCacheResponse,
  GetMetaMessage,
  GetMetaResponse,
  IsBlockedMessage,
  IsBlockedResponse,
  PauseMessage,
  PauseResponse,
  SetSettingsMessage,
  SettingsResponse,
  ShowAlternativesMessage,
} from './messages';
import { metadataFor } from './metadata-fetch';
import type { ServiceWorkerDeps } from './service-worker';
import {
  isPaused,
  readAllowances,
  readList,
  readPause,
  readSettings,
  writePause,
  writeSettings,
} from './storage';
import { anyWallStops } from './walls';

/** The one place a sender's tab is read: its id, the tab that opened it, and its page. */
type TabSender = {
  tab?: { id?: number; openerTabId?: number };
  url?: string;
};

function blockPageUrlFor(url: string): string {
  return `${chrome.runtime.getURL('block.html')}?u=${encodeURIComponent(url)}`;
}

/**
 * Two addresses name the same page when they differ only after the `#`, because
 * a fragment never reaches the server that answers the alternatives.
 */
function samePage(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  try {
    const first = new URL(left);
    const second = new URL(right);

    first.hash = '';
    second.hash = '';

    return first.href === second.href;
  } catch {
    return false;
  }
}

/**
 * The popup and the options page are the only anonymous callers of the contract.
 * A content script always carries its page as the sender, so a page cannot ask
 * the worker to navigate another tab.
 */
function fromExtensionPage(sender: TabSender): boolean {
  try {
    return sender.url?.startsWith(chrome.runtime.getURL('')) === true;
  } catch {
    return false;
  }
}

/**
 * The answer that lets the page load, and the reason for it. The reason reaches
 * the development console and never the release build, where `devLog` is dropped.
 */
function passThrough(reason: string): IsBlockedResponse {
  devLog('worker', 'the page loads', reason);

  return { ok: true, blocked: false, site: null };
}

/**
 * The list authorizes a metadata read. A URL that the list does not carry, and
 * every URL while the kill switch is on, costs no fetch, so a page that names
 * any reachable host reaches nothing.
 */
async function isListedUrl(url: string): Promise<boolean> {
  const list = await readList();

  return !list.disabled && findSite(list, url) !== null;
}

export async function handleIsBlocked(
  message: IsBlockedMessage,
  sender: TabSender,
  deps: ServiceWorkerDeps,
): Promise<IsBlockedResponse> {
  const settings = await readSettings();

  if (!settings.enabled) {
    return passThrough('the list is off');
  }

  if (isPaused(await readPause(), deps.now())) {
    return passThrough('the pause is running');
  }

  const list = await readList();

  if (list.disabled) {
    return passThrough('the list is disabled');
  }

  const site = findSite(list, message.url);

  if (site === null) {
    return passThrough('the site is not listed');
  }

  // The reader decides which walls stop a page. A site whose walls are all
  // switched off loads, exactly as an unlisted site does.
  if (!anyWallStops(settings.walls, site.walls)) {
    return passThrough('no chosen wall matches');
  }

  const allowances = await readAllowances();

  if (allowsHost(allowances.allowAlways, site.domain)) {
    return passThrough('the site is always allowed');
  }

  if (allowsHost(allowances.allowSession, site.domain)) {
    return passThrough('the site is allowed until Chrome restarts');
  }

  const tabId = sender.tab?.id;

  if (
    tabId !== undefined &&
    allowsTab(allowances.allowTabs, site.domain, tabId, sender.tab?.openerTabId)
  ) {
    return passThrough('the tab is allowed');
  }

  devLog('worker', 'the page stops', site.domain);

  return {
    ok: true,
    blocked: true,
    site: { domain: site.domain, name: site.name, walls: site.walls },
  };
}

/**
 * The tab leaves the stopped page for the block page. The metadata fetch starts
 * here and is not awaited, so a slow publisher cannot hold the guard's link
 * while the document is hidden and stopped. A sender with no tab cannot be
 * navigated, so it answers an error without a link: the guard fails open and
 * draws nothing that would lead to a page with no record.
 */
export async function handleBlocked(
  message: BlockedMessage,
  sender: TabSender,
  deps: ServiceWorkerDeps,
): Promise<BlockedResponse> {
  const tabId = sender.tab?.id;

  if (tabId === undefined) {
    return { ok: false, error: 'missing_tab' };
  }

  const blockPageUrl = blockPageUrlFor(message.url);

  // The record goes in before the navigation, so the block page that replaces
  // the stopped document is the only caller allowed to act for this tab. A
  // failed navigation keeps it, because the guard's fallback link opens the
  // page after that failure.
  try {
    await recordCapability(tabId, message.url);
  } catch {
    // A lost record costs the metadata and the alternatives, never the page.
  }

  if (await isListedUrl(message.url)) {
    void metadataFor(message.url, deps);
  }

  try {
    await chrome.tabs.update(tabId, { url: blockPageUrl });
  } catch {
    return { ok: false, error: 'navigation_failed', blockPageUrl };
  }

  return { ok: true, blockPageUrl };
}

/**
 * The reader asked for the alternatives of the page in front of them, from the
 * popup. The worker takes the same three steps as a block: record the tab, warm
 * the metadata, and move the tab to the block page, which owns the answer.
 */
export async function handleShowAlternatives(
  message: ShowAlternativesMessage,
  sender: TabSender,
  deps: ServiceWorkerDeps,
): Promise<BlockedResponse> {
  if (!fromExtensionPage(sender)) {
    return { ok: false, error: 'bad_message' };
  }

  let tabUrl: string | undefined;

  try {
    tabUrl = (await chrome.tabs.get(message.tabId)).url;
  } catch {
    return { ok: false, error: 'missing_tab' };
  }

  // The popup reads the tab it was opened from, so a tab that has moved on
  // would show the alternatives of a page the reader is no longer reading.
  if (tabUrl === undefined || !samePage(tabUrl, message.url)) {
    return { ok: false, error: 'missing_tab' };
  }

  const blockPageUrl = blockPageUrlFor(message.url);

  try {
    await recordCapability(message.tabId, message.url);
  } catch {
    // A lost record costs the metadata and the alternatives, never the page.
  }

  if (await isListedUrl(message.url)) {
    void metadataFor(message.url, deps);
  }

  try {
    await chrome.tabs.update(message.tabId, { url: blockPageUrl });
  } catch {
    return { ok: false, error: 'navigation_failed', blockPageUrl };
  }

  return { ok: true, blockPageUrl };
}

/**
 * Metadata belongs to the tab that the guard stopped on that URL. A caller
 * without the record, on another tab, or for another URL gets no answer and
 * causes no fetch.
 */
export async function handleGetMeta(
  message: GetMetaMessage,
  sender: TabSender,
  deps: ServiceWorkerDeps,
): Promise<GetMetaResponse> {
  if (!(await isListedUrl(message.url))) {
    return { ok: true, meta: null };
  }

  if (!(await hasCapability(sender.tab?.id, message.url))) {
    return { ok: true, meta: null };
  }

  return { ok: true, meta: await metadataFor(message.url, deps) };
}

/**
 * One pause, two shapes. A timed pause stores the moment it ends, and the pause
 * that the browser ends clears that moment and sets the flag the session store
 * drops on its own.
 */
export async function handlePause(message: PauseMessage): Promise<PauseResponse> {
  const until = message.session ? 0 : message.until;

  await writePause({ until, session: message.session });

  return { ok: true, pauseUntil: until, session: message.session };
}

/**
 * The three reading settings arrive together, and the service worker is their
 * only writer, so a page that changes one sends all three as it holds them.
 */
export async function handleSetSettings(message: SetSettingsMessage): Promise<SettingsResponse> {
  await writeSettings(message.settings);

  return { ok: true, settings: message.settings };
}

/** The reader asked for a fresh list, fresh searches, and fresh page reads. */
export async function handleClearCache(): Promise<ClearCacheResponse> {
  return { ok: true, cleared: await clearCache() };
}
