import type { WallCategory, WallType } from '@detour/shared';

import type { AllowanceScope } from './allowances';
import type { PauseKind } from './pause';
import type { SearchEngineKey } from './search-fallback';

export const NO_URL_HEADLINE = 'This site puts a wall in front of this story';

const WALL_COUNTS: Record<number, string> = {
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
};

/**
 * The headline names the site and how many walls the list records for it. The
 * pills under it name the walls, so the sentence does not repeat a category, and
 * it stays true for an ad-blocker wall and a paywall alike. Without a site it
 * still says what happened, because a missing `?u` must not leave the page
 * without a title.
 */
export function headline(siteName: string | null, walls: number): string {
  if (siteName === null) {
    return NO_URL_HEADLINE;
  }

  return `${siteName} puts ${walls >= 2 ? `${WALL_COUNTS[walls] ?? walls} walls` : 'a wall'} in front of this story`;
}

/** The judgement belongs to the ad-blocker wall, so a page without one carries none. */
export const ANTI_USER_NOTE =
  'An ad-blocker wall is an anti-user practice: the site tries to control what software runs on your computer.';

// The guard
export const GUARD_LINK_LABEL = 'Open the Detour page';

// The block page
export const SOURCE_LABEL = 'You tried to open';
export const ALTERNATIVES_HEADING = 'Read this elsewhere';
export const ALTERNATIVES_LOADING = 'Looking for the same story elsewhere…';
export const ALTERNATIVES_NONE = 'No alternatives found for this story';
export const ALTERNATIVES_FAILED =
  "The search did not finish. This is our problem, not the publisher's.";
export const NONE_DETAIL =
  'The search found no page that covers it, or every page it found is on the list too. You can look yourself, with the query we used.';
export const FAILED_DETAIL = 'Your query is ready below.';
export const RETRY_LABEL = 'Try again';
export const RETRY_EMPTY_LABEL = 'Try the search again';

export function resultsCount(n: number): string {
  return n === 1 ? '1 publisher without a wall' : `${n} publishers without a wall`;
}

export const FALLBACK_HEADING = 'Search the same story elsewhere';
export const QUERY_LABEL = 'Search query';
export const FALLBACK_NOTE =
  'Opens a new tab on the engine you pick. Edit the query first if you want.';
export const SEARCH_ENGINE_NAMES: Record<SearchEngineKey, string> = {
  duckduckgo: 'DuckDuckGo',
  brave: 'Brave',
  google: 'Google',
  bing: 'Bing',
};
export const SLOW_NOTE = 'The search is still running.';
export const KEEP_WAITING_LABEL = 'Keep waiting';

export function openInsteadLabel(site: string): string {
  return `Open ${site} instead`;
}

export function openAnywayLabel(site: string): string {
  return `Open ${site} anyway`;
}

export const ACTION_ERROR = 'Detour did not save the allowance. The site did not open.';
export const PASS_ERROR = 'Detour did not open the site. Try again.';
/** The one scope that writes no allowance, so the page is not allowlisted. */
export const ONCE_LABEL = 'Just once';

export const SCOPE_LABEL: Record<AllowanceScope, string> = {
  tab: 'This tab',
  session: 'This site until restart',
  always: 'This site always',
};
export const SCOPE_DETAIL: Record<AllowanceScope, string> = {
  tab: 'This tab and the tabs it opens on this site, until you close it.',
  session: 'Until Chrome restarts.',
  always: 'Always, until you remove it.',
};
export const SCOPE_MENU_LABEL = 'Choose where to open the site';
export const REPORT_LABEL = 'Report a problem';
export const FOOTNOTE =
  'The address of this page and its title go to our server to find alternatives. No account, no cookies, no tracking.';

export function countdownText(domain: string): string {
  return `Opening ${domain} because it is the best match`;
}

export const STAY_LABEL = 'Stay here';

export function REPORT_ISSUE_TITLE(host: string | null): string {
  return host === null ? 'Block page problem' : `Block page problem on ${host}`;
}

export function reportIssueBody(input: {
  url: string | null;
  listId: string;
  extensionVersion: string;
}): string {
  const page = input.url === null ? [] : [`The page Detour stopped: ${input.url}`];
  const versions = [`List: ${input.listId}`, `Extension version: ${input.extensionVersion}`];

  return [...page, ...versions].join('\n');
}

// The popup
export const POPUP_ON = 'On';
export const POPUP_OFF = 'Off';
export const POPUP_PAUSED = 'Paused';
export const ENABLED_SWITCH_LABEL = 'Turn the list on or off';

export const SITE_LISTED = 'is on the list';
export const SITE_UNLISTED = 'is not on the list';
/** The report is the sentence the block says, so the link carries the whole line. */
export const SITE_REPORT_HINT = 'If you see a wall here, report it.';

