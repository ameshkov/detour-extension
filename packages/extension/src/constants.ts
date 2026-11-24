import { defaultWalls } from './walls';

/**
 * The eleven request names of the message contract between the contexts.
 */
export const MESSAGE = {
  isBlocked: 'isBlocked',
  blocked: 'blocked',
  getMeta: 'getMeta',
  getAlternatives: 'getAlternatives',
  showAlternatives: 'showAlternatives',
  allow: 'allow',
  pass: 'pass',
  revoke: 'revoke',
  setSettings: 'setSettings',
  pause: 'pause',
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
  pauseUntil: 'pauseUntil',
  pauseSession: 'pauseSession',
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
export const METADATA_TIMEOUT_MS = 4000;
export const METADATA_MAX_BYTES = 524288;
export const META_TTL_MS = 604800000;
export const META_MAX_ENTRIES = 500;
export const META_FAILURE_MEMO_MS = 60000;
export const ALT_TTL_MS = 86400000;
export const ALT_TIMEOUT_MS = 15000;
export const ALT_MAX_ENTRIES = 200;
export const SLOW_NOTE_MS = 3000;
export const COUNTDOWN_TICK_MS = 1000;
export const AUTO_OPEN_COUNTDOWN_SECONDS = 3;
export const PAUSE_DURATION_MS = 3600000;
export const LIST_FETCH_TIMEOUT_MS = 5000;
export const LIST_REFRESH_PERIOD_MINUTES = 360;
export const LIST_REFRESH_ALARM = 'list-refresh';
export const LIST_STORAGE_VERSION = 2;
export const REPORT_ISSUE_URL = 'https://github.com/ameshkov/detour-extension/issues/new';

export const DEFAULT_SETTINGS = {
  enabled: true,
  autoOpenBest: false,
  imagesEnabled: true,
  walls: defaultWalls(),
} as const;
