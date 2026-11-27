import type { AlternativesAnswer } from './alternatives';
import { requestAlternatives } from './alternatives';
import { readAltCache, writeAltCache } from './alts-cache';
import { hasCapability } from './capabilities';
import type {
  MessageError,
  OpenRouteMessage,
  OpenRouteResponse,
  PageStateMessage,
  PageStateResponse,
  PopupStateResponse,
} from './messages';
import { readMetaCache } from './metadata-cache';
import { findSite } from './list-matching';
import { devLog } from './log';
import { isWebUrl } from './page-url';
import { readScopeDefaults } from './scope-defaults';
import type { ServiceWorkerDeps } from './service-worker';
import { fromExtensionPage, isTopFrame, type TabSender } from './sender';
import { pageView, popupView } from './state-view';
import { readList, readListId, readSettings } from './storage';

/**
 * The searches running right now, so two surfaces that ask for the same URL at
 * the same time share one request. A settled promise leaves the map: it is a
 * coalescing aid, and the answer is in the `alt:` cache.
 */
const inFlight = new Map<string, Promise<AlternativesAnswer | null>>();

/**
 * The stored answer of one page, or one request for it. Only a finished answer
 * is stored, because a degraded one is a spent budget and a day-long copy of it
 * would outlive the window.
 */
async function answerFor(
  url: string,
  title: string | null,
  deps: ServiceWorkerDeps,
): Promise<AlternativesAnswer | null> {
  const cached = await readAltCache(url, deps.now());

  if (cached !== null) {
    return cached;
  }

  const running = inFlight.get(url);

  if (running !== undefined) {
    return running;
  }

  const promise = requestAlternatives({
    apiBase: deps.apiBase,
    url,
    title: title ?? '',
    fetchImpl: deps.fetchImpl,
  })
    .then(async (answer) => {
      if (answer !== null && !answer.degraded) {
        try {
          await writeAltCache(url, answer, deps.now());
        } catch {
          // A lost cache entry costs one search later, not this answer.
        }
      }

      return answer;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(url);
    });

  inFlight.set(url, promise);

  return promise;
}

/** The tab the reader is looking at, or null when the runtime cannot name one. */
export async function activeTab(): Promise<{ id: number; url: string } | null> {
  if (typeof chrome === 'undefined' || chrome.tabs === undefined) {
    return null;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    return tab?.id === undefined || tab.url === undefined ? null : { id: tab.id, url: tab.url };
  } catch {
    return null;
  }
}

/**
 * The popup's state: the tab it was opened from decides between the unlisted
 * card and the routes. A cold open of a listed page asks the backend once, as
 * the block page always did, and a reader who switched Detour off asks nothing.
 */
export async function handlePopupState(
  sender: TabSender,
  deps: ServiceWorkerDeps,
): Promise<PopupStateResponse> {
  if (!fromExtensionPage(sender)) {
    return { ok: false, error: 'bad_message' };
  }

  const [settings, list, listId, tab] = await Promise.all([
    readSettings(),
    readList(),
    readListId(),
    activeTab(),
  ]);

  devLog('worker', 'the popup answers for', tab?.url ?? 'no tab');

  const listed = tab !== null && settings.enabled && findSite(list, tab.url) !== null;
  const meta = tab === null ? null : await readMetaCache(tab.url, deps.now());
  const answer =
    listed && tab !== null ? await answerFor(tab.url, meta?.title ?? null, deps) : null;

  return {
    ok: true,
    state: { settings, view: popupView({ settings, list, listId, tab, meta, answer }) },
  };
}

/**
 * The block page's state, for the tab and URL that the guard recorded. A page
 * that merely opened `block.html` gets no state at all, and no search.
 */
export async function handlePageState(
  message: PageStateMessage,
  sender: TabSender,
  deps: ServiceWorkerDeps,
): Promise<PageStateResponse> {
  if (!fromExtensionPage(sender) || !isTopFrame(sender)) {
    return { ok: false, error: 'bad_message' };
  }

  if (!(await hasCapability(sender.tab?.id, message.url))) {
    return { ok: false, error: 'bad_message' };
  }

  const [settings, list, listId, scopeDefaults] = await Promise.all([
    readSettings(),
    readList(),
    readListId(),
    readScopeDefaults(),
  ]);
  const meta = await readMetaCache(message.url, deps.now());
  const answer = await answerFor(message.url, meta?.title ?? null, deps);

  return {
    ok: true,
    state: {
      settings,
      view: pageView({
        url: message.url,
        list,
        listId,
        settings,
        scopeDefaults,
        meta,
        answer,
      }),
    },
  };
}

/**
 * The popup opens a route in the tab it was opened from. It cannot navigate that
 * tab itself, so the worker does, and it validates the address first: a route is
 * an http(s) page and nothing else.
 */
export async function handleOpenRoute(
  message: OpenRouteMessage,
  sender: TabSender,
): Promise<OpenRouteResponse> {
  if (!fromExtensionPage(sender)) {
    return { ok: false, error: 'bad_message' as MessageError };
  }

  if (!isWebUrl(message.url)) {
    return { ok: false, error: 'bad_message' };
  }

  const tab = await activeTab();

  if (tab === null) {
    return { ok: false, error: 'missing_tab' };
  }

  try {
    await chrome.tabs.update(tab.id, { url: message.url });
  } catch {
    return { ok: false, error: 'navigation_failed' };
  }

  return { ok: true };
}
