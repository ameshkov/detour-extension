import type { WallCategory, WallType } from '@detour/shared';

import type { AllowanceScope } from './allowances';
import type { MatchKind } from './alternatives';
import type { SearchEngineKey } from './search-fallback';
import type { ThemeChoice } from './theme';

export const NO_URL_HEADLINE = 'This site puts a wall in front of this story';

/**
 * A block page without its tab record still knows the address. The line says
 * what is missing, and the link runs the guard again so the worker records a
 * fresh capability and the routes can load.
 */
export const NO_RECORD_NOTICE = "Detour has no record of this tab's article.";
export const NO_RECORD_LINK = 'Open the article again';
export const NO_RECORD_TAIL = 'to load its routes.';
export const NO_URL_NOTICE = 'This page has no address to answer for.';

/** The header counts the walls that the list records for the site. */
export function wallsDetected(count: number): string {
  return count === 1 ? '1 wall detected' : `${count} walls detected`;
}

/** The tab names the site, so one block page is easy to find among many tabs. */
export function pageTitle(siteName: string | null): string {
  return siteName === null ? 'Detour' : `Detour — ${siteName}`;
}

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
export const WALLS_LABEL = 'Walls on site';
export const WALLS_HINT = 'Click a badge for details';
export const ALTERNATIVES_HEADING = 'Alternative routes';
export const ALTERNATIVES_LOADING = 'Looking for the same story elsewhere…';
export const ALTERNATIVES_NONE = 'No alternatives found for this story';
export const ALTERNATIVES_FAILED =
  "The search did not finish. This is our problem, not the publisher's.";
export const NONE_DETAIL =
  'The search found no page that covers it, or every page it found is on the list too. You can look yourself, with the query we used.';
export const FAILED_DETAIL = 'Your query is ready below.';
export const RETRY_LABEL = 'Try again';
export const RETRY_EMPTY_LABEL = 'Try the search again';

// The source card
export const COPY_ADDRESS_LABEL = 'Copy address';
export const COPIED_ADDRESS_LABEL = 'Address copied';
export const COPY_FAILED_LABEL = 'The browser did not copy the address.';

export function resultsCount(n: number): string {
  return String(n);
}

/** The sentence behind the count, for its tooltip and its accessible name. The
 *  count includes the search card, so it names routes and not publishers. */
export function resultsLabel(n: number): string {
  return n === 1 ? '1 route to this story' : `${n} routes to this story`;
}

export type KeyboardHintPart = { text: string; key?: true };

/**
 * The keyboard line under the list, as its words and its keys. The digits stop
 * at nine, because a row carries one digit and no more. The renderer wraps a
 * part whose `key` is true in a key cap.
 */
export function keyboardHintParts(count: number): KeyboardHintPart[] {
  const last = Math.min(count, 9);
  const range: KeyboardHintPart[] =
    last <= 1
      ? [{ text: '1', key: true }]
      : [{ text: '1', key: true }, { text: '–' }, { text: String(last), key: true }];

  return [
    { text: 'Press ' },
    ...range,
    { text: ' or ' },
    { text: '↑↓', key: true },
    { text: ' + ' },
    { text: '↵', key: true },
    { text: ' to open an alternative' },
  ];
}

export function keyboardHint(count: number): string {
  return keyboardHintParts(count)
    .map((part) => part.text)
    .join('');
}

export const NO_WALLS_LABEL = 'No walls';

/** One line per match kind, and nothing for a page that the analysis could not place. */
const MATCH_LABELS: Record<Exclude<MatchKind, 'unknown'>, string> = {
  same_story: 'Same story',
  same_event: 'Same event',
  same_topic: 'Same topic',
  different: 'Different story',
};

export function matchLabel(match: MatchKind): string | null {
  return match === 'unknown' ? null : MATCH_LABELS[match];
}

/** The story of the article, under the routes that it found. */
export function topicLabel(topic: string): string {
  return `Topic: ${topic}`;
}

export const FALLBACK_HEADING = 'Search the same story elsewhere';
export const SEARCH_CARD_DETAIL = 'Pick an engine, or edit the query first.';
export const QUERY_LABEL = 'Search query';
/**
 * The keyboard line under the search box, as its words and its keys. The
 * renderer wraps a part whose `key` is true in a key cap.
 */
