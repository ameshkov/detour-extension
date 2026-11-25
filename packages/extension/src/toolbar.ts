import type { ListedSite } from '@detour/shared';
import { findListedSite } from '@detour/shared';

import {
  LISTED_BADGE,
  TOOLBAR_OFF_TITLE,
  TOOLBAR_PAUSED_TITLE,
  TOOLBAR_TITLE,
  listedTitle,
} from './copy';
import { isPaused, readList, readPause, readSettings } from './storage';

/** The icon, the badge, and the tooltip that one state puts on the toolbar. */
export type ToolbarView = {
  icons: Readonly<Record<number, string>>;
  badge: string;
  title: string;
};

const ON_ICONS: Readonly<Record<number, string>> = {
  16: 'icon-16.png',
  32: 'icon-32.png',
  48: 'icon-48.png',
  128: 'icon-128.png',
};

/** The same mark with the tile in the muted tone, for a Detour that stops nothing. */
const OFF_ICONS: Readonly<Record<number, string>> = {
  16: 'icon-off-16.png',
  32: 'icon-off-32.png',
  48: 'icon-off-48.png',
  128: 'icon-off-128.png',
};

/** A badge takes the accent of the mark. */
export const BADGE_COLOR = '#0b6b57';
export const BADGE_TEXT_COLOR = '#ffffff';

/**
 * The toolbar follows two questions: does Detour stop pages now, and does the
 * page in front of the reader carry a wall? A switched-off or paused Detour
 * takes the gray mark and no badge, because the badge would promise a stop that
 * will not come.
 */
export function toolbarView(input: {
  enabled: boolean;
  paused: boolean;
  site: Pick<ListedSite, 'domain'> | null;
}): ToolbarView {
  if (!input.enabled) {
    return { icons: OFF_ICONS, badge: '', title: TOOLBAR_OFF_TITLE };
  }

  if (input.paused) {
    return { icons: OFF_ICONS, badge: '', title: TOOLBAR_PAUSED_TITLE };
  }

  const site = input.site;

  if (site === null) {
    return { icons: ON_ICONS, badge: '', title: TOOLBAR_TITLE };
  }

  return {
    icons: ON_ICONS,
    badge: LISTED_BADGE,
    title: listedTitle(site.domain),
  };
}

/** Writes one view to the toolbar. The calls answer nothing that a caller waits for. */
export async function applyToolbar(view: ToolbarView): Promise<void> {
  await chrome.action.setIcon({ path: { ...view.icons } });
  await chrome.action.setBadgeText({ text: view.badge });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR });
  await chrome.action.setTitle({ title: view.title });
}

/**
 * A newer refresh wins the race. A tab switch and a settings write can arrive
 * together, and the older read must not paint over the newer one.
 */
let latest = 0;

/**
 * Reads the settings, the pause, the list, and the page in front of the reader,
 * then paints the toolbar. Every failure leaves the last state in place: the
 * toolbar is a hint and never a reason to drop an event.
 */
export async function refreshToolbar(now: () => number): Promise<void> {
  const token = (latest += 1);

  try {
    const [settings, pause, list, tabs] = await Promise.all([
      readSettings(),
      readPause(),
      readList(),
      chrome.tabs.query({ active: true, lastFocusedWindow: true }),
    ]);

    if (token !== latest) {
      return;
    }

    const url = tabs[0]?.url;
    const site = url === undefined ? null : findListedSite(list, url);

    await applyToolbar(
      toolbarView({ enabled: settings.enabled, paused: isPaused(pause, now()), site }),
    );
  } catch {
    // The last view stays. A read that fails is not a state of the toolbar.
  }
}
