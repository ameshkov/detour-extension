import type { ListedSite } from '@detour/shared';
import { findListedSite } from '@detour/shared';

import type { AllowanceState } from './allowances';
import { allowsHost, allowsTab } from './allowances';
import { hasCapability } from './capabilities';
import { TOOLBAR_OFF_TITLE, TOOLBAR_TITLE, loadTitle, stopTitle } from './copy';
import { originalUrl } from './page-url';
import { readAllowances, readList, readSettings } from './storage';
import type { WallSettings } from './walls';
import { anyWallStops } from './walls';

/** The icon and the tooltip that one state puts on the toolbar. */
export type ToolbarView = {
  icons: Readonly<Record<number, string>>;
  title: string;
};

/** The coloured route: the page in front of the reader has a detour. */
const DETOUR_ICONS: Readonly<Record<number, string>> = {
  16: 'icon-16.png',
  32: 'icon-32.png',
  48: 'icon-48.png',
  128: 'icon-128.png',
};

/** The faint route: Detour will not stop this page, so it points nowhere. */
const PLAIN_ICONS: Readonly<Record<number, string>> = {
  16: 'icon-plain-16.png',
  32: 'icon-plain-32.png',
  48: 'icon-plain-48.png',
  128: 'icon-plain-128.png',
};

/** The muted tile: Detour stops nothing while it is off. */
const OFF_ICONS: Readonly<Record<number, string>> = {
  16: 'icon-off-16.png',
  32: 'icon-off-32.png',
  48: 'icon-off-48.png',
  128: 'icon-off-128.png',
};

/**
 * What the guard will do with the page in front of the reader, as the list, the
 * settings, and the allowances answer it. The toolbar shows a detour only when
 * the guard will stop the page, so an allowed site and a page whose walls are
 * all switched off carry no colour.
 */
export type ToolbarFacts = {
  enabled: boolean;
  listEnabled: boolean;
  walls: WallSettings;
  site: Pick<ListedSite, 'domain' | 'walls'> | null;
  allowed: boolean;
};

export function toolbarView(facts: ToolbarFacts): ToolbarView {
  if (!facts.enabled) {
    return { icons: OFF_ICONS, title: TOOLBAR_OFF_TITLE };
  }

  const site = facts.site;

  if (site === null) {
    return { icons: PLAIN_ICONS, title: TOOLBAR_TITLE };
  }

  const stops = facts.listEnabled && anyWallStops(facts.walls, site.walls) && !facts.allowed;

  return stops
    ? { icons: DETOUR_ICONS, title: stopTitle(site.domain) }
    : { icons: PLAIN_ICONS, title: loadTitle(site.domain) };
}

/** Writes one view to the toolbar. A badge of an older build is cleared here. */
export async function applyToolbar(view: ToolbarView): Promise<void> {
  await chrome.action.setIcon({ path: { ...view.icons } });
  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setTitle({ title: view.title });
}

/** Whether an allowance of any scope covers the site in this tab. */
function covered(
  allowances: AllowanceState,
  site: Pick<ListedSite, 'domain'>,
  tab: { id?: number; openerTabId?: number },
): boolean {
  if (allowsHost(allowances.allowAlways, site.domain)) {
    return true;
  }

  if (allowsHost(allowances.allowSession, site.domain)) {
    return true;
  }

  return (
    tab.id !== undefined && allowsTab(allowances.allowTabs, site.domain, tab.id, tab.openerTabId)
  );
}

/**
 * The page that the action answers for. A block page answers for the page that
 * it stopped, and only while the tab still holds the record of that stop, so the
 * detour stays on the toolbar when the block page replaces the article.
 */
async function actionPage(tab: { id?: number; url?: string }): Promise<string | null> {
  const url = tab.url;

  if (url === undefined) {
    return null;
  }

  if (!url.startsWith(chrome.runtime.getURL('block.html'))) {
    return url;
  }

  const stopped = originalUrl(new URL(url).search);

  if (stopped === null || !(await hasCapability(tab.id, stopped))) {
    return null;
  }

  return stopped;
}

/**
 * A newer refresh wins the race. A tab switch and a settings write can arrive
 * together, and the older read must not paint over the newer one.
 */
let latest = 0;

/**
 * Reads the settings, the list, the allowances, and the page in front of the
 * reader, then paints the toolbar. Every failure leaves the last state in place:
 * the toolbar is a hint and never a reason to drop an event.
 */
export async function refreshToolbar(): Promise<void> {
  const token = (latest += 1);

  try {
    const [settings, list, allowances, tabs] = await Promise.all([
      readSettings(),
      readList(),
      readAllowances(),
      chrome.tabs.query({ active: true, lastFocusedWindow: true }),
    ]);
    const tab = tabs[0];
    const page = tab === undefined ? null : await actionPage(tab);

    if (token !== latest) {
      return;
    }

    const site = page === null ? null : findListedSite(list, page);

    await applyToolbar(
      toolbarView({
        enabled: settings.enabled,
        listEnabled: !list.disabled,
        walls: settings.walls,
        site: site === null ? null : { domain: site.domain, walls: site.walls },
        allowed: site !== null && tab !== undefined && covered(allowances, site, tab),
      }),
    );
  } catch {
    // The last view stays. A read that fails is not a state of the toolbar.
  }
}
