import type { AllowanceScope, AllowanceState } from './allowances';
import { findSite } from './list-matching';
import {
  renderAllowances,
  renderLinks,
  renderList,
  renderPause,
  renderState,
  renderSwitch,
  renderTabAllowance,
} from './popup-sections';
import type { Settings } from './storage';
import { isPaused, readAllowances, readList, readPauseUntil, readSettings } from './storage';

export type PopupAllowance = {
  scope: AllowanceScope;
  host: string;
  tabId?: number;
};

export type PopupView = {
  settings: Settings;
  paused: boolean;
  allowance: PopupAllowance | null;
  count: number;
  list: { version: number; sites: number; updated: string };
  apiBase: string;
  now: number;
  reload: () => void;
};

export type PopupOptions = {
  apiBase: string;
  now?: number;
};

/**
 * The entry the popup shows for the active tab. A permanent allowance outlives
 * every restriction, so it wins over the session one, and both over this tab's.
 */
function allowanceFor(
  state: AllowanceState,
  host: string | null,
  tabId: number | null,
): PopupAllowance | null {
  if (host === null) {
    return null;
  }

  const permanent = state.allowAlways.find((entry) => entry.host === host);

  if (permanent !== undefined) {
    return { scope: 'always', host: permanent.host };
  }

  const session = state.allowSession.find((entry) => entry.host === host);

  if (session !== undefined) {
    return { scope: 'session', host: session.host };
  }

  const tab = state.allowTabs.find((entry) => entry.host === host && entry.tabId === tabId);

  return tab === undefined ? null : { scope: 'tab', host: tab.host, tabId: tab.tabId };
}

function countAllowances(state: AllowanceState): number {
  return state.allowAlways.length + state.allowSession.length + state.allowTabs.length;
}

type ActiveTab = { id: number; url: string };

/** The tab the popup was opened from, or null when the runtime cannot answer. */
async function activeTab(): Promise<ActiveTab | null> {
  if (typeof chrome === 'undefined' || chrome.tabs === undefined) {
    return null;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    return tab?.id === undefined || tab.url === undefined ? null : { id: tab.id, url: tab.url };
  } catch {
    return null;
  }
}

export function renderPopup(view: PopupView): void {
  renderState(view);
  renderSwitch(view);
  renderTabAllowance(view);
  renderPause(view);
  renderAllowances(view);
  renderList(view);
  renderLinks(view);
}

/**
 * Reads the settings, the pause, the allowances, the list, and the active tab,
 * and renders once. Every write is a message, and the reload that follows reads
 * what the service worker stored.
 */
export async function startPopup(options: PopupOptions): Promise<void> {
  const now = options.now ?? Date.now();

  const load = async (): Promise<void> => {
    const [settings, pauseUntil, allowances, list] = await Promise.all([
      readSettings(),
      readPauseUntil(),
      readAllowances(),
      readList(),
    ]);
    const tab = await activeTab();
    const host = tab === null ? null : (findSite(list, tab.url)?.domain ?? null);

    renderPopup({
      settings,
      paused: isPaused(pauseUntil, now),
      allowance: allowanceFor(allowances, host, tab?.id ?? null),
      count: countAllowances(allowances),
      list: { version: list.version, sites: list.sites.length, updated: list.updated },
      apiBase: options.apiBase,
      now,
      reload: () => void load(),
    });
  };

  await load();
}
