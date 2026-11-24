// @vitest-environment happy-dom
import type { SitesJson } from '@detour/shared';
import { sha256Hex } from '@detour/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeAltCache } from './alts-cache';
import type { AlternativesAnswer } from './alternatives';
import { requestAlternatives } from './alternatives';
import type { BlockPageOptions } from './block-page';
import { startBlockPage } from './block-page';
import { ALT_TTL_MS, MESSAGE, STORAGE } from './constants';
import {
  ALTERNATIVES_FAILED,
  ALTERNATIVES_HEADING,
  ALTERNATIVES_LOADING,
  ALTERNATIVES_NONE,
  ANTI_USER_NOTE,
  FAILED_DETAIL,
  FOOTNOTE,
  KEEP_WAITING_LABEL,
  NONE_DETAIL,
  NO_URL_HEADLINE,
  RETRY_EMPTY_LABEL,
  RETRY_LABEL,
  SLOW_NOTE,
  SOURCE_LABEL,
  countdownText,
  headline,
  openAnywayLabel,
  openInsteadLabel,
} from './copy';
import type { GetAlternativesMessage } from './messages';
import type { PageMeta } from './metadata';
import type { FetchLike } from './net';
import { SEARCH_ENGINES, engineUrl } from './search-fallback';
import { writeStoredList } from './storage';
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
};

