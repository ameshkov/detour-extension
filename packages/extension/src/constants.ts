import { defaultWalls } from './walls';

/**
 * The request names of the message contract between the contexts.
 */
export const MESSAGE = {
  isBlocked: 'isBlocked',
  blocked: 'blocked',
  popupState: 'popupState',
  pageState: 'pageState',
  openRoute: 'openRoute',
  allow: 'allow',
  pass: 'pass',
  rememberScope: 'rememberScope',
  revoke: 'revoke',
  setSettings: 'setSettings',
  clearCache: 'clearCache',
} as const;

/**
 * The `chrome.storage` keys. `meta` and `alt` are prefixes: the whole key is the
 * prefix followed by the page digest. `capability` is a prefix too: the whole key
 * is the prefix followed by the tab id.
 */
export const STORAGE = {
  list: 'list',
  settings: 'settings',
  scopeDefaults: 'scopeDefaults',
  allowAlways: 'allowAlways',
  allowSession: 'allowSession',
  allowTabs: 'allowTabs',
  capability: 'capability:',
  pass: 'pass:',
  meta: 'meta:',
  alt: 'alt:',
} as const;

/**
 * The guard hides the document and waits this long for the worker before it
 * lets the page load. An idle worker answers in a few milliseconds, and a cold
 * one can take longer than 150 ms, so the budget covers that start. Only a
 * worker that never answers pays the rest of it, and the page still loads.
 */
export const GUARD_TIMEOUT_MS = 400;

/**
 * After the worker says the page stops, the guard waits this long for the
 * parser to pass `</head>`, so the card carries the description and the icon
 * that the head declares. A head that already closed costs none of it.
 */
export const META_HEAD_WAIT_MS = 150;

export const META_TTL_MS = 604800000;
export const META_MAX_ENTRIES = 500;
export const ALT_TTL_MS = 86400000;
export const ALT_TIMEOUT_MS = 15000;
export const ALT_MAX_ENTRIES = 200;
export const SLOW_NOTE_MS = 3000;
export const COUNTDOWN_TICK_MS = 1000;
export const AUTO_OPEN_COUNTDOWN_SECONDS = 3;
export const LIST_FETCH_TIMEOUT_MS = 5000;
export const LIST_REFRESH_PERIOD_MINUTES = 360;
export const LIST_REFRESH_ALARM = 'list-refresh';
export const LIST_STORAGE_VERSION = 2;
export const REPORT_ISSUE_URL = 'https://github.com/ameshkov/detour-extension/issues/new';

/** The most domains whose chosen scope the extension remembers. */
export const SCOPE_DEFAULTS_MAX = 100;

/**
 * The public site. The popup opens it for the explanation and the policy, and
 * the pages are built from this repository, so neither link depends on the
 * backend.
 */
export const SITE_URL = 'https://ameshkov.github.io/detour-extension/';
export const PRIVACY_URL = 'https://ameshkov.github.io/detour-extension/privacy.html';

export const DEFAULT_SETTINGS = {
  enabled: true,
  autoOpenBest: false,
  imagesEnabled: true,
  theme: 'system',
  walls: defaultWalls(),
} as const;
