// @vitest-environment happy-dom
import type { SitesJson } from '@detour/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlternativesAnswer } from './alternatives';
import { requestAlternatives } from './alternatives';
import type { BlockPageOptions } from './block-page';
import { startBlockPage, stopBlockPage } from './block-page';
import { MESSAGE, STORAGE } from './constants';
import {
  ALTERNATIVES_FAILED,
  ALTERNATIVES_HEADING,
  ALTERNATIVES_LOADING,
  ALTERNATIVES_NONE,
  ANTI_USER_NOTE,
  COPIED_ADDRESS_LABEL,
  COPY_ADDRESS_LABEL,
  COPY_FAILED_LABEL,
  FAILED_DETAIL,
  FOOTNOTE,
  KEEP_WAITING_LABEL,
  NONE_DETAIL,
  NO_RECORD_LINK,
  NO_RECORD_NOTICE,
  NO_URL_HEADLINE,
  NO_URL_NOTICE,
  NO_WALLS_LABEL,
  ONCE_LABEL,
  RETRY_EMPTY_LABEL,
  REPORT_WALL_LABEL,
  RETRY_LABEL,
  SLOW_NOTE,
  SCOPE_LABEL,
  THEME_SWITCH_DARK,
  THEME_SWITCH_LIGHT,
  BACK_LABEL,
  ESC_KEY,
  WALLS_HINT,
  WALL_TYPE_DETAIL,
  countdownText,
  headline,
  keyboardHint,
  openAnywayLabel,
  openInsteadLabel,
  resultsLabel,
  topicLabel,
} from './copy';
import type { PageMeta } from './metadata';
import { pageView } from './state-view';
import type { FetchLike } from './net';
import { SEARCH_ENGINES, engineUrl } from './search-fallback';
import { readList, readListId, readSettings, writeStoredList } from './storage';
import { readScopeDefaults } from './scope-defaults';
import { defaultWalls } from './walls';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import { installFramedWindow, restoreWindowTop } from './testing/frame';
import { mountShell, readShell, role } from './testing/shell';

const API_BASE = 'https://api.test';
const URL = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';
const COMPACT_URL = 'cnet.com/tech/services-and-software/best-ai-image-generators/';
const FORBES_URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';
const NOW = 1_700_000_000_000;

const SHELL = readShell('block.html');

const META: PageMeta = {
  title: 'Best AI Image Generators of 2026',
  description: 'Everything you need to pick the right AI for your project and budget.',
  icon: null,
};

const ANSWER: AlternativesAnswer = {
  query: 'Best AI Image Generators 2026',
  degraded: false,
  provider: 'ceramic',
  topic: 'AI image generators',
  alternatives: [
    {
      url: 'https://arstechnica.com/gadgets/2026/10/ai-image-tools-compared/',
      title: 'The best AI image generators, compared',
      description: 'We tested every tool that asks for your money.',
      domain: 'arstechnica.com',
      image: 'https://detour-api.invalid/v1/img?u=a&sig=b',
      match: 'same_story',
    },
    {
      url: 'https://www.theverge.com/ai-image-tools-ranked/',
      title: 'AI image tools, ranked',
      description: 'A second look at the same tools.',
      domain: 'theverge.com',
      match: 'different',
    },
  ],
};

const STORED_ID = 'a'.repeat(64);

const HARD_LIST: SitesJson = {
  disabled: false,
  avoid: [],
  prefer: [],
  sites: [
    {
      domain: 'forbes.com',
      name: 'Forbes',
      verified: '2026-11-12',
      walls: [{ category: 'adblock', type: 'hard' }],
      paths: [],
      note: 'Full-page wall for readers with an ad blocker.',
      avoid: [],
      prefer: [],
    },
  ],
};

const TWO_WALL_LIST: SitesJson = {
  ...HARD_LIST,
  sites: [
    {
      ...HARD_LIST.sites[0]!,
      walls: [
        { category: 'adblock', type: 'soft' },
        { category: 'paywall', type: 'metered' },
      ],
    },
  ],
};

const PAYWALL_LIST: SitesJson = {
  ...HARD_LIST,
  sites: [{ ...HARD_LIST.sites[0]!, walls: [{ category: 'paywall', type: 'hard' }] }],
};

type FetchCall = { input: string; init?: RequestInit };

let fake: FakeChrome;

function searchFor(url: string): string {
  return `?u=${encodeURIComponent(url)}`;
}

/** The head the worker kept for the stopped page, or a failure the case injects. */
let metaForPage: (() => unknown) | null = null;

/**
 * The service worker's one answer. The test drives the same backend request
 * through the state that the real page asks for, so a case controls the network
 * with one fetch stub and one metadata value.
 */
function installAnswer(fetchImpl: FetchLike): void {
  fake.respond(MESSAGE.pageState, async (message) => {
    const { url } = message as { url: string };
    const raw = metaForPage === null ? null : await metaForPage();
    const meta = (raw as { meta?: PageMeta | null } | null)?.meta ?? null;
    const list = await readList();
    const settings = await readSettings();
    const scopeDefaults = await readScopeDefaults();
    const answer = await requestAlternatives({
      apiBase: API_BASE,
      url,
      title: meta?.title ?? '',
      fetchImpl,
    });

    return {
      ok: true,
      state: {
        settings,
        view: pageView({
          url,
          list,
          listId: await readListId(),
          settings,
          scopeDefaults,
          meta,
          answer,
        }),
      },
    };
  });
}

function startPage(
  search: string,
  fetchImpl: FetchLike,
  _now = NOW,
  extra: Partial<BlockPageOptions> = {},
): Promise<void> {
  installAnswer(fetchImpl);

  return startBlockPage({ search, ...extra });
}

function start(
  url: string,
  fetchImpl: FetchLike,
  now = NOW,
  extra: Partial<BlockPageOptions> = {},
): Promise<void> {
  return startPage(searchFor(url), fetchImpl, now, extra);
}

