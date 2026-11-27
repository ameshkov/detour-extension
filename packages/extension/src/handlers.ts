import { allowsHost, allowsTab } from './allowances';
import { clearCache } from './cache';
import { recordCapability } from './capabilities';
import { findSite } from './list-matching';
import { devLog } from './log';
import type {
  BlockedMessage,
  BlockedResponse,
  ClearCacheResponse,
  IsBlockedMessage,
  IsBlockedResponse,
  SetSettingsMessage,
  SettingsResponse,
} from './messages';
import { evictMeta, writeMeta } from './metadata-cache';
import { refreshList } from './refresh';
import { consumePass } from './passes';
import type { ServiceWorkerDeps } from './service-worker';
import type { TabSender } from './sender';
import { readAllowances, readList, readSettings, writeSettings } from './storage';
import { anyWallStops } from './walls';

/**
 * The block page URL carries the stored theme, so the page paints in the
 * reader's theme before the worker answers. A page without its tab record has
 * no state to apply, and this value is the only theme it can know.
 */
function blockPageUrlFor(url: string, theme: string): string {
  return `${chrome.runtime.getURL('block.html')}?u=${encodeURIComponent(url)}&theme=${theme}`;
}

/**
 * The answer that lets the page load, and the reason for it. The reason reaches
 * the development console and never the release build, where `devLog` is dropped.
 */
function passThrough(reason: string): IsBlockedResponse {
  devLog('worker', 'the page loads', reason);

  return { ok: true, blocked: false, site: null };
}

export async function handleIsBlocked(
  message: IsBlockedMessage,
  sender: TabSender,
): Promise<IsBlockedResponse> {
  const settings = await readSettings();

  if (!settings.enabled) {
    return passThrough('the list is off');
  }

  const list = await readList();

  if (list.disabled) {
    return passThrough('the list is disabled');
  }

  const site = findSite(list, message.url);

  if (site === null) {
    return passThrough('the site is not listed');
  }

  // A pass opens the page once for the tab that asked. It is spent here, before
  // the wall check, so a later visit meets the wall even when the reader has
  // switched the wall off in between.
  if (await consumePass(sender.tab?.id, message.url)) {
    return passThrough('the reader opened it once');
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
 * The tab leaves the stopped page for the block page. The guard read the head of
 * the live document, so the metadata arrives with this message: one direct write
 * before the navigation, and the cleanup after it. A sender with no tab cannot be
 * navigated, so it answers an error without a link.
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

  const settings = await readSettings();
  const blockPageUrl = blockPageUrlFor(message.url, settings.theme);

  // The record goes in before the navigation, so the block page that replaces
  // the stopped document is the only caller allowed to act for this tab. A
  // failed navigation keeps it, because the guard's fallback link opens the
  // page after that failure.
  try {
    await recordCapability(tabId, message.url);
  } catch {
    // A lost record costs the alternatives, never the page.
  }

  const meta = message.meta;

  if (meta !== null && (meta.title !== null || meta.description !== null || meta.icon !== null)) {
    try {
      await writeMeta(message.url, meta, deps.now());
    } catch {
      // A lost card costs one title, never the navigation.
    }
  }

  try {
    await chrome.tabs.update(tabId, { url: blockPageUrl });
  } catch {
    return { ok: false, error: 'navigation_failed', blockPageUrl };
  }

  // The cap and the expired entries are housekeeping, so they never hold the
  // navigation or fail it.
  void evictMeta(deps.now()).catch(() => undefined);

  return { ok: true, blockPageUrl };
}

/**
 * The reading settings arrive together, and the service worker is their only
 * writer, so a page that changes one sends all three as it holds them.
 */
export async function handleSetSettings(message: SetSettingsMessage): Promise<SettingsResponse> {
  await writeSettings(message.settings);

  return { ok: true, settings: message.settings };
}

/**
 * The reader asked for a fresh list, fresh searches, and fresh page reads. The
 * list leaves the store with the other keys, and the worker downloads it again
 * at once, so the reader does not fall back to the bundled copy until the next
 * alarm. A failed download keeps the bundled copy and does not fail the clear.
 */
export async function handleClearCache(deps: ServiceWorkerDeps): Promise<ClearCacheResponse> {
  const cleared = await clearCache();

  await refreshList(deps);

  return { ok: true, cleared };
}