const ANSWER: AlternativesAnswer = {
  query: 'Best AI Image Generators 2026',
  degraded: false,
  provider: 'ceramic',
  alternatives: [
    {
      url: 'https://arstechnica.com/gadgets/2026/10/ai-image-tools-compared/',
      title: 'The best AI image generators, compared',
      description: 'We tested every tool that asks for your money.',
      domain: 'arstechnica.com',
      image: 'https://detour-api.invalid/v1/img?u=a&sig=b',
    },
    {
      url: 'https://www.theverge.com/ai-image-tools-ranked/',
      title: 'AI image tools, ranked',
      description: 'A second look at the same tools.',
      domain: 'theverge.com',
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

/**
 * The service worker's alternatives answer. The test drives the same backend
 * request through the message that the real page sends, so a case controls the
 * network with one fetch stub.
 */
function installAnswer(fetchImpl: FetchLike): void {
  fake.respond(MESSAGE.getAlternatives, async (message) => {
    const request = message as GetAlternativesMessage;
    const answer = await requestAlternatives({
      apiBase: API_BASE,
      url: request.url,
      title: request.title,
      fetchImpl,
    });

    return { ok: true, answer };
  });
}

function startPage(
  search: string,
  fetchImpl: FetchLike,
  now = NOW,
  extra: Partial<BlockPageOptions> = {},
): Promise<void> {
  installAnswer(fetchImpl);

  const options: BlockPageOptions = { search, now, ...extra };

  return startBlockPage(options);
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
  fake.respond('getMeta', () => ({ ok: true, meta }));
}

beforeEach(() => {
  fake = installFakeChrome();
  fake.respond('allow', () => ({
    ok: true,
    allowances: { allowAlways: [], allowSession: [], allowTabs: [] },
  }));
  mountShell(SHELL);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreWindowTop();
  document.body.innerHTML = '';
  resetFakeChrome();
});

describe('the block page shell', { timeout: 20_000 }, () => {
  it('carries the shell the script fills', () => {
    // The parsed copy drops the stylesheet link, which this environment cannot load.
    const shell = new DOMParser().parseFromString(SHELL.replace(/<link[^>]*>/g, ''), 'text/html');
    const roles = [
      'header',
      'mark',
      'wordmark',
      'headline',
      'walls',
      'lede',
      'source',
      'source-text',
      'source-label',
      'source-title',
      'source-link',
      'open-group',
      'alternatives',
      'list-head',
      'alternatives-heading',
      'count',
      'status',
      'detail',
      'list',
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
      'open-site',
      'open-menu',
      'scope-menu',
      'scope-once',
      'scope-tab',
      'scope-session',
      'scope-always',
      'action-error',
      'report',
      'footnote',
    ];
    const closed = [
      'fallback',
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
    fake.respond('getMeta', () => meta.promise);

    const running = start(URL, answerFetch(calls, ANSWER));

    expect(role('lede').hidden).toBe(true);
    expect(role('walls').hidden).toBe(true);
    expect(role('source-label').textContent).toBe(SOURCE_LABEL);
    expect(role('alternatives-heading').textContent).toBe(ALTERNATIVES_HEADING);
    expect(role('source-link').getAttribute('href')).toBe(URL);
    expect(role('source-link').textContent).toBe(COMPACT_URL);
    expect(role('source-link').getAttribute('title')).toBe(URL);
    expect(role('status').textContent).toBe(ALTERNATIVES_LOADING);
    expect(calls).toHaveLength(0);
    expect(fake.calls.messages).toHaveLength(0);

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
    expect(fake.calls.messages).toHaveLength(0);

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
    expect(role('walls').textContent).toContain('Hard');
    expect(role('walls').hidden).toBe(false);
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
    expect(role('walls').textContent).toContain('Paywall');
    expect(role('walls').textContent).toContain('Metered');
  });

  it('draws the wall of a soft entry', async () => {
    answerMeta(null);

    await start(URL, answerFetch([], ANSWER));

    expect(role('headline').textContent).toBe(headline('CNET', 1));
    expect(role('walls').textContent).toBe('Ad blocker·Soft');
  });

  it('judges no page that carries no ad-blocker wall', async () => {
    await writeStoredList(NOW, PAYWALL_LIST, STORED_ID);
    answerMeta(null);

    await start(FORBES_URL, answerFetch([], ANSWER));

    expect(role('walls').textContent).toBe('Paywall·Hard');
    expect(role('lede').textContent).toBe('');
    expect(role('lede').hidden).toBe(true);
  });

  it('renders the general explanation without a url', async () => {
    const calls: FetchCall[] = [];

    await startPage('', answerFetch(calls, ANSWER));

    expect(role('headline').textContent).toBe(NO_URL_HEADLINE);
    expect(role('lede').hidden).toBe(true);
    expect(role('walls').hidden).toBe(true);
    expect(role('source-link').getAttribute('href')).toBeNull();
    expect(role('source-link').textContent).toBe('');
    expect(role('source').hidden).toBe(true);
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

    expect(role('source-link').textContent).toBe(unsafe);
    expect(role('source-link').getAttribute('href')).toBeNull();
    expect(role('source').hidden).toBe(false);
  });

  it('names the stopped page from the metadata', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(role('source-title').textContent).toBe(META.title);
    expect(role('source-link').textContent).toBe(COMPACT_URL);
    expect(role('source-text').childElementCount).toBe(3);
    expect(role('source').querySelector('img')).toBeNull();
  });

  it('names the site in the tab', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    expect(document.title).toBe('Detour — CNET');
  });

  it('renders the card with the url only when the metadata fails', async () => {
    fake.respond('getMeta', () => {
      throw new Error('the worker is asleep');
    });

    await start(URL, answerFetch([], ANSWER));

    expect(role('source-link').textContent).toBe(COMPACT_URL);
    expect(role('source-title').textContent).toBe('');
  });

  it('keeps the url-only card when the runtime is absent', async () => {
    resetFakeChrome();

    const calls: FetchCall[] = [];

    await start(URL, answerFetch(calls, ANSWER));

    expect(role('source-link').textContent).toBe(COMPACT_URL);
    expect(role('source-title').textContent).toBe('');
    expect(role('status').textContent).toBe(ALTERNATIVES_FAILED);
    expect(role('list').querySelectorAll('li')).toHaveLength(0);
    expect(role('actions').hidden).toBe(false);
    expect(role('open-site').textContent).toBe(openAnywayLabel('CNET'));
    expect(role('report').hidden).toBe(true);
  });

  it('renders the card before the alternatives arrive', async () => {
    const meta = deferred<unknown>();

    fake.respond('getMeta', () => meta.promise);

    void start(URL, pendingFetch([]));

    meta.resolve({ ok: true, meta: META });

    await vi.waitFor(() => {
      expect(role('source-title').textContent).toBe(META.title);
    });

    expect(role('status').textContent).toBe(ALTERNATIVES_LOADING);
    expect(role('list').children).toHaveLength(0);
  });

  it('hides the row images when the setting is off', async () => {
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

  it('marks every row image as referrer-free and lazy', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    const images = role('list').querySelectorAll('img');

    expect(images).toHaveLength(1);

    for (const image of images) {
      expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(image.getAttribute('loading')).toBe('lazy');
    }
  });

  it('renders a cached answer without a request', async () => {
    const calls: FetchCall[] = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ input, init });

      throw new Error('the page must not ask the network');
    };

    await writeAltCache(URL, ANSWER, NOW);
    answerMeta();

    await start(URL, fetchImpl);

    expect(calls).toHaveLength(0);
    expect(role('list').querySelectorAll('li')).toHaveLength(2);
  });

  it('caches an answer for one day', async () => {
    const calls: FetchCall[] = [];

    answerMeta();

    await start(URL, answerFetch(calls, ANSWER));

    mountShell(SHELL);
    await start(URL, answerFetch(calls, ANSWER), NOW + ALT_TTL_MS - 1);

    expect(calls).toHaveLength(1);
    expect(role('list').querySelectorAll('li')).toHaveLength(2);
  });

  it('writes no key but the alternatives cache', async () => {
    answerMeta();

    await start(URL, answerFetch([], ANSWER));

    const keys = Object.keys(fake.storage.local.values);

    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(`${STORAGE.alt}${await sha256Hex(URL)}`);
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

  it('shows the failure text when the page digest fails', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('the digest is unavailable'));

    answerMeta();

    await start(URL, answerFetch([], ANSWER));

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

    await start(URL, answerFetch([], ANSWER), NOW, { openTab: (url) => opened.push(url) });

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(opened).toEqual([ANSWER.alternatives[0]!.url]);
  });

  it('opens one tab when the page starts twice', async () => {
    const opened: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, { openTab: (url) => opened.push(url) });
    await start(URL, answerFetch([], ANSWER), NOW, { openTab: (url) => opened.push(url) });

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(opened).toEqual([ANSWER.alternatives[0]!.url]);
  });

  it('leaves enter alone inside the query field', async () => {
    const opened: string[] = [];

    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, { openTab: (url) => opened.push(url) });

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
    expect(role('open-site').textContent).toBe(openAnywayLabel('example.com'));

    press('open-site');

    await vi.waitFor(() => {
      expect(navigated).toEqual([unlisted]);
    });
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
    expect(role('open-instead').textContent).toBe(openInsteadLabel('CNET'));
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

  it('stops the countdown when enter opens a tab', async () => {
    vi.useFakeTimers();

    const opened: string[] = [];
    const navigated: string[] = [];

    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: true,
    };
    answerMeta();

    await start(URL, answerFetch([], ANSWER), NOW, {
      navigate: (url) => navigated.push(url),
      openTab: (url) => opened.push(url),
    });

    expect(role('countdown').hidden).toBe(false);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(opened).toEqual([ANSWER.alternatives[0]!.url]);
    expect(role('countdown').hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);

    expect(navigated).toEqual([]);
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