/** The category of a wall, named as the list names it and never softened. */
export const WALL_CATEGORY_LABEL: Record<WallCategory, string> = {
  adblock: 'Ad blocker',
  paywall: 'Paywall',
  registration: 'Registration',
  consent: 'Consent',
  region: 'Region',
  vpn: 'VPN',
  age: 'Age check',
};

/** How the wall presents, in one word, for the second half of a pill. */
export const WALL_TYPE_LABEL: Record<WallType, string> = {
  hard: 'Hard',
  soft: 'Soft',
  metered: 'Metered',
};

export const SHOW_ALTERNATIVES_LABEL = 'Show alternatives';
export const SETTINGS_LABEL = 'Settings';

/** The row unfolds the durations, so it names the act and never a period it does not apply. */
export const PAUSE_ROW_LABEL = 'Pause the list';
export const PAUSE_MENU_LABEL = 'Choose how long to pause';
export const PAUSE_DURATION_LABELS: Record<PauseKind, string> = {
  '5m': '5 minutes',
  '30m': '30 minutes',
  '1h': '1 hour',
  today: 'Today',
  session: 'Until the browser restarts',
};
export const PAUSE_TODAY_NOTE = 'Until midnight';
export const RESUME_LABEL = 'Resume';

/**
 * The countdown under an hour reads minutes and seconds, and a pause that ends
 * after midnight keeps its hours, so the row never says 1380 minutes.
 */
export function pauseCountdown(remaining: number): string {
  const total = Math.max(0, Math.ceil(remaining / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock =
    hours === 0
      ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return `${clock} left`;
}

/** The paused row reports the remainder, or names the pause that has no clock. */
export function pausedRowLabel(remaining: number | null): string {
  return remaining === null
    ? `${POPUP_PAUSED} · until Chrome restarts`
    : `${POPUP_PAUSED} · ${pauseCountdown(remaining)}`;
}

export const HOW_IT_WORKS_LABEL = 'How it works';
export const PRIVACY_LABEL = 'Privacy';

// The options page
export const OPTIONS_HEADING = 'Settings';
export const ALLOWED_SITES = 'Allowed sites';
export const ALLOWED_SITES_INTRO =
  'Sites that you opened even though the list blocks them. The extension does not change these pages.';
export const NO_ALLOWANCES = 'No site is allowed.';
export const COLUMN_SITE = 'Site';
export const COLUMN_SCOPE = 'Scope';
export const COLUMN_ADDED = 'Added';
export const REMOVE_LABEL = 'remove';

/** The visible label is the same in every row, so the accessible name names the site. */
export function removeAllowanceLabel(host: string): string {
  return `Remove the allowance for ${host}`;
}

export const WALLS_HEADING = 'Walls to stop';
export const WALLS_INTRO =
  'Detour stops a page before it loads when the page has a ticked wall. The block page then offers the same story from other publishers.';
export const COLUMN_WHY = 'Why it appears';
export const WALL_CATEGORY_DETAIL: Record<WallCategory, string> = {
  adblock: 'The site asks readers to turn it off',
  paywall: 'The site asks for a subscription',
  registration: 'The site asks for an account',
  consent: 'The content waits for a cookie choice',
  region: 'The site refuses some countries',
  vpn: 'The site refuses VPN and proxy addresses',
  age: 'The site asks for an age',
};
export const METERED_NOTE = 'A dashed cell cannot be ticked: only a subscription limits a count.';
export const NO_WALL_NOTE = 'A page with no ticked wall loads as usual.';

/** The visible cell holds no text, so the accessible name names both the type and the category. */
export function wallCellLabel(category: WallCategory, type: WallType): string {
  return `${WALL_CATEGORY_LABEL[category]}, ${WALL_TYPE_LABEL[type].toLowerCase()} wall`;
}

export const READING_HEADING = 'Reading';
export const AUTO_OPEN_SETTING_LABEL = 'Open the best match automatically';
export const AUTO_OPEN_SETTING_DETAIL =
  'When the list is ready, open the first alternative after a 3-second countdown. You can stop it.';
export const IMAGES_SETTING_LABEL = 'Show the site images';
export const IMAGES_SETTING_DETAIL = 'Preview images and favicons in the list of alternatives.';

// The options page, the cache
export const CACHE_HEADING = 'Cache';
export const CACHE_DETAIL =
  'The list, the page reads, and the answers the block page found. Clearing them costs one slow page and one list download.';
export const CLEAR_CACHE_LABEL = 'Clear cache';
export const CACHE_CONFIRM = 'Clear the cached list, the page reads, and the answers?';

export function cacheCleared(count: number): string {
  if (count === 0) {
    return 'There was nothing cached.';
  }

  return count === 1 ? 'Cleared 1 cached entry.' : `Cleared ${count} cached entries.`;
}