export function fallbackHintParts(): KeyboardHintPart[] {
  return [
    { text: 'Press ' },
    { text: '1', key: true },
    { text: '–' },
    { text: '4', key: true },
    { text: ' and ' },
    { text: '↵', key: true },
    { text: ' to search with an engine. ' },
    { text: '↑', key: true },
    { text: ' edits the query' },
  ];
}
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

/** The search a page without a title offers: the other publishers of its beat. */
export function sitesSimilarLabel(domain: string): string {
  return `Sites similar to ${domain}`;
}

export function openAnywayLabel(site: string): string {
  return `Open ${site} anyway`;
}

export const BACK_LABEL = 'Go back';
export const ESC_KEY = 'Esc';
export const ACTION_ERROR = 'Detour did not save the allowance. The site did not open.';
export const PASS_ERROR = 'Detour did not open the site. Try again.';
/** The one scope that writes no allowance, so the page is not allowlisted. */
export const ONCE_LABEL = 'Just once';
/** The menu sentence for the one scope that keeps no allowance. */
export const ONCE_DETAIL = 'One page, and no allowance is kept.';

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
  'The address of this page and its title go to our server to find alternatives. No account and no tracking.';

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
export const ENABLED_SWITCH_LABEL = 'Turn the list on or off';
export const POPUP_UNAVAILABLE = 'Detour could not read this page.';

/** A browser page is not a website, so the popup says what it needs instead. */
export const NO_SITE_NOTICE = 'Detour works on websites. Open a site, then press the icon again.';

/** The card says that the list does not know the site, in one plain sentence. */
export const SITE_NOT_LISTED = 'This site is not on the list';
/** The report is the sentence the block says, so the row carries the whole line. */
export const SITE_REPORT_HINT = 'If you see a wall here, report it.';
/** The search card of the popup has no field to edit, so it promises no edit. */
export const SEARCH_CARD_POPUP_DETAIL = 'Pick an engine.';

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

/** The same type as the expanded block names it in its badge. */
export const WALL_TYPE_BADGE: Record<WallType, string> = {
  hard: 'Hard block',
  soft: 'Soft wall',
  metered: 'Metered wall',
};

export const REPORT_WALL_LABEL = 'Report inaccurate wall detection';

/** The checked date of a site, in the list's own calendar form. */
export function verifiedOn(date: string): string {
  return `Verified ${date}`;
}

/** How the type presents a wall, in one sentence that follows its category. */
export const WALL_TYPE_DETAIL: Record<WallType, string> = {
  hard: 'The story stays out of reach until the reader pays, registers, accepts tracking, or turns the ad blocker off.',
  soft: 'A card covers the story, and the reader dismisses or defers it, so the story reads.',
  metered: 'The page limits the number of articles a reader can open.',
};

export const SETTINGS_LABEL = 'Settings';

export const HOW_IT_WORKS_LABEL = 'How it works';
export const PRIVACY_LABEL = 'Privacy';

// The toolbar
export const TOOLBAR_TITLE = 'Detour';
export const TOOLBAR_OFF_TITLE = 'Detour is off';

/** The tooltip of a page that the guard will stop, and of one that it lets load. */
export function stopTitle(domain: string): string {
  return `Detour will stop this page on ${domain}`;
}

export function loadTitle(domain: string): string {
  return `Detour will not stop this page on ${domain}`;
}

// The theme
export const THEME_SWITCH_DARK = 'Switch to the dark theme';
export const THEME_SWITCH_LIGHT = 'Switch to the light theme';
export const APPEARANCE_HEADING = 'Appearance';
export const THEME_SETTING_LABEL = 'Theme';
export const THEME_SETTING_DETAIL = 'Follow the system, or keep the pages light or dark.';
export const THEME_CHOICES: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

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
export const IMAGES_SETTING_LABEL = 'Show the publisher icons';
export const IMAGES_SETTING_DETAIL = 'The favicon of each publisher in the list of alternatives.';

// The options page, the cache
export const CACHE_HEADING = 'Cache';
export const CACHE_DETAIL =
  'The list, the page reads, and the answers the block page found. Clearing them costs one slow page and one list download.';
export const CLEAR_CACHE_LABEL = 'Clear cache';
/** The clear drops the list and waits for its download, so the press says it runs. */
export const CLEARING_LABEL = 'Clearing…';
export const CACHE_CONFIRM = 'Clear the cached list, the page reads, and the answers?';

export function cacheCleared(count: number): string {
  if (count === 0) {
    return 'There was nothing cached.';
  }

  return count === 1 ? 'Cleared 1 cached entry.' : `Cleared ${count} cached entries.`;
}
