import type { SitesJson, Wall } from '@detour/shared';
import { registrableDomain } from '@detour/shared';

import { pausedRowLabel } from './copy';
import { findSite } from './list-matching';
import { hostOf } from './page-url';
import { remainingOf } from './pause';
import {
  renderLinks,
  renderPause,
  renderSettings,
  renderSite,
  renderState,
  renderSwitch,
} from './popup-sections';
import type { Settings } from './storage';
import { isPaused, readList, readListId, readPause, readSettings } from './storage';

/** The page the popup was opened from, and what the list says about it. */
export type PopupSite = {
  host: string;
  listed: boolean;
  walls: Wall[];
  tabId: number;
  url: string;
};

export type PopupView = {
  settings: Settings;
  paused: boolean;
  /** The rest of a timed pause in milliseconds, or null when it has no clock. */
  remaining: number | null;
  /** The moment the timed pause ends, and 0 when nothing is counting down. */
  until: number;
  site: PopupSite | null;
  apiBase: string;
  listId: string;
  now: number;
  reload: () => void;
};

export type PopupOptions = {
  apiBase: string;
  now?: number;
};

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

/**
 * The site is named whether or not the list carries it, because both answers are
 * useful: one opens the alternatives, the other asks for a report. A page with no
 * site — a browser page, a store page, a `file:` — names nothing.
 */
function siteFor(list: SitesJson, tab: ActiveTab): PopupSite | null {
  const entry = findSite(list, tab.url);
  const host = entry?.domain ?? (registrableDomain(tab.url) || hostOf(tab.url));

  if (host === null || host === '') {
    return null;
  }

  return {
    host,
    listed: entry !== null,
    walls: entry?.walls ?? [],
    tabId: tab.id,
    url: tab.url,
  };
}

export function renderPopup(view: PopupView): void {
  renderState(view);
  renderSwitch(view);
  renderSite(view);
  renderPause(view);
  renderSettings();
  renderLinks(view);
}

/**
 * A pause keeps counting while the popup stays open, so the row is refreshed on
 * the second. The label carries the moment it counts to: a render that pauses
 * differently writes another one, and the old interval stops instead of writing
 * over the row it no longer owns. A session pause has no clock to tick.
 */
function countdown(until: number): void {
  const tick = (): void => {
    const element = document.querySelector<HTMLElement>('[data-role="pause-label"]');

    if (element === null || element.dataset.until !== String(until)) {
      window.clearInterval(timer);
      return;
    }

    element.textContent = pausedRowLabel(remainingOf(until, Date.now()));
  };

  const timer = window.setInterval(tick, 1000);

  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
}

/**
 * Reads the settings, the pause, the list, and the active tab, and renders once.
 * Every write is a message, and the reload that follows reads what the service
 * worker stored.
 */
export async function startPopup(options: PopupOptions): Promise<void> {
  const now = options.now ?? Date.now();

  const load = async (): Promise<void> => {
    const [settings, pause, list, listId] = await Promise.all([
      readSettings(),
      readPause(),
      readList(),
      readListId(),
    ]);
    const tab = await activeTab();
    const paused = isPaused(pause, now);

    renderPopup({
      settings,
      paused,
      remaining: paused ? remainingOf(pause.until, now) : null,
      until: paused ? pause.until : 0,
      site: tab === null ? null : siteFor(list, tab),
      apiBase: options.apiBase,
      listId,
      now,
      reload: () => void load(),
    });

    if (paused && pause.until > now) {
      countdown(pause.until);
    }
  };

  await load();
}