function press(name: string): void {
  role(name).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pressKey(key: string): void {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

function rows(): HTMLLIElement[] {
  return [...role('list').querySelectorAll<HTMLLIElement>('li')];
}

function messagesOfType(type: string): unknown[] {
  return fake.calls.messages.filter((message) => (message as { type?: string }).type === type);
}

function queryField(): HTMLInputElement {
  const field = role('query');

  if (!(field instanceof HTMLInputElement)) {
    throw new Error('the shell has no query field');
  }

  return field;
}

function editQuery(text: string): void {
  queryField().value = text;
  queryField().dispatchEvent(new Event('input'));
}

function engineLinks(): HTMLAnchorElement[] {
  return [...role('engines').querySelectorAll<HTMLAnchorElement>('a')];
}

function answerFetch(calls: FetchCall[], body: unknown, status = 200): FetchLike {
  return async (input, init) => {
    calls.push({ input, init });

    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function pendingFetch(calls: FetchCall[]): FetchLike {
  return (input, init) => {
    calls.push({ input, init });

    return new Promise<Response>(() => {
      // A request that never settles: the list area is still waiting.
    });
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

/**
 * The note starts after the storage read, so a fake-timer case waits for the
 * state that the read renders. A single empty drain lets a slow runner advance
 * the clock past a page that has not started, and the note then missed its
 * window. The open control is the last thing that the read renders, and the
 * note starts right after it, in the same synchronous block.
 */
async function drainStart(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await vi.advanceTimersByTimeAsync(0);

    if (!role('open-group').hidden) {
      return;
    }

    await Promise.resolve();
  }
}

function answerMeta(meta: PageMeta | null = META): void {
  metaForPage = () => ({ ok: true, meta });
}

beforeEach(() => {
  metaForPage = null;
  fake = installFakeChrome();
  fake.respond('allow', () => ({
    ok: true,
    allowances: { allowAlways: [], allowSession: [], allowTabs: [] },
  }));
  mountShell(SHELL);
});

afterEach(() => {
  stopBlockPage();
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreWindowTop();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeChoice;
  resetFakeChrome();
});

describe('the block page shell', { timeout: 20_000 }, () => {
  it('carries the shell the script fills', () => {
    // The parsed copy drops the stylesheet link, which this environment cannot load.
    const shell = new DOMParser().parseFromString(SHELL.replace(/<link[^>]*>/g, ''), 'text/html');
    const roles = [
      'canvas',
      'card',
      'header',
      'mark',
      'wordmark',
      'wall-status',
      'header-sep',
      'wall-status-dot',
      'wall-status-text',
      'headline',
      'walls',
      'walls-row',
      'walls-label',
      'walls-hint',
      'walls-detail',
      'lede',
      'source',
      'source-text',
      'source-tile',
      'source-title',
      'source-address',
      'source-description',
      'copy',
      'copy-status',
      'open-group',
      'alternatives',
      'list-head',
      'alternatives-heading',
      'count',
      'status',
      'detail',
      'list',
      'search',
      'search-icon',
      'search-body',
      'search-title',
      'search-detail',
      'search-action',
      'search-key',
      'search-arrow',
      'keyboard-hint',
      'fallback',
      'fallback-heading',
      'query-label',
      'query',
      'engines',
      'fallback-note',
      'slow-note',
      'slow-text',
      'open-instead',
      'keep-waiting',
      'countdown',
      'countdown-number',
      'countdown-text',
      'countdown-cancel',
      'retry-row',
      'retry',
      'actions',
      'actions-start',
      'actions-end',
      'back',
      'back-label',
      'back-key',
      'open-site',
      'open-menu',
      'open-menu-label',
      'note',
      'scope-menu',
      'scope-once',
      'scope-tab',
      'scope-session',
      'scope-always',
      'action-error',
      'report',
      'footnote',
      'theme',
    ];
    const closed = [
      'note',
      'search',
      'wall-status',
      'fallback',
      'fallback-note',
      'slow-note',
      'countdown',
      'retry-row',
      'actions',
      'open-group',
      'scope-menu',
      'action-error',
    ];

    for (const name of roles) {
      expect(shell.querySelector(`[data-role="${name}"]`), name).not.toBeNull();
    }

    for (const name of closed) {
      expect(shell.querySelector(`[data-role="${name}"]`)?.hasAttribute('hidden'), name).toBe(true);
    }

    expect(shell.querySelector('[data-role="alternatives"]')?.getAttribute('data-state')).toBe(
      'loading',
    );

    // The countdown sits under the list head, above the rows, so the reader sees
    // it without a scroll.
    const countdown = shell.querySelector('[data-role="countdown"]');
    const listHead = shell.querySelector('[data-role="list-head"]');
    const list = shell.querySelector('[data-role="list"]');

    expect(countdown).not.toBeNull();
    expect(list).not.toBeNull();
    expect(
      countdown!.compareDocumentPosition(listHead!) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(
      countdown!.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const images = shell.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(shell.querySelector('[data-role="mark"] img')).toBe(images[0]);
    expect(images[0]?.getAttribute('src')).toBe('logo-mark.png');
    expect(images[0]?.getAttribute('alt')).toBe('');
    expect(shell.title).toBe('Detour');
    expect(SHELL).toContain('<link rel="stylesheet" href="ui.css" />');
    expect(SHELL).toContain('block.js');
    expect(SHELL.indexOf('block.js')).toBeGreaterThan(SHELL.indexOf('data-role="list"'));
  });

  it('renders the explanation before it asks for anything', async () => {
    const store = deferred<Record<string, unknown>>();
    const meta = deferred<unknown>();
    const calls: FetchCall[] = [];
    const read = fake.storage.local.get.bind(fake.storage.local);

    fake.storage.local.get = () => store.promise;
    metaForPage = () => meta.promise;

    const running = start(URL, answerFetch(calls, ANSWER));

    expect(role('lede').hidden).toBe(true);
    expect(role('walls').hidden).toBe(true);
    expect(role('alternatives-heading').textContent).toBe(ALTERNATIVES_HEADING);
    expect(role('source-address').tagName).toBe('P');
    expect(role('source-address').textContent).toBe(COMPACT_URL);
    expect(role('source-address').getAttribute('href')).toBeNull();
    expect(role('source-address').getAttribute('title')).toBeNull();
    expect(role('status').textContent).toBe(ALTERNATIVES_LOADING);
    expect(calls).toHaveLength(0);
    expect(messagesOfType(MESSAGE.pageState)).toHaveLength(1);

    fake.storage.local.get = read;
    store.resolve({});
    meta.resolve(META);

    await running;
  });

  it('does nothing when a foreign page frames it', async () => {
    installFramedWindow();

    const calls: FetchCall[] = [];

    await start(URL, answerFetch(calls, ANSWER));

    expect(role('headline').textContent).toBe('');
    expect(role('lede').textContent).toBe('');
    expect(role('walls').hidden).toBe(true);
    expect(role('actions').hidden).toBe(true);
    expect(calls).toHaveLength(0);
    expect(fake.calls.messages).toHaveLength(0);
  });

  it('renders the footnote from the bundled page', async () => {
    const store = deferred<Record<string, unknown>>();
    const calls: FetchCall[] = [];
    const read = fake.storage.local.get.bind(fake.storage.local);

    fake.storage.local.get = () => store.promise;

    const running = start(URL, answerFetch(calls, ANSWER));

    expect(role('footnote').textContent).toBe(FOOTNOTE);
    expect(calls).toHaveLength(0);
    expect(messagesOfType(MESSAGE.pageState)).toHaveLength(1);

    fake.storage.local.get = read;
    store.resolve({});

    await running;
  });

  it('names the site, its walls, and the judgement', async () => {
    await writeStoredList(NOW, HARD_LIST, STORED_ID);
    answerMeta(null);

    await start(FORBES_URL, answerFetch([], ANSWER));

    const chips = role('walls').querySelectorAll('[data-role="wall"]');

    expect(role('headline').textContent).toBe(headline('Forbes', 1));
    expect(chips).toHaveLength(1);
    expect(role('walls').textContent).toContain('Ad blocker');
    expect(role('walls').textContent).not.toContain('Hard');
    expect(role('walls').hidden).toBe(false);
    expect(role('wall-status-text').textContent).toBe('1 wall detected');
    expect(role('wall-status').hidden).toBe(false);
    expect(role('lede').textContent).toBe(ANTI_USER_NOTE);
    expect(role('lede').hidden).toBe(false);
  });

  it('draws one pill per wall and counts them in the headline', async () => {
    await writeStoredList(NOW, TWO_WALL_LIST, STORED_ID);
    answerMeta(null);

    await start(FORBES_URL, answerFetch([], ANSWER));

    const chips = role('walls').querySelectorAll('[data-role="wall"]');

    expect(chips).toHaveLength(2);
    expect(role('headline').textContent).toBe('Forbes puts two walls in front of this story');
    expect(role('wall-status-text').textContent).toBe('2 walls detected');
    expect(role('walls').textContent).toContain('Paywall');
    expect(role('walls').textContent).not.toContain('Metered');
  });

  it('opens the description of a wall from its pill', async () => {
    await writeStoredList(NOW, TWO_WALL_LIST, STORED_ID);
    answerMeta(null);

    await start(FORBES_URL, answerFetch([], ANSWER));

    const chips = role('walls').querySelectorAll<HTMLButtonElement>('[data-role="wall"]');

    expect(chips).toHaveLength(2);
    expect(chips[0]?.tagName).toBe('BUTTON');
    expect(role('walls-hint').textContent).toBe(WALLS_HINT);
    expect(role('walls-detail').hidden).toBe(true);

    chips[1]?.click();

    const note = TWO_WALL_LIST.sites[0]?.note ?? '';

    expect(role('walls-detail').hidden).toBe(false);
    expect(role('wall-detail-text').textContent).toBe(note);
    expect(role('wall-detail-title').textContent).toContain('Paywall');
    expect(role('wall-type-badge').textContent).toBe('Metered wall');
    expect(role('wall-type-badge').getAttribute('title')).toBe(WALL_TYPE_DETAIL.metered);
    expect(role('wall-verified').textContent).toBe('Verified 2026-11-12');
    expect(role('wall-detail-icon').querySelector('svg')).not.toBeNull();
    expect(chips[1]?.getAttribute('aria-expanded')).toBe('true');
    expect(chips[0]?.getAttribute('aria-expanded')).toBe('false');

    const wallReport = role('walls-detail').querySelector<HTMLAnchorElement>(
      '[data-role="wall-report"]',
    );
    const noteReport = role('report');

    if (noteReport instanceof HTMLAnchorElement && noteReport.getAttribute('href') !== null) {
      expect(wallReport?.getAttribute('href')).toBe(noteReport.getAttribute('href'));
      expect(wallReport?.textContent).toBe(REPORT_WALL_LABEL);
    } else {
      expect(wallReport).toBeNull();
    }

    chips[0]?.click();

    expect(role('wall-detail-text').textContent).toBe(note);
    expect(role('wall-detail-title').textContent).toContain('Ad blocker');
    expect(role('wall-type-badge').textContent).toBe('Soft wall');
    expect(chips[1]?.getAttribute('aria-expanded')).toBe('false');
    expect(chips[0]?.getAttribute('aria-expanded')).toBe('true');

    chips[0]?.click();

    expect(role('walls-detail').hidden).toBe(true);
  });

  it('draws the wall of a soft entry', async () => {
    answerMeta(null);

    await start(URL, answerFetch([], ANSWER));

    expect(role('headline').textContent).toBe(headline('CNET', 1));
    expect(role('walls').textContent).toBe('Ad blocker');
  });

  it('judges no page that carries no ad-blocker wall', async () => {
    await writeStoredList(NOW, PAYWALL_LIST, STORED_ID);
    answerMeta(null);

    await start(FORBES_URL, answerFetch([], ANSWER));

    expect(role('walls').textContent).toBe('Paywall');
    expect(role('lede').textContent).toBe('');
    expect(role('lede').hidden).toBe(true);
  });

  it('renders the general explanation without a url', async () => {
    const calls: FetchCall[] = [];

    await startPage('', answerFetch(calls, ANSWER));

    expect(role('headline').textContent).toBe(NO_URL_HEADLINE);
    expect(role('lede').hidden).toBe(true);
    expect(role('walls').hidden).toBe(true);
    expect(role('source-address').textContent).toBe('');
    expect(role('source').hidden).toBe(true);
    expect(role('wall-status').hidden).toBe(true);
    expect(fake.calls.messages).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('hides the actions without a url', async () => {
    await startPage('', answerFetch([], ANSWER));

    expect(role('actions').hidden).toBe(true);
    expect(role('alternatives').hidden).toBe(true);
  });

  it('keeps a non-web url as text without a link', async () => {
    const unsafe = 'javascript:alert(1)';

    answerMeta(null);

    await startPage(searchFor(unsafe), answerFetch([], ANSWER));

    expect(role('source-address').textContent).toBe(unsafe);
    expect(role('source-address').getAttribute('href')).toBeNull();
    expect(role('source').hidden).toBe(false);
  });

  it('names the stopped page from the metadata', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(role('source-title').textContent).toBe(META.title);
    expect(role('source-description').textContent).toBe(META.description);
    expect(role('source-description').hidden).toBe(false);
    expect(role('source-address').textContent).toBe(COMPACT_URL);
    expect(role('source-text').childElementCount).toBe(3);
    expect(role('source').querySelector('img')).toBeNull();
  });

  it('takes the icon of the stopped page when the icons are on', async () => {
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };
    answerMeta({ ...META, icon: 'https://www.cnet.com/icon-192.png' });

    await start(URL, answerFetch([], ANSWER));

    const image = role('source').querySelector<HTMLImageElement>('[data-role="source-icon"]');

    expect(image?.src).toBe('https://www.cnet.com/icon-192.png');
    expect(image?.alt).toBe('');
    expect(image?.referrerPolicy).toBe('no-referrer');

    // The letter holds the tile until the icon has arrived, so a slow publisher
    // never leaves an empty square in the card.
    expect(role('source-tile').textContent).toBe('C');
    expect(role('source-tile').dataset.icon).toBeUndefined();

    Object.defineProperty(image, 'naturalWidth', { value: 192, configurable: true });
    image?.dispatchEvent(new Event('load'));

    expect(role('source-tile').dataset.icon).toBe('true');
    expect(role('source-tile').textContent).toBe('');
  });

  it('keeps the letter tile while the icons are off', async () => {
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: false,
    };
    answerMeta({ ...META, icon: 'https://www.cnet.com/favicon.ico' });

    await start(URL, answerFetch([], ANSWER));

    expect(role('source').querySelector('img')).toBeNull();
    expect(role('source-tile').textContent).toBe('C');
    expect(role('source-tile').dataset.icon).toBeUndefined();
  });

  it('returns the letter when the icon fails to load', async () => {
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };
    answerMeta({ ...META, icon: 'https://www.cnet.com/broken.ico' });

    await start(URL, answerFetch([], ANSWER));

    const image = role('source').querySelector<HTMLImageElement>('[data-role="source-icon"]');

    image?.dispatchEvent(new Event('error'));

    expect(role('source').querySelector('img')).toBeNull();
    expect(role('source-tile').textContent).toBe('C');
    expect(role('source-tile').dataset.icon).toBeUndefined();
    expect(role('source-tile').style.backgroundColor).not.toBe('');
  });

  it('returns the letter when the icon is smaller than the tile', async () => {
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };
    // CNET and ZDNET serve a 16 px, fully transparent file at `/favicon.ico`,
    // which is the icon a page names none gets: a blank square with it.
    answerMeta({ ...META, icon: 'https://www.cnet.com/favicon.ico' });

    await start(URL, answerFetch([], ANSWER));

    const image = role('source').querySelector<HTMLImageElement>('[data-role="source-icon"]');

    Object.defineProperty(image, 'naturalWidth', { value: 16, configurable: true });
    image?.dispatchEvent(new Event('load'));

    expect(role('source').querySelector('img')).toBeNull();
    expect(role('source-tile').textContent).toBe('C');
    expect(role('source-tile').dataset.icon).toBeUndefined();
    expect(role('source-tile').style.backgroundColor).not.toBe('');
  });

  it('holds the icon until it has loaded', async () => {
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };
    answerMeta({ ...META, icon: 'https://www.cnet.com/icon-192.png' });

    await start(URL, answerFetch([], ANSWER));

    const image = role('source').querySelector<HTMLImageElement>('[data-role="source-icon"]');

    expect(image?.hidden).toBe(true);
    expect(role('source-tile').textContent).toBe('C');
  });

  it('keeps an icon that fills the tile', async () => {
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };
    answerMeta({ ...META, icon: 'https://www.cnet.com/icon-192.png' });

    await start(URL, answerFetch([], ANSWER));

    const image = role('source').querySelector<HTMLImageElement>('[data-role="source-icon"]');

    Object.defineProperty(image, 'naturalWidth', { value: 192, configurable: true });
    image?.dispatchEvent(new Event('load'));

    expect(role('source').querySelector('img')).toBe(image);
    expect(role('source-tile').dataset.icon).toBe('true');
  });

  it('hides a title that only repeats the address', async () => {
    answerMeta({ ...META, title: 'cnet.com' });

    await start(URL, answerFetch([], ANSWER));

    expect(role('source-title').textContent).toBe('');
    expect(role('source-title').hidden).toBe(true);
  });

  it('keeps the title of the story', async () => {
    answerMeta({ ...META, title: 'Best AI Image Generators of 2026' });

    await start(URL, answerFetch([], ANSWER));

    expect(role('source-title').textContent).toBe('Best AI Image Generators of 2026');
    expect(role('source-title').hidden).toBe(false);
  });

  it('hides the description when the page names none', async () => {
    answerMeta({ ...META, description: null });

    await start(URL, answerFetch([], ANSWER));

    expect(role('source-description').hidden).toBe(true);
    expect(role('source-description').textContent).toBe('');
  });

  it('copies the whole address from the source card', async () => {
    vi.useFakeTimers();

    const written: string[] = [];

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    answerMeta();

    await start(URL, answerFetch([], ANSWER));
    press('copy');
    await vi.advanceTimersByTimeAsync(0);

    expect(written).toEqual([URL]);
    expect(role('copy').dataset.copied).toBe('true');
    expect(role('copy').getAttribute('aria-label')).toBe(COPIED_ADDRESS_LABEL);
    expect(role('copy-status').textContent).toBe(COPIED_ADDRESS_LABEL);

    await vi.advanceTimersByTimeAsync(2100);

    expect(role('copy').dataset.copied).toBeUndefined();
    expect(role('copy').getAttribute('aria-label')).toBe(COPY_ADDRESS_LABEL);
    expect(role('copy-status').textContent).toBe('');
  });

  it('reports an address that the browser refuses to copy', async () => {
    vi.useFakeTimers();

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });
    answerMeta();

    await start(URL, answerFetch([], ANSWER));
    press('copy');
    await vi.advanceTimersByTimeAsync(0);

    expect(role('copy-status').textContent).toBe(COPY_FAILED_LABEL);
    expect(role('copy').dataset.copied).toBeUndefined();
  });

  it('names the site in the tab', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(document.title).toBe('Detour — CNET');
  });

  it('renders the card with the url only when the metadata fails', async () => {
    metaForPage = () => {
      throw new Error('the worker is asleep');
    };

    await start(URL, answerFetch([], ANSWER));

    expect(role('source-address').textContent).toBe(COMPACT_URL);
    expect(role('source-title').textContent).toBe('');
  });

  it('keeps the url-only card when the worker does not answer', async () => {
    resetFakeChrome();

    await startBlockPage({ search: searchFor(URL) });

    expect(role('source-address').textContent).toBe(COMPACT_URL);
    expect(role('source-title').textContent).toBe('');
    expect(role('alternatives').hidden).toBe(true);
    expect(role('actions').hidden).toBe(true);
  });

  it('paints the shell before the state arrives', async () => {
    const meta = deferred<unknown>();
    const answer = deferred<Response>();

    metaForPage = () => meta.promise;

    const running = start(URL, () => answer.promise);

    expect(role('source-title').textContent).toBe('');
    expect(role('status').textContent).toBe(ALTERNATIVES_LOADING);
    expect(role('list').querySelectorAll('li')).toHaveLength(0);

    meta.resolve({ ok: true, meta: META });
    answer.resolve(
      new Response(JSON.stringify(ANSWER), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await running;

    expect(role('source-title').textContent).toBe(META.title);
    expect(role('status').textContent).toBe('');
  });

  it('keeps the letter tiles when the icon setting is off', async () => {
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: false,
    };
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(role('list').querySelectorAll('li')).toHaveLength(2);
    expect(role('list').querySelectorAll('img')).toHaveLength(0);
  });

  it('renders the alternatives', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    const rows = role('list').querySelectorAll('li');
    const first = ANSWER.alternatives[0]!;

    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('a')?.getAttribute('href')).toBe(first.url);
    expect(rows[0]?.querySelector('[data-role="result-title"]')?.textContent).toBe(first.title);
    expect(rows[0]?.textContent).toContain(first.domain);
    expect(rows[0]?.textContent).toContain(first.description);
    expect(role('status').textContent).toBe('');
  });

  it('checks the alternatives against the list in use', async () => {
    await writeStoredList(NOW, { ...HARD_LIST, sites: [] }, STORED_ID);
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    const badges = [...role('list').querySelectorAll<HTMLElement>('[data-role="result-walls"]')];

    expect(badges).toHaveLength(ANSWER.alternatives.length);

    for (const badge of badges) {
      expect(badge.textContent).toBe(NO_WALLS_LABEL);
    }
  });

  it('asks for similar sites when the page names no title', async () => {
    answerMeta({ ...META, title: '' });

    await start(URL, answerFetch([], ANSWER));
    press('search');

    expect(queryField().value).toBe('Sites similar to cnet.com');
    expect(engineLinks()[0]?.getAttribute('href')).toContain(
      encodeURIComponent('Sites similar to cnet.com'),
    );
  });

  it('writes an answer value as text and never as markup', async () => {
    const malicious = {
      ...ANSWER,
      alternatives: [
        {
          url: 'https://a.test/one',
          title: '<img src=x onerror="alert(1)">',
          description: 'A description',
          domain: 'a.test',
        },
      ],
    };

    answerMeta();

    await start(URL, answerFetch([], malicious));

    expect(role('list').querySelector('[data-role="result-title"]')?.textContent).toBe(
      '<img src=x onerror="alert(1)">',
    );
    expect(role('list').querySelector('img')).toBeNull();
  });

  it('writes no key of its own', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(Object.keys(fake.storage.local.values)).toHaveLength(0);
    expect(Object.keys(fake.storage.session.values)).toHaveLength(0);
  });

  it('does not cache a degraded answer', async () => {
    const degraded = { ...ANSWER, degraded: true, alternatives: [] };
    const calls: FetchCall[] = [];

    answerMeta();

    await start(URL, answerFetch(calls, degraded));

    expect(Object.keys(fake.storage.local.values)).toHaveLength(0);

    mountShell(SHELL);
    await start(URL, answerFetch(calls, degraded));

    expect(calls).toHaveLength(2);
  });

  it('shows the failure text for a degraded answer', async () => {
    answerMeta();

    await start(URL, answerFetch([], { ...ANSWER, degraded: true, alternatives: [] }));

    expect(role('status').textContent).toBe(ALTERNATIVES_FAILED);
    expect(role('list').children).toHaveLength(0);

    mountShell(SHELL);
    await start(URL, answerFetch([], { ...ANSWER, degraded: true }));

    expect(role('status').textContent).toBe(ALTERNATIVES_FAILED);
  });

  it('shows the failure text when the worker is unavailable', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('the reader is offline');
    };

    answerMeta();

    await start(URL, fetchImpl);

    expect(role('status').textContent).toBe(ALTERNATIVES_FAILED);
  });

  it('shows the failure text for a non-200 answer', async () => {
    answerMeta();

    await start(URL, answerFetch([], { error: 'provider_error' }, 502));

    expect(role('status').textContent).toBe(ALTERNATIVES_FAILED);
  });

  it('shows the empty state for zero alternatives', async () => {
    answerMeta();

    await start(URL, answerFetch([], { ...ANSWER, alternatives: [] }));

    expect(role('alternatives').dataset.state).toBe('empty');
    expect(role('status').textContent).toBe(ALTERNATIVES_NONE);
    expect(role('detail').textContent).toBe(NONE_DETAIL);
    expect(role('fallback').hidden).toBe(false);
    expect(role('retry-row').hidden).toBe(false);
    expect(role('retry').textContent).toBe(RETRY_EMPTY_LABEL);
  });

  it('shows the error state without an answer', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('the reader is offline');
    };

    answerMeta();

    await start(URL, fetchImpl);

    expect(role('alternatives').dataset.state).toBe('error');
    expect(role('status').textContent).toBe(ALTERNATIVES_FAILED);
    expect(role('detail').textContent).toBe(FAILED_DETAIL);
    expect(role('fallback').hidden).toBe(false);
    expect(role('retry-row').hidden).toBe(false);
    expect(role('retry').textContent).toBe(RETRY_LABEL);
  });

  it('retries a failed search once', async () => {
    const calls: FetchCall[] = [];
    let attempt = 0;
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ input, init });
      attempt += 1;

      return attempt === 1
        ? new Response(JSON.stringify({ error: 'provider_error' }), {
            status: 502,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(JSON.stringify(ANSWER), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
    };

    answerMeta();

    await start(URL, fetchImpl);

    expect(role('alternatives').dataset.state).toBe('error');

    press('retry');

    await vi.waitFor(() => {
      expect(role('list').querySelectorAll('li')).toHaveLength(2);
    });

    expect(role('alternatives').dataset.state).toBe('results');
    expect(calls).toHaveLength(2);
  });

  it('ignores a second press while the search runs', async () => {
    const calls: FetchCall[] = [];
    let attempt = 0;
    const fetchImpl: FetchLike = (input, init) => {
      calls.push({ input, init });
      attempt += 1;

      if (attempt === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'provider_error' }), {
            status: 502,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      return new Promise<Response>(() => {
        // A second request that never settles: the search is still running.
      });
    };

    answerMeta();

    await start(URL, fetchImpl);

    press('retry');

    await vi.waitFor(() => {
      expect(calls).toHaveLength(2);
    });

    press('retry');

    expect(calls).toHaveLength(2);
  });

  it('opens the first result with enter', async () => {
    const opened: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, { navigate: (url) => opened.push(url) });

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(opened).toEqual([ANSWER.alternatives[0]!.url]);
  });

  it('opens a result from its digit', async () => {
    const opened: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, { navigate: (url) => opened.push(url) });
    pressKey('2');

    expect(opened).toEqual([ANSWER.alternatives[1]!.url]);
    expect(rows()[1]?.dataset.selected).toBe('true');
  });

  it('starts the selection from a control that holds the focus', async () => {
    const opened: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, { navigate: (url) => opened.push(url) });

    const control = role('theme');

    control.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );

    expect(rows()[0]?.dataset.selected).toBe('true');

    control.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

    expect(opened).toHaveLength(0);
  });

  it('moves the selection with the arrows and opens it with enter', async () => {
    const opened: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, { navigate: (url) => opened.push(url) });

    pressKey('ArrowDown');

    expect(rows()[0]?.dataset.selected).toBe('true');
    expect(rows()[1]?.dataset.selected).toBeUndefined();

    pressKey('ArrowDown');

    expect(rows()[0]?.dataset.selected).toBeUndefined();
    expect(rows()[1]?.dataset.selected).toBe('true');

    pressKey('Enter');

    expect(opened).toEqual([ANSWER.alternatives[1]!.url]);
  });

  it('moves the selection into the search card and back', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    pressKey('ArrowDown');
    pressKey('ArrowDown');
    pressKey('ArrowDown');

    expect(rows()[1]?.dataset.selected).toBeUndefined();
    expect(role('search').dataset.selected).toBe('true');

    // The search card is the last stop, so a further press stays on it.
    pressKey('ArrowDown');

    expect(role('search').dataset.selected).toBe('true');

    pressKey('ArrowUp');

    expect(role('search').dataset.selected).toBeUndefined();
    expect(rows()[1]?.dataset.selected).toBe('true');
  });

  it('opens the search card with enter', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    pressKey('ArrowDown');
    pressKey('ArrowDown');
    pressKey('ArrowDown');
    pressKey('Enter');

    expect(role('search').hidden).toBe(true);
    expect(role('search').dataset.selected).toBeUndefined();
    expect(role('fallback').hidden).toBe(false);
    expect(document.activeElement).toBe(engineLinks()[0]);
  });

  it('opens the search card from its digit', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    pressKey('3');

    expect(role('search').hidden).toBe(true);
    expect(role('search').dataset.selected).toBeUndefined();
    expect(role('fallback').hidden).toBe(false);
    expect(document.activeElement).toBe(engineLinks()[0]);
  });

  it('takes the open search box as the last stop after the focus leaves it', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    pressKey('3');

    expect(role('fallback').hidden).toBe(false);

    // The focus leaves the box, the way returning from the engine's tab leaves
    // it, and the arrows still reach the box as the last stop.
    pressKey('ArrowUp');

    expect(role('fallback').dataset.selected).toBe('true');

    pressKey('Enter');

    expect(document.activeElement).toBe(engineLinks()[0]);
    expect(role('fallback').dataset.selected).toBeUndefined();
  });

  it('takes the search box as the only stop of the empty state', async () => {
    answerMeta();

    await start(URL, answerFetch([], { ...ANSWER, alternatives: [] }), NOW);

    expect(role('fallback').hidden).toBe(false);

    pressKey('ArrowUp');

    expect(role('fallback').dataset.selected).toBe('true');

    pressKey('Enter');

    expect(document.activeElement).toBe(engineLinks()[0]);
  });

  it('closes the search box on escape from the query', async () => {
    let backs = 0;

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, {
      goBack: (): void => {
        backs += 1;
      },
    });

    pressKey('3');
    engineLinks()[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );

    expect(document.activeElement).toBe(queryField());

    queryField().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(role('fallback').hidden).toBe(true);
    expect(role('fallback-note').hidden).toBe(true);
    expect(role('search').hidden).toBe(false);
    expect(role('search').dataset.selected).toBe('true');
    expect(document.activeElement).not.toBe(queryField());
    expect(backs).toBe(0);

    // The card is the selected stop, so Enter opens the box again.
    pressKey('Enter');

    expect(role('fallback').hidden).toBe(false);
    expect(document.activeElement).toBe(engineLinks()[0]);
  });

  it('returns to the last alternative on up in the query', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    pressKey('3');
    engineLinks()[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );

    expect(document.activeElement).toBe(queryField());

    queryField().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );

    expect(role('fallback').hidden).toBe(true);
    expect(rows()[rows().length - 1]?.dataset.selected).toBe('true');
    expect(role('search').dataset.selected).toBeUndefined();
    expect(rows()[0]?.dataset.selected).toBeUndefined();
  });

  it('closes the search box on escape from an engine', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    pressKey('3');

    engineLinks()[2]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(role('fallback').hidden).toBe(true);
    expect(role('search').hidden).toBe(false);
    expect(role('search').dataset.selected).toBe('true');
  });

  it('closes the box on escape when the box is the last stop', async () => {
    let backs = 0;

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, {
      goBack: (): void => {
        backs += 1;
      },
    });

    pressKey('3');
    pressKey('ArrowUp');

    expect(role('fallback').dataset.selected).toBe('true');

    pressKey('Escape');

    expect(role('fallback').hidden).toBe(true);
    expect(role('fallback').dataset.selected).toBeUndefined();
    expect(role('search').dataset.selected).toBe('true');
    expect(backs).toBe(0);
  });

  it('leaves the page on escape in the empty state', async () => {
    let backs = 0;

    answerMeta();

    await start(URL, answerFetch([], { ...ANSWER, alternatives: [] }), NOW, {
      goBack: (): void => {
        backs += 1;
      },
    });

    expect(role('fallback').hidden).toBe(false);

    queryField().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(role('fallback').hidden).toBe(false);
    expect(backs).toBe(1);
  });

  it('searches with the first engine on enter after the search card', async () => {
    const clicked: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    pressKey('3');

    role('engines').addEventListener('click', (event) => {
      event.preventDefault();

      if (event.target instanceof HTMLAnchorElement) {
        clicked.push(event.target.href);
      }
    });

    engineLinks()[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

    expect(clicked).toEqual([engineLinks()[0]?.href]);
  });

  it('opens the search card on its first engine', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    pressKey('3');

    expect(document.activeElement).toBe(engineLinks()[0]);
    expect(engineLinks()[0]?.dataset.selected).toBe('true');
  });

  it('picks an engine with a digit from the selected box', async () => {
    const clicked: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    role('engines').addEventListener('click', (event) => {
      event.preventDefault();

      if (event.target instanceof HTMLAnchorElement) {
        clicked.push(event.target.href);
      }
    });

    pressKey('3');
    pressKey('ArrowUp');

    expect(role('fallback').dataset.selected).toBe('true');

    pressKey('2');

    expect(role('fallback').dataset.selected).toBeUndefined();
    expect(document.activeElement).toBe(engineLinks()[1]);
    expect(engineLinks()[1]?.dataset.selected).toBe('true');

    engineLinks()[1]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

    expect(clicked).toEqual([engineLinks()[1]?.href]);
  });

  it('keeps the list selection while the arrows walk the engines', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW);

    pressKey('3');

    engineLinks()[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );

    expect(rows()[0]?.dataset.selected).toBeUndefined();
    expect(document.activeElement).toBe(engineLinks()[1]);
  });

  it('starts the scope selector on the choice of the domain', async () => {
    fake.storage.local.values[STORAGE.scopeDefaults] = { 'cnet.com': 'once' };
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(role('open-menu-label').textContent).toBe(ONCE_LABEL);
    expect(role('scope-once').getAttribute('aria-checked')).toBe('true');
    expect(role('scope-tab').getAttribute('aria-checked')).toBe('false');
  });

  it('keeps the way back and the note around the card', async () => {
    let backs = 0;

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, {
      goBack: (): void => {
        backs += 1;
      },
    });

    expect(role('back-label').textContent).toBe(BACK_LABEL);
    expect(role('back-key').textContent).toBe(ESC_KEY);
    expect(role('open-menu-label').textContent).toBe(SCOPE_LABEL.tab);
    expect(role('note').contains(role('footnote'))).toBe(true);
    expect(role('note').contains(role('report'))).toBe(true);
    expect(role('actions').contains(role('report'))).toBe(false);

    press('back');

    expect(backs).toBe(1);
  });

  it('goes back on escape after it clears the selection', async () => {
    let backs = 0;

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, {
      goBack: (): void => {
        backs += 1;
      },
    });

    pressKey('ArrowDown');
    expect(rows()[0]?.dataset.selected).toBe('true');

    pressKey('Escape');

    expect(rows()[0]?.dataset.selected).toBeUndefined();
    expect(backs).toBe(0);

    pressKey('Escape');

    expect(backs).toBe(1);
  });

  it('shows the count and the keyboard line under the rows', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(role('count').textContent).toBe('3');
    expect(role('count').getAttribute('title')).toBe(resultsLabel(3));
    expect(role('keyboard-hint').textContent).toBe(
      `${keyboardHint(3)}${topicLabel('AI image generators')}`,
    );
    expect(role('search-key').textContent).toBe('3');
    expect(role('keyboard-hint').hidden).toBe(false);
  });

  it('names the story of the answer at the end of the keyboard line', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(role('topic').textContent).toBe(topicLabel('AI image generators'));
  });

  it('leaves the story out when the answer names none', async () => {
    answerMeta();

    await start(URL, answerFetch([], { ...ANSWER, topic: null }));

    expect(document.querySelector('[data-role="topic"]')).toBeNull();
    expect(role('keyboard-hint').textContent).toBe(keyboardHint(3));
  });

  it('navigates once when the page starts twice', async () => {
    const opened: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, { navigate: (url) => opened.push(url) });
    await start(URL, answerFetch([], ANSWER), NOW, { navigate: (url) => opened.push(url) });

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(opened).toEqual([ANSWER.alternatives[0]!.url]);
  });

  it('leaves enter alone inside the query field', async () => {
    const opened: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, { navigate: (url) => opened.push(url) });

    queryField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(opened).toHaveLength(0);
  });

  it('keeps an edited query across a retry', async () => {
    let attempt = 0;
    const fetchImpl: FetchLike = async () => {
      attempt += 1;

      return attempt === 1
        ? new Response(JSON.stringify({ error: 'provider_error' }), {
            status: 502,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(JSON.stringify({ ...ANSWER, query: 'The worker query' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
    };

    answerMeta();

    await start(URL, fetchImpl);
    editQuery('my own words');

    press('retry');

    await vi.waitFor(() => {
      expect(role('list').querySelectorAll('li')).toHaveLength(2);
    });

    expect(queryField().value).toBe('my own words');
    expect(engineLinks().map((link) => link.getAttribute('href'))).toEqual(
      SEARCH_ENGINES.map((key) => engineUrl(key, 'my own words')),
    );
  });

  it('opens the site in this tab for the default action', async () => {
    const navigated: string[] = [];

    await writeStoredList(NOW, HARD_LIST, STORED_ID);
    answerMeta(null);

    await start(FORBES_URL, answerFetch([], ANSWER), NOW, {
      navigate: (url) => navigated.push(url),
    });

    press('open-site');

    await vi.waitFor(() => {
      expect(navigated).toEqual([FORBES_URL]);
    });

    expect(messagesOfType('allow')).toEqual([{ type: 'allow', scope: 'tab', url: FORBES_URL }]);
  });

  it('keeps a non-web url without an action row', async () => {
    answerMeta(null);

    await startPage(searchFor('javascript:alert(1)'), answerFetch([], ANSWER));

    expect(role('actions').hidden).toBe(true);
    expect(role('scope-menu').hidden).toBe(true);
  });

  it('starts no note for a value that is not a web url', async () => {
    vi.useFakeTimers();

    const navigated: string[] = [];

    answerMeta(null);

    void startPage(searchFor('javascript:alert(1)'), pendingFetch([]), NOW, {
      navigate: (url) => navigated.push(url),
    });

    await drainStart();
    await vi.advanceTimersByTimeAsync(5000);

    expect(role('alternatives').hasAttribute('data-slow')).toBe(false);
    expect(role('slow-note').hidden).toBe(true);
    expect(navigated).toHaveLength(0);
  });

  it('keeps the action row for a web url the list does not carry', async () => {
    const unlisted = 'https://example.com/an-unlisted-story';
    const navigated: string[] = [];

    answerMeta(null);

    await start(unlisted, answerFetch([], ANSWER), NOW, {
      navigate: (url) => navigated.push(url),
    });

    expect(role('actions').hidden).toBe(false);
    expect(role('open-site-label').textContent).toBe(openAnywayLabel('example.com'));

    press('open-site');

    await vi.waitFor(() => {
      expect(navigated).toEqual([unlisted]);
    });
  });

  it('does not offer to open the site before the answer arrives', async () => {
    vi.useFakeTimers();

    const pending = deferred<Response>();

    answerMeta();

    const running = start(URL, () => pending.promise);

    await drainStart();

    // The answer names the site and the scope; until then the frame keeps the
    // way back and hides the controls it cannot label.
    expect(role('actions').hidden).toBe(false);
    expect(role('open-site').hidden).toBe(true);
    expect(role('theme').hidden).toBe(true);
    expect(role('back-label').textContent).toBe(BACK_LABEL);

    pending.resolve(
      new Response(JSON.stringify(ANSWER), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await running;

    expect(role('open-site').hidden).toBe(false);
    expect(role('open-site-label').textContent).toBe(openAnywayLabel('CNET'));
    expect(role('theme').hidden).toBe(false);
  });

  it('explains a missing tab record and offers the article again', async () => {
    await startPage(`${searchFor(URL)}&theme=dark`, answerFetch([], ANSWER), NOW, {
      send: async () => ({ ok: false, error: 'missing_tab' }),
    });

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(role('theme').hidden).toBe(true);
    expect(role('notice').hidden).toBe(false);
    expect(role('notice-body').textContent).toContain(NO_RECORD_NOTICE);

    const link = role('notice-body').querySelector('a');

    expect(link?.getAttribute('href')).toBe(URL);
    expect(link?.textContent).toBe(NO_RECORD_LINK);
    expect(role('alternatives').hidden).toBe(true);
    expect(role('actions').hidden).toBe(true);
  });

  it('explains a page with no address and offers no link', async () => {
    await startPage('', answerFetch([], ANSWER));

    expect(role('notice').hidden).toBe(false);
    expect(role('notice-body').textContent).toBe(NO_URL_NOTICE);
    expect(role('notice-body').querySelector('a')).toBeNull();
  });

  it('adds the note and the two links after three seconds', async () => {
    vi.useFakeTimers();

    const calls: FetchCall[] = [];

    answerMeta();

    void start(URL, pendingFetch(calls));

    await drainStart();
    await vi.advanceTimersByTimeAsync(2999);

    expect(role('alternatives').dataset.slow).toBeUndefined();
    expect(role('slow-note').hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(1);

    expect(role('alternatives').dataset.slow).toBe('true');
    expect(role('alternatives').dataset.state).toBe('loading');
    expect(role('slow-note').hidden).toBe(false);
    expect(role('slow-text').textContent).toBe(SLOW_NOTE);
    expect(role('open-instead').textContent).toBe(openInsteadLabel('cnet.com'));
    expect(role('keep-waiting').textContent).toBe(KEEP_WAITING_LABEL);
  });

  it('keeps the note out when the answer arrives first', async () => {
    vi.useFakeTimers();

    const pending = deferred<Response>();

    answerMeta();

    const running = start(URL, () => pending.promise);

    await drainStart();
    await vi.advanceTimersByTimeAsync(2000);

    pending.resolve(
      new Response(JSON.stringify(ANSWER), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await running;

    expect(role('alternatives').dataset.state).toBe('results');

    await vi.advanceTimersByTimeAsync(1500);

    expect(role('alternatives').dataset.slow).toBeUndefined();
    expect(role('slow-note').hidden).toBe(true);
  });

  it('clears the note when the answer arrives after it', async () => {
    vi.useFakeTimers();

    const pending = deferred<Response>();

    answerMeta();

    const running = start(URL, () => pending.promise);

    await drainStart();
    await vi.advanceTimersByTimeAsync(3000);

    expect(role('alternatives').dataset.slow).toBe('true');
    expect(role('slow-note').hidden).toBe(false);

    pending.resolve(
      new Response(JSON.stringify(ANSWER), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await running;

    expect(role('alternatives').dataset.state).toBe('results');
    expect(role('alternatives').dataset.slow).toBeUndefined();
    expect(role('slow-note').hidden).toBe(true);
    expect(role('slow-text').textContent).toBe(SLOW_NOTE);
  });

  it('hides the note when the reader keeps waiting', async () => {
    vi.useFakeTimers();

    const calls: FetchCall[] = [];

    answerMeta();

    void start(URL, pendingFetch(calls));

    await drainStart();
    await vi.advanceTimersByTimeAsync(3000);

    expect(role('slow-note').hidden).toBe(false);

    press('keep-waiting');

    expect(role('slow-note').hidden).toBe(true);
    expect(role('alternatives').hasAttribute('data-slow')).toBe(false);
    expect(role('status').textContent).toBe(ALTERNATIVES_LOADING);
  });

  it('opens the site and grants this tab from the note', async () => {
    vi.useFakeTimers();

    const navigated: string[] = [];

    await writeStoredList(NOW, HARD_LIST, STORED_ID);
    answerMeta(null);

    void start(FORBES_URL, pendingFetch([]), NOW, { navigate: (url) => navigated.push(url) });

    await drainStart();
    await vi.advanceTimersByTimeAsync(3000);
    press('open-instead');
    await vi.advanceTimersByTimeAsync(250);

    expect(messagesOfType('allow')).toEqual([{ type: 'allow', scope: 'tab', url: FORBES_URL }]);
    expect(navigated).toEqual([FORBES_URL]);
  });

  it('names the page host in the note when the list has no name', async () => {
    vi.useFakeTimers();

    const unlisted = 'https://example.com/an-unlisted-story';

    answerMeta(null);

    void start(unlisted, pendingFetch([]));

    await drainStart();
    await vi.advanceTimersByTimeAsync(3000);

    expect(role('open-instead').textContent).toBe(openInsteadLabel('example.com'));
  });

  it('adds the note again after a retry', async () => {
    vi.useFakeTimers();

    const calls: FetchCall[] = [];
    let attempt = 0;
    const fetchImpl: FetchLike = (input, init) => {
      calls.push({ input, init });
      attempt += 1;

      if (attempt === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'provider_error' }), {
            status: 502,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      return new Promise<Response>(() => {
        // A second request that never settles: the retry is still running.
      });
    };

    answerMeta();

    await start(URL, fetchImpl);

    expect(role('alternatives').dataset.state).toBe('error');

    press('retry');

    await vi.advanceTimersByTimeAsync(3000);

    expect(role('alternatives').dataset.slow).toBe('true');
    expect(role('slow-note').hidden).toBe(false);
  });

  it('writes nothing into a document that retired its run', async () => {
    vi.useFakeTimers();

    const pending = deferred<Response>();

    answerMeta();

    void start(URL, () => pending.promise);

    await drainStart();

    // The reader is on a new page, and the answer of the old run arrives late.
    stopBlockPage();
    mountShell(SHELL);

    pending.resolve(
      new Response(JSON.stringify(ANSWER), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await vi.advanceTimersByTimeAsync(10);

    expect(role('alternatives').dataset.state).toBe('loading');
    expect(role('list').children).toHaveLength(0);
    expect(role('source-title').textContent).toBe('');
  });

  it('paints nothing for a page whose run has retired', async () => {
    const pending = deferred<Response>();

    answerMeta();

    const running = start(URL, () => pending.promise);

    await vi.waitFor(() => {
      expect(messagesOfType(MESSAGE.pageState)).toHaveLength(1);
    });

    stopBlockPage();
    pending.resolve(
      new Response(JSON.stringify(ANSWER), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await running;

    expect(role('list').querySelectorAll('li')).toHaveLength(0);
    expect(role('source-title').textContent).toBe('');
  });

  it('starts no note without a url', async () => {
    vi.useFakeTimers();

    const navigated: string[] = [];

    await startPage('', pendingFetch([]), NOW, {
      navigate: (url) => navigated.push(url),
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(role('alternatives').hasAttribute('data-slow')).toBe(false);
    expect(role('slow-note').hidden).toBe(true);
    expect(navigated).toHaveLength(0);
  });

  it('starts no countdown without an alternative', async () => {
    vi.useFakeTimers();

    const navigated: string[] = [];

    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: true,
    };
    answerMeta();

    await start(URL, answerFetch([], { ...ANSWER, alternatives: [] }), NOW, {
      navigate: (url) => navigated.push(url),
    });

    expect(role('countdown').hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);

    expect(navigated).toEqual([]);
  });

  it('starts no countdown while the setting is off', async () => {
    vi.useFakeTimers();

    const navigated: string[] = [];

    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, {
      navigate: (url) => navigated.push(url),
    });

    expect(role('countdown').hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);

    expect(navigated).toEqual([]);
  });

  it('starts the countdown with the best match', async () => {
    vi.useFakeTimers();

    const navigated: string[] = [];
    const best = ANSWER.alternatives[0]!;

    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: true,
    };
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, {
      navigate: (url) => navigated.push(url),
    });

    expect(role('countdown').hidden).toBe(false);
    expect(role('countdown-text').textContent).toBe(countdownText(best.domain));

    await vi.advanceTimersByTimeAsync(3000);

    expect(navigated).toEqual([best.url]);
  });

  it('starts no countdown for a degraded answer', async () => {
    vi.useFakeTimers();

    const navigated: string[] = [];

    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: true,
    };
    answerMeta();

    await start(URL, answerFetch([], { ...ANSWER, degraded: true }), NOW, {
      navigate: (url) => navigated.push(url),
    });

    expect(role('countdown').hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);

    expect(navigated).toEqual([]);
  });

  it('stops the countdown when enter opens the first result', async () => {
    vi.useFakeTimers();

    const navigated: string[] = [];

    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: true,
    };
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, {
      navigate: (url) => navigated.push(url),
    });

    expect(role('countdown').hidden).toBe(false);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(navigated).toEqual([ANSWER.alternatives[0]!.url]);
    expect(role('countdown').hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);

    // The stopped countdown never navigates a second time.
    expect(navigated).toEqual([ANSWER.alternatives[0]!.url]);
  });

  it('stops the countdown of an earlier start', async () => {
    vi.useFakeTimers();

    const second = 'https://www.theverge.com/2026/10/15/a-second-story/';
    const navigated: string[] = [];

    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: true,
    };
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, {
      navigate: (url) => navigated.push(url),
    });

    expect(role('countdown').hidden).toBe(false);

    void start(second, pendingFetch([]), NOW, { navigate: (url) => navigated.push(url) });

    await drainStart();

    expect(role('countdown').hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);

    expect(navigated).toEqual([]);
  });
});

describe('the theme control', () => {
  it('paints the stored choice and moves to the other theme on a press', async () => {
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
      theme: 'dark',
      walls: defaultWalls(),
    };
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(role('theme').getAttribute('aria-label')).toBe(THEME_SWITCH_LIGHT);

    press('theme');

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(role('theme').getAttribute('aria-label')).toBe(THEME_SWITCH_DARK);
    expect(messagesOfType(MESSAGE.setSettings)).toEqual([
      {
        type: MESSAGE.setSettings,
        settings: {
          enabled: true,
          autoOpenBest: false,
          imagesEnabled: true,
          theme: 'light',
          walls: defaultWalls(),
        },
      },
    ]);
  });
});
