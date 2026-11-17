import { allowsHost, allowsTab } from './allowances';
import { clearCache } from './cache';
import { hasCapability, recordCapability } from './capabilities';
import { findSite } from './list-matching';
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
} from './messages';
import { metadataFor } from './metadata-fetch';
import type { ServiceWorkerDeps } from './service-worker';
import {
  isPaused,
  readAllowances,
  readList,
  readPauseUntil,
  readSettings,
  writePauseUntil,
  writeSettings,
} from './storage';

/** The one place a sender's tab is read: its id and the tab that opened it. */
type TabSender = {
  tab?: { id?: number; openerTabId?: number };
};

function blockPageUrlFor(url: string): string {
  return `${chrome.runtime.getURL('block.html')}?u=${encodeURIComponent(url)}`;
}

/** The answer that lets the page load: nothing blocked, nothing named. */
function passThrough(): IsBlockedResponse {
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
    return passThrough();
  }

  if (isPaused(await readPauseUntil(), deps.now())) {
    return passThrough();
  }

  const list = await readList();

  if (list.disabled) {
    return passThrough();
  }

  const site = findSite(list, message.url);

  if (site === null) {
    return passThrough();
  }

  const allowances = await readAllowances();

  if (allowsHost(allowances.allowAlways, site.domain)) {
    return passThrough();
  }

  if (allowsHost(allowances.allowSession, site.domain)) {
    return passThrough();
  }

  const tabId = sender.tab?.id;

  if (
    tabId !== undefined &&
    allowsTab(allowances.allowTabs, site.domain, tabId, sender.tab?.openerTabId)
  ) {
    return passThrough();
  }

  return {
    ok: true,
    blocked: true,
    site: { domain: site.domain, name: site.name, wall: site.wall },
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

export async function handlePause(message: PauseMessage): Promise<PauseResponse> {
  await writePauseUntil(message.until);

  return { ok: true, pauseUntil: message.until };
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
