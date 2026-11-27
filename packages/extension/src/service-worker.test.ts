import type { SitesJson, WallCategory } from '@detour/shared';
import { sha256Hex } from '@detour/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { writeAltCache } from './alts-cache';
import type { AlternativesAnswer } from './alternatives';
import { hasCapability, recordCapability } from './capabilities';
import { LIST_STORAGE_VERSION, MESSAGE, STORAGE } from './constants';
import { FAKE_EXTENSION_ID, installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import type { PageMeta } from './metadata';
import { writeMeta } from './metadata-cache';
import { recordPass } from './passes';
import type { FetchLike } from './net';
import type { ServiceWorkerDeps } from './service-worker';
import { handleMessage, pruneCapability, pruneTabAllowances, refreshList } from './service-worker';
import { BUNDLED_LIST_ID } from './sites-id';
import type { PageState, PopupState } from './state-view';
import { BUNDLED_LIST, writeStoredList } from './storage';

const NOW = 1_700_000_000_000;
const API_BASE = 'http://127.0.0.1:8787';

const CNET_URL = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';
const UNLISTED_URL = 'https://example.com/news/a-story';
const LOOKALIKE_URL = 'https://notcnet.com/tech/services-and-software/best-ai-image-generators/';
const FORBES_URL = 'https://www.forbes.com/sites/richardnieva/nvidias-next-move/';

// The metadata memo outlives one test case, so each case that reads a page asks
// about a page of its own.
const NAVIGATED_URL = 'https://www.cnet.com/news/navigated-story/';
const SLOW_URL = 'https://www.cnet.com/news/slow-story/';
const ENCODED_URL = 'https://www.cnet.com/news/a-story?x=1&y=2#comments';
const FAILED_NAV_URL = 'https://www.cnet.com/news/failed-navigation/';
const NO_TAB_URL = 'https://www.cnet.com/news/no-tab-story/';
const STOPPED_URL = 'https://www.cnet.com/news/stopped-story/';

const CNET_SITE = {
  domain: 'cnet.com',
  name: 'CNET',
  walls: [{ category: 'adblock', type: 'soft' }],
};

const STORED_ID = 'a'.repeat(64);

async function idOf(list: SitesJson): Promise<string> {
  return sha256Hex(JSON.stringify(list));
}

const NETWORK_LIST: SitesJson = {
  disabled: false,
  avoid: [],
  prefer: [],
  sites: [
    {
      domain: 'forbes.com',
      name: 'Forbes',
      walls: [{ category: 'adblock', type: 'hard' }],
      paths: [],
      note: 'A full-page wall for readers who use an ad blocker.',
      avoid: [],
      prefer: [],
    },
  ],
};

const PAYWALL_LIST: SitesJson = {
  ...NETWORK_LIST,
  sites: [{ ...NETWORK_LIST.sites[0]!, walls: [{ category: 'paywall', type: 'hard' }] }],
};

const METADATA_HTML =
  '<!doctype html><html><head><meta property="og:title" content="A title">' +
  '<meta property="og:image" content="https://cdn.example.com/a.png"></head><body></body></html>';

const METADATA: PageMeta = {
  title: 'A title',
  description: null,
  icon: 'https://www.cnet.com/favicon.ico',
};

type FetchCall = { url: string; init?: RequestInit };

function blockPageUrlFor(url: string, theme = 'system'): string {
  return `chrome-extension://${FAKE_EXTENSION_ID}/block.html?u=${encodeURIComponent(url)}&theme=${theme}`;
}

function deps(overrides: Partial<ServiceWorkerDeps> = {}): ServiceWorkerDeps {
  return {
    apiBase: API_BASE,
    now: () => NOW,
    fetchImpl: async () => {
      throw new Error('this case expected no fetch');
    },
    ...overrides,
  };
}

function recordingFetch(answer: (url: string) => Response | Promise<Response>): {
  fetchImpl: FetchLike;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });

    return answer(url);
  };

  return { fetchImpl, calls };
}

function pageResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
}

function listResponse(list: SitesJson): Response {
  return new Response(JSON.stringify(list), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

const ANSWER_JSON = {
  query: 'a stored query',
  degraded: false,
  provider: 'ceramic',
  alternatives: [
    {
      url: 'https://arstechnica.com/gadgets/nvidia-custom-silicon/',
      title: 'A result',
      description: 'One sentence.',
      domain: 'arstechnica.com',
    },
  ],
};

afterEach(() => {
  resetFakeChrome();
});

describe('the isBlocked handler', () => {
  it('answers a listed url', async () => {
    installFakeChrome();

    await expect(handleMessage({ type: 'isBlocked', url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: true,
      blocked: true,
      site: CNET_SITE,
    });
  });

  it('passes a page whose walls are all switched off', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.settings = {
      enabled: true,
      walls: { hard: [], soft: [], metered: [] },
    };

    await expect(handleMessage({ type: 'isBlocked', url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: true,
      blocked: false,
      site: null,
    });
  });

  it('passes a paywall while the reader stops ad-blocker walls alone', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.list = {
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: NOW,
      listId: STORED_ID,
      list: PAYWALL_LIST,
    };

    await expect(
      handleMessage({ type: 'isBlocked', url: FORBES_URL }, {}, deps()),
    ).resolves.toEqual({ ok: true, blocked: false, site: null });
  });

  it('blocks a paywall that the reader asked for', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.list = {
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: NOW,
      listId: STORED_ID,
      list: PAYWALL_LIST,
    };
    fake.storage.local.values.settings = {
      enabled: true,
      walls: { hard: ['paywall'], soft: [], metered: [] },
    };

    await expect(
      handleMessage({ type: 'isBlocked', url: FORBES_URL }, {}, deps()),
    ).resolves.toEqual({
      ok: true,
      blocked: true,
      site: {
        domain: 'forbes.com',
        name: 'Forbes',
        walls: [{ category: 'paywall', type: 'hard' }],
      },
    });
  });

  it('answers an unlisted url', async () => {
    installFakeChrome();

    await expect(
      handleMessage({ type: 'isBlocked', url: UNLISTED_URL }, {}, deps()),
    ).resolves.toEqual({ ok: true, blocked: false, site: null });
  });

  it('answers a lookalike host as unlisted', async () => {
    installFakeChrome();

    await expect(
      handleMessage({ type: 'isBlocked', url: LOOKALIKE_URL }, {}, deps()),
    ).resolves.toEqual({ ok: true, blocked: false, site: null });
  });

  it('passes every page while the extension is disabled', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.settings = { enabled: false };

    await expect(handleMessage({ type: 'isBlocked', url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: true,
      blocked: false,
      site: null,
    });
  });

  it('passes a page with a permanent allowance', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.allowAlways = [{ host: 'cnet.com', addedAt: NOW }];

    await expect(handleMessage({ type: 'isBlocked', url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: true,
      blocked: false,
      site: null,
    });
  });

  it('passes a page with a session allowance', async () => {
    const fake = installFakeChrome();

    fake.storage.session.values.allowSession = [{ host: 'cnet.com', addedAt: NOW }];

    await expect(handleMessage({ type: 'isBlocked', url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: true,
      blocked: false,
      site: null,
    });
  });

  it('passes a page with a tab allowance', async () => {
    const fake = installFakeChrome();

    fake.storage.session.values.allowTabs = [{ host: 'cnet.com', tabId: 7, addedAt: NOW }];

    await expect(
      handleMessage({ type: 'isBlocked', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({ ok: true, blocked: false, site: null });
  });

  it('passes a page opened from an allowed tab', async () => {
    const fake = installFakeChrome();

    fake.storage.session.values.allowTabs = [{ host: 'cnet.com', tabId: 7, addedAt: NOW }];

    await expect(
      handleMessage(
        { type: 'isBlocked', url: CNET_URL },
        { tab: { id: 9, openerTabId: 7 } },
        deps(),
      ),
    ).resolves.toEqual({ ok: true, blocked: false, site: null });
  });

  it('blocks a child of an allowed tab on another host', async () => {
    const fake = installFakeChrome();
    const zdnetUrl = 'https://www.zdnet.com/article/a-story/';

    fake.storage.session.values.allowTabs = [{ host: 'cnet.com', tabId: 7, addedAt: NOW }];

    await expect(
      handleMessage(
        { type: 'isBlocked', url: zdnetUrl },
        { tab: { id: 9, openerTabId: 7 } },
        deps(),
      ),
    ).resolves.toEqual({
      ok: true,
      blocked: true,
      site: {
        domain: 'zdnet.com',
        name: 'ZDNET',
        walls: [{ category: 'adblock', type: 'soft' }],
      },
    });
  });

  it('passes every page when the list is disabled', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.list = {
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: NOW,
      listId: STORED_ID,
      list: { ...BUNDLED_LIST, disabled: true },
    };

    await expect(handleMessage({ type: 'isBlocked', url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: true,
      blocked: false,
      site: null,
    });
  });

  it('serves the stored list before the bundled list', async () => {
    installFakeChrome();

    await writeStoredList(NOW, NETWORK_LIST, STORED_ID);

    await expect(
      handleMessage({ type: 'isBlocked', url: FORBES_URL }, {}, deps()),
    ).resolves.toEqual({
      ok: true,
      blocked: true,
      site: {
        domain: 'forbes.com',
        name: 'Forbes',
        walls: [{ category: 'adblock', type: 'hard' }],
      },
    });
    await expect(handleMessage({ type: 'isBlocked', url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: true,
      blocked: false,
      site: null,
    });
  });
});

const EXTENSION_ROOT = `chrome-extension://${FAKE_EXTENSION_ID}/`;

function blockSender(tabId = 11): { tab: { id: number }; url: string; frameId: number } {
  return { tab: { id: tabId }, url: `${EXTENSION_ROOT}block.html`, frameId: 0 };
}

function popupSender(): { url: string; frameId: number } {
  return { url: `${EXTENSION_ROOT}popup.html`, frameId: 0 };
}

function answerResponse(): Response {
  return new Response(JSON.stringify(ANSWER_JSON), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('the blocked handler', () => {
  it('navigates the stopped tab to the block page', async () => {
    const fake = installFakeChrome();

    const answer = await handleMessage(
      { type: 'blocked', url: NAVIGATED_URL, meta: null },
      { tab: { id: 7 } },
      deps(),
    );

    expect(fake.calls.updates).toEqual([{ tabId: 7, url: blockPageUrlFor(NAVIGATED_URL) }]);
    expect(answer).toEqual({ ok: true, blockPageUrl: blockPageUrlFor(NAVIGATED_URL) });
  });

  it('stamps the stored theme on the block page URL', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
      theme: 'dark',
    };

    const answer = await handleMessage(
      { type: 'blocked', url: NAVIGATED_URL, meta: null },
      { tab: { id: 7 } },
      deps(),
    );

    expect(fake.calls.updates).toEqual([{ tabId: 7, url: blockPageUrlFor(NAVIGATED_URL, 'dark') }]);
    expect(answer).toEqual({ ok: true, blockPageUrl: blockPageUrlFor(NAVIGATED_URL, 'dark') });
  });

  it('writes the meta the guard sent before the navigation, without a fetch', async () => {
    const fake = installFakeChrome();
    const digest = await sha256Hex(NAVIGATED_URL);
    const answer = await handleMessage(
      { type: 'blocked', url: NAVIGATED_URL, meta: METADATA },
      { tab: { id: 7 } },
      deps(),
    );

    expect(answer.ok).toBe(true);
    expect(fake.storage.local.values[`${STORAGE.meta}${digest}`]).toEqual({
      meta: METADATA,
      storedAt: NOW,
    });
    expect(fake.calls.updates).toHaveLength(1);
  });

  it('navigates on a page whose head read nothing', async () => {
    const fake = installFakeChrome();
    const digest = await sha256Hex(SLOW_URL);

    await handleMessage(
      { type: 'blocked', url: SLOW_URL, meta: { title: null, description: null, icon: null } },
      { tab: { id: 7 } },
      deps(),
    );

    expect(fake.storage.local.values[`${STORAGE.meta}${digest}`]).toBeUndefined();
    expect(fake.calls.updates).toEqual([{ tabId: 7, url: blockPageUrlFor(SLOW_URL) }]);
  });

  it('keeps the encoded original url in the query', async () => {
    const fake = installFakeChrome();

    await handleMessage(
      { type: 'blocked', url: ENCODED_URL, meta: null },
      { tab: { id: 7 } },
      deps(),
    );

    expect(fake.calls.updates).toEqual([{ tabId: 7, url: blockPageUrlFor(ENCODED_URL) }]);
    expect(fake.calls.updates[0]?.url).toContain('%26');
    expect(fake.calls.updates[0]?.url).toContain('%23');
  });

  it('answers the block page url when the navigation fails', async () => {
    const fake = installFakeChrome();

    fake.failNextUpdate();

    await expect(
      handleMessage(
        { type: 'blocked', url: FAILED_NAV_URL, meta: null },
        { tab: { id: 7 } },
        deps(),
      ),
    ).resolves.toEqual({
      ok: false,
      error: 'navigation_failed',
      blockPageUrl: blockPageUrlFor(FAILED_NAV_URL),
    });
  });

  it('answers no link and records nothing for a sender with no tab', async () => {
    const fake = installFakeChrome();

    await expect(
      handleMessage({ type: 'blocked', url: NO_TAB_URL, meta: null }, {}, deps()),
    ).resolves.toEqual({
      ok: false,
      error: 'missing_tab',
    });

    expect(fake.calls.updates).toEqual([]);
    expect(fake.storage.session.values).toEqual({});
  });
});

describe('the blocked navigation capability', () => {
  it('records the tab and the page digest under the tab key', async () => {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => pageResponse(METADATA_HTML));

    await handleMessage(
      { type: 'blocked', url: NAVIGATED_URL },
      { tab: { id: 7 } },
      deps({ fetchImpl }),
    );

    expect(fake.storage.session.values['capability:7']).toBe(await sha256Hex(NAVIGATED_URL));
  });

  it('replaces the capability on each blocked navigation', async () => {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => pageResponse(METADATA_HTML));

    await handleMessage(
      { type: 'blocked', url: NAVIGATED_URL },
      { tab: { id: 7 } },
      deps({ fetchImpl }),
    );
    await handleMessage(
      { type: 'blocked', url: STOPPED_URL },
      { tab: { id: 7 } },
      deps({ fetchImpl }),
    );

    expect(fake.storage.session.values['capability:7']).toBe(await sha256Hex(STOPPED_URL));
  });

  it('keeps both records when two tabs are blocked in the same tick', async () => {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => pageResponse(METADATA_HTML));
    const worker = deps({ fetchImpl });

    await Promise.all([
      handleMessage({ type: 'blocked', url: NAVIGATED_URL }, { tab: { id: 7 } }, worker),
      handleMessage({ type: 'blocked', url: STOPPED_URL }, { tab: { id: 9 } }, worker),
    ]);

    await expect(hasCapability(7, NAVIGATED_URL)).resolves.toBe(true);
    await expect(hasCapability(9, STOPPED_URL)).resolves.toBe(true);
    expect(fake.storage.session.values['capability:7']).toBe(await sha256Hex(NAVIGATED_URL));
    expect(fake.storage.session.values['capability:9']).toBe(await sha256Hex(STOPPED_URL));
  });

  it('retains the capability when the navigation fails', async () => {
    const fake = installFakeChrome();
    const { fetchImpl, calls } = recordingFetch(() => pageResponse(METADATA_HTML));

    fake.failNextUpdate();

    await handleMessage(
      { type: 'blocked', url: FAILED_NAV_URL },
      { tab: { id: 7 } },
      deps({ fetchImpl }),
    );

    await expect(hasCapability(7, FAILED_NAV_URL)).resolves.toBe(true);

    expect(calls).toHaveLength(0);
  });

  it('prunes the capability when its tab closes', async () => {
    const fake = installFakeChrome();

    await recordCapability(7, CNET_URL);
    await recordCapability(9, CNET_URL);

    await pruneCapability(7);

    expect(fake.storage.session.values['capability:7']).toBeUndefined();
    expect(fake.storage.session.values['capability:9']).toBe(await sha256Hex(CNET_URL));
  });
});

describe('the page state', () => {
  async function stopped(url: string): Promise<void> {
    await recordCapability(11, url);
  }

  it('answers a stopped tab from the cache without a request', async () => {
    installFakeChrome();
    await stopped(CNET_URL);
    await writeMeta(CNET_URL, METADATA, NOW);
    await writeAltCache(CNET_URL, ANSWER_JSON as AlternativesAnswer, NOW);

    const { fetchImpl, calls } = recordingFetch(() => answerResponse());
    const answer = (await handleMessage(
      { type: 'pageState', url: CNET_URL },
      blockSender(),
      deps({ fetchImpl }),
    )) as { ok: true; state: PageState };

    const view = answer.state.view;

    expect(calls).toHaveLength(0);
    expect(answer.ok).toBe(true);
    expect(view.kind).toBe('results');

    if (view.kind !== 'results') {
      throw new Error('expected the routes of the page');
    }

    expect(view.site?.domain).toBe('cnet.com');
    expect(view.meta).toEqual(METADATA);
    expect(view.routes[0]?.title).toBe('A result');
    expect(answer.state.settings.enabled).toBe(true);
  });

  it('starts one request for two callers of the same url', async () => {
    installFakeChrome();
    await stopped(CNET_URL);

    const pending = deferred<Response>();
    const { fetchImpl, calls } = recordingFetch(() => pending.promise);
    const worker = deps({ fetchImpl });
    const first = handleMessage({ type: 'pageState', url: CNET_URL }, blockSender(), worker);
    const second = handleMessage({ type: 'pageState', url: CNET_URL }, blockSender(), worker);

    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });

    pending.resolve(answerResponse());
    await Promise.all([first, second]);

    expect(calls).toHaveLength(1);
  });

  it('writes a finished answer to the cache', async () => {
    const fake = installFakeChrome();
    await stopped(CNET_URL);

    const { fetchImpl } = recordingFetch(() => answerResponse());

    await handleMessage({ type: 'pageState', url: CNET_URL }, blockSender(), deps({ fetchImpl }));

    const digest = await sha256Hex(CNET_URL);
    const stored = fake.storage.local.values[`${STORAGE.alt}${digest}`] as {
      answer: { alternatives: unknown[] };
    };

    expect(stored.answer.alternatives).toHaveLength(1);
  });

  it('answers an error view when the request fails', async () => {
    installFakeChrome();
    await stopped(CNET_URL);

    const { fetchImpl } = recordingFetch(() => new Response('no', { status: 500 }));
    const answer = (await handleMessage(
      { type: 'pageState', url: CNET_URL },
      blockSender(),
      deps({ fetchImpl }),
    )) as { ok: true; state: PageState };

    expect(answer.state.view.kind).toBe('error');
  });

  it('denies a caller without a capability before any request', async () => {
    installFakeChrome();
    await stopped(SLOW_URL);

    const { fetchImpl, calls } = recordingFetch(() => answerResponse());

    await expect(
      handleMessage({ type: 'pageState', url: CNET_URL }, blockSender(), deps({ fetchImpl })),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(calls).toHaveLength(0);
  });

  it('denies a caller from another tab before any request', async () => {
    installFakeChrome();
    await stopped(CNET_URL);

    const { fetchImpl, calls } = recordingFetch(() => answerResponse());

    await expect(
      handleMessage({ type: 'pageState', url: CNET_URL }, blockSender(12), deps({ fetchImpl })),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(calls).toHaveLength(0);
  });

  it('denies a framed caller', async () => {
    installFakeChrome();
    await stopped(CNET_URL);

    await expect(
      handleMessage({ type: 'pageState', url: CNET_URL }, { ...blockSender(), frameId: 3 }, deps()),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });
  });
});

describe('the popup state', () => {
  it('refuses a sender that is not an extension page', async () => {
    installFakeChrome();

    const { fetchImpl, calls } = recordingFetch(() => answerResponse());

    await expect(
      handleMessage(
        { type: 'popupState' },
        { tab: { id: 11 }, url: CNET_URL, frameId: 0 },
        deps({ fetchImpl }),
      ),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(calls).toHaveLength(0);
  });

  it('answers the unlisted card for a tab the list does not carry', async () => {
    const fake = installFakeChrome();

    fake.activeTabUrl = UNLISTED_URL;

    const { fetchImpl, calls } = recordingFetch(() => answerResponse());
    const answer = (await handleMessage(
      { type: 'popupState' },
      popupSender(),
      deps({ fetchImpl }),
    )) as { ok: true; state: PopupState };

    expect(calls).toHaveLength(0);
    expect(answer.state.view.kind).toBe('unlisted');
    expect(answer.state.view.kind === 'unlisted' && answer.state.view.domain).toBe('example.com');
  });

  it('answers the routes of the listed active tab', async () => {
    installFakeChrome();

    const { fetchImpl } = recordingFetch(() => answerResponse());
    const answer = (await handleMessage(
      { type: 'popupState' },
      popupSender(),
      deps({ fetchImpl }),
    )) as { ok: true; state: PopupState };

    expect(answer.state.view.kind).toBe('results');
    expect(answer.state.view.kind === 'results' && answer.state.view.site.tabId).toBe(11);
  });

  it('answers the off state and asks nothing while Detour is off', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.settings] = { enabled: false };

    const { fetchImpl, calls } = recordingFetch(() => answerResponse());
    const answer = (await handleMessage(
      { type: 'popupState' },
      popupSender(),
      deps({ fetchImpl }),
    )) as { ok: true; state: PopupState };

    expect(calls).toHaveLength(0);
    expect(answer.state.view.kind).toBe('off');
  });
});

describe('opening a route', () => {
  it('moves the active tab to the route', async () => {
    const fake = installFakeChrome();
    const route = 'https://arstechnica.com/gadgets/nvidia-custom-silicon/';

    await expect(
      handleMessage({ type: 'openRoute', url: route }, popupSender(), deps()),
    ).resolves.toEqual({ ok: true });

    expect(fake.calls.updates).toEqual([{ tabId: 11, url: route }]);
  });

  it('refuses a sender that is not an extension page', async () => {
    installFakeChrome();

    await expect(
      handleMessage(
        { type: 'openRoute', url: NAVIGATED_URL },
        { tab: { id: 11 }, url: CNET_URL, frameId: 0 },
        deps(),
      ),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });
  });

  it('refuses an address that is not a web page', async () => {
    installFakeChrome();

    await expect(
      handleMessage({ type: 'openRoute', url: 'chrome://settings' }, popupSender(), deps()),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });
  });
});

describe('the message boundary', () => {
  it('rejects a message without a type', async () => {
    installFakeChrome();

    await expect(handleMessage({ url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: false,
      error: 'bad_message',
    });
    await expect(handleMessage(undefined, {}, deps())).resolves.toEqual({
      ok: false,
      error: 'bad_message',
    });
  });

  it('rejects an unknown type', async () => {
    installFakeChrome();

    await expect(handleMessage({ type: 'explode' }, {}, deps())).resolves.toEqual({
      ok: false,
      error: 'unknown_message',
    });
  });

  it('answers a removed list refresh message as unknown', async () => {
    installFakeChrome();

    await expect(handleMessage({ type: 'refreshList' }, {}, deps())).resolves.toEqual({
      ok: false,
      error: 'unknown_message',
    });
  });

  it('answers every message type without throwing', async () => {
    installFakeChrome();

    const { fetchImpl } = recordingFetch(() => listResponse(NETWORK_LIST));
    const worker = deps({ fetchImpl });
    const messages: unknown[] = [
      { type: MESSAGE.isBlocked, url: CNET_URL },
      { type: MESSAGE.blocked, url: CNET_URL, meta: null },
      { type: MESSAGE.popupState },
      { type: MESSAGE.pageState, url: CNET_URL },
      { type: MESSAGE.openRoute, url: CNET_URL },
      { type: MESSAGE.allow, scope: 'always', url: CNET_URL },
      { type: MESSAGE.pass, url: CNET_URL },
      { type: MESSAGE.rememberScope, url: CNET_URL, scope: 'once' },
      { type: MESSAGE.revoke, scope: 'always', host: 'cnet.com' },
      {
        type: MESSAGE.setSettings,
        settings: { enabled: true, autoOpenBest: false, imagesEnabled: true },
      },
      { type: MESSAGE.clearCache },
    ];
    const types = messages.map((message) => (message as { type: string }).type);

    expect(types.sort()).toEqual([...Object.values(MESSAGE)].sort());

    for (const message of messages) {
      const answer = await handleMessage(message, { tab: { id: 7 } }, worker);

      expect(typeof answer.ok, JSON.stringify(message)).toBe('boolean');
    }
  });

  it('rejects a removal that names no host', async () => {
    installFakeChrome();

    await expect(
      handleMessage({ type: 'revoke', scope: 'always', host: '' }, {}, deps()),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });
    await expect(handleMessage({ type: 'revoke', scope: 'always' }, {}, deps())).resolves.toEqual({
      ok: false,
      error: 'bad_message',
    });
  });
});

describe('the remembered scope', () => {
  it('stores the scope that the reader chose', async () => {
    const fake = installFakeChrome();

    await recordCapability(7, CNET_URL);

    await expect(
      handleMessage(
        { type: 'rememberScope', url: CNET_URL, scope: 'once' },
        { tab: { id: 7 } },
        deps(),
      ),
    ).resolves.toEqual({ ok: true });

    expect(fake.storage.local.values[STORAGE.scopeDefaults]).toEqual({ 'cnet.com': 'once' });
  });

  it('clears the entry when the reader chooses the tab scope', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.scopeDefaults] = { 'cnet.com': 'always' };
    await recordCapability(7, CNET_URL);

    await handleMessage(
      { type: 'rememberScope', url: CNET_URL, scope: 'tab' },
      { tab: { id: 7 } },
      deps(),
    );

    expect(fake.storage.local.values[STORAGE.scopeDefaults]).toEqual({});
  });

  it('rejects a choice from a tab without the record', async () => {
    const fake = installFakeChrome();

    await expect(
      handleMessage(
        { type: 'rememberScope', url: CNET_URL, scope: 'once' },
        { tab: { id: 7 } },
        deps(),
      ),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(fake.storage.local.values[STORAGE.scopeDefaults]).toBeUndefined();
  });

  it('rejects a choice for a url that is not listed', async () => {
    const fake = installFakeChrome();

    await recordCapability(7, UNLISTED_URL);

    await expect(
      handleMessage(
        { type: 'rememberScope', url: UNLISTED_URL, scope: 'always' },
        { tab: { id: 7 } },
        deps(),
      ),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(fake.storage.local.values[STORAGE.scopeDefaults]).toBeUndefined();
  });
});

describe('the allowance handlers', () => {
  it('allows a site in the requested scope', async () => {
    const fake = installFakeChrome();

    await recordCapability(7, CNET_URL);

    await expect(
      handleMessage({ type: 'allow', scope: 'always', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({
      ok: true,
      allowances: {
        allowAlways: [{ host: 'cnet.com', addedAt: NOW }],
        allowSession: [],
        allowTabs: [],
      },
    });

    await expect(
      handleMessage({ type: 'allow', scope: 'session', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({
      ok: true,
      allowances: {
        allowAlways: [{ host: 'cnet.com', addedAt: NOW }],
        allowSession: [{ host: 'cnet.com', addedAt: NOW }],
        allowTabs: [],
      },
    });

    await expect(
      handleMessage({ type: 'allow', scope: 'tab', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({
      ok: true,
      allowances: {
        allowAlways: [{ host: 'cnet.com', addedAt: NOW }],
        allowSession: [{ host: 'cnet.com', addedAt: NOW }],
        allowTabs: [{ host: 'cnet.com', tabId: 7, addedAt: NOW }],
      },
    });

    expect(fake.storage.local.values.allowAlways).toEqual([{ host: 'cnet.com', addedAt: NOW }]);
    expect(fake.storage.session.values.allowSession).toEqual([{ host: 'cnet.com', addedAt: NOW }]);
    expect(fake.storage.session.values.allowTabs).toEqual([
      { host: 'cnet.com', tabId: 7, addedAt: NOW },
    ]);
  });

  it('revokes a site in the requested scope', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.allowAlways = [{ host: 'cnet.com', addedAt: NOW }];
    fake.storage.session.values.allowSession = [{ host: 'cnet.com', addedAt: NOW }];
    fake.storage.session.values.allowTabs = [{ host: 'cnet.com', tabId: 7, addedAt: NOW }];

    await expect(
      handleMessage({ type: 'revoke', scope: 'always', host: 'cnet.com' }, {}, deps()),
    ).resolves.toEqual({
      ok: true,
      allowances: {
        allowAlways: [],
        allowSession: [{ host: 'cnet.com', addedAt: NOW }],
        allowTabs: [{ host: 'cnet.com', tabId: 7, addedAt: NOW }],
      },
    });

    await handleMessage({ type: 'revoke', scope: 'session', host: 'cnet.com' }, {}, deps());
    await handleMessage({ type: 'revoke', scope: 'tab', host: 'cnet.com', tabId: 7 }, {}, deps());

    expect(fake.storage.local.values.allowAlways).toEqual([]);
    expect(fake.storage.session.values.allowSession).toEqual([]);
    expect(fake.storage.session.values.allowTabs).toEqual([]);
  });

  it('removes an allowance by host without a list match', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.allowAlways = [{ host: 'old-publisher.example', addedAt: NOW }];

    await expect(
      handleMessage({ type: 'revoke', scope: 'always', host: 'old-publisher.example' }, {}, deps()),
    ).resolves.toEqual({
      ok: true,
      allowances: { allowAlways: [], allowSession: [], allowTabs: [] },
    });

    expect(fake.storage.local.values.allowAlways).toEqual([]);
  });

  it('keeps a tab removal scoped to its tab', async () => {
    const fake = installFakeChrome();

    fake.storage.session.values.allowTabs = [
      { host: 'cnet.com', tabId: 7, addedAt: NOW },
      { host: 'cnet.com', tabId: 9, addedAt: NOW },
    ];

    await expect(
      handleMessage({ type: 'revoke', scope: 'tab', host: 'cnet.com', tabId: 7 }, {}, deps()),
    ).resolves.toEqual({
      ok: true,
      allowances: {
        allowAlways: [],
        allowSession: [],
        allowTabs: [{ host: 'cnet.com', tabId: 9, addedAt: NOW }],
      },
    });

    expect(fake.storage.session.values.allowTabs).toEqual([
      { host: 'cnet.com', tabId: 9, addedAt: NOW },
    ]);
  });

  it('rejects an allowance for a url that is not listed', async () => {
    const fake = installFakeChrome();

    await recordCapability(7, UNLISTED_URL);

    await expect(
      handleMessage(
        { type: 'allow', scope: 'always', url: UNLISTED_URL },
        { tab: { id: 7 } },
        deps(),
      ),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(fake.storage.local.values.allowAlways).toBeUndefined();
    expect(fake.storage.session.values.allowSession).toBeUndefined();
    expect(fake.storage.session.values.allowTabs).toBeUndefined();
  });

  it('denies an allowance to a caller with no capability and writes nothing', async () => {
    const fake = installFakeChrome();

    await expect(
      handleMessage({ type: 'allow', scope: 'always', url: CNET_URL }, {}, deps()),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(fake.storage.local.values.allowAlways).toBeUndefined();
    expect(fake.storage.session.values.allowSession).toBeUndefined();
    expect(fake.storage.session.values.allowTabs).toBeUndefined();
  });

  it('denies an allowance to the wrong tab and writes nothing', async () => {
    const fake = installFakeChrome();

    await recordCapability(7, CNET_URL);

    await expect(
      handleMessage({ type: 'allow', scope: 'always', url: CNET_URL }, { tab: { id: 9 } }, deps()),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(fake.storage.local.values.allowAlways).toBeUndefined();
    expect(fake.storage.session.values.allowTabs).toBeUndefined();
  });

  it('denies an allowance for the wrong url and writes nothing', async () => {
    const fake = installFakeChrome();

    await recordCapability(7, CNET_URL);

    await expect(
      handleMessage(
        { type: 'allow', scope: 'always', url: STOPPED_URL },
        { tab: { id: 7 } },
        deps(),
      ),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(fake.storage.local.values.allowAlways).toBeUndefined();
    expect(fake.storage.session.values.allowTabs).toBeUndefined();
  });

  it('denies a tab allowance to a sender with no tab', async () => {
    installFakeChrome();

    await expect(
      handleMessage({ type: 'allow', scope: 'tab', url: CNET_URL }, {}, deps()),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });
  });

  it('drops the allowances of a closed tab', async () => {
    const fake = installFakeChrome();

    fake.storage.session.values.allowTabs = [
      { host: 'cnet.com', tabId: 7, addedAt: NOW },
      { host: 'cnet.com', tabId: 9, addedAt: NOW },
    ];

    await pruneTabAllowances(7);

    expect(fake.storage.session.values.allowTabs).toEqual([
      { host: 'cnet.com', tabId: 9, addedAt: NOW },
    ]);
  });
});

describe('the settings handler', () => {
  it('stores the reading settings', async () => {
    const fake = installFakeChrome();
    const settings = {
      enabled: false,
      autoOpenBest: true,
      imagesEnabled: false,
      theme: 'system' as const,
      walls: {
        hard: ['adblock'] as WallCategory[],
        soft: ['adblock'] as WallCategory[],
        metered: [] as WallCategory[],
      },
    };

    await expect(handleMessage({ type: 'setSettings', settings }, {}, deps())).resolves.toEqual({
      ok: true,
      settings,
    });

    expect(fake.storage.local.values.settings).toEqual(settings);
    await expect(handleMessage({ type: 'isBlocked', url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: true,
      blocked: false,
      site: null,
    });
  });

  it('rejects a settings record that the contract cannot hold', async () => {
    const fake = installFakeChrome();

    await expect(
      handleMessage(
        {
          type: 'setSettings',
          settings: { enabled: true, autoOpenBest: true, imagesEnabled: true },
        },
        {},
        deps(),
      ),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });
    await expect(
      handleMessage(
        { type: 'setSettings', settings: { enabled: 'yes', autoOpenBest: null, imagesEnabled: 1 } },
        {},
        deps(),
      ),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });
    await expect(
      handleMessage(
        {
          type: 'setSettings',
          settings: {
            enabled: true,
            autoOpenBest: true,
            imagesEnabled: true,
            theme: 'sepia',
            walls: { hard: [], soft: [], metered: [] },
          },
        },
        {},
        deps(),
      ),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(fake.storage.local.values.settings).toBeUndefined();
  });
});

describe('the one-time pass', () => {
  it('writes a pass for the tab that the guard stopped on this url', async () => {
    const fake = installFakeChrome();

    await recordCapability(7, CNET_URL);

    await expect(
      handleMessage({ type: 'pass', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({ ok: true });

    expect(fake.storage.session.values[`${STORAGE.pass}7`]).toBe(await sha256Hex(CNET_URL));
  });

  it('refuses a pass for a page that this tab was not stopped on', async () => {
    const fake = installFakeChrome();

    await expect(
      handleMessage({ type: 'pass', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({ ok: false, error: 'bad_message' });

    expect(fake.storage.session.values[`${STORAGE.pass}7`]).toBeUndefined();
  });

  it('opens the page once and stops the next visit', async () => {
    installFakeChrome();

    await recordPass(7, CNET_URL);

    await expect(
      handleMessage({ type: 'isBlocked', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({ ok: true, blocked: false, site: null });

    await expect(
      handleMessage({ type: 'isBlocked', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({ ok: true, blocked: true, site: CNET_SITE });
  });

  it('does not let a pass for another page open this one', async () => {
    installFakeChrome();

    await recordPass(7, 'https://www.cnet.com/another-story/');

    await expect(
      handleMessage({ type: 'isBlocked', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({ ok: true, blocked: true, site: CNET_SITE });
  });

  it('does not let a pass of another tab open it', async () => {
    installFakeChrome();

    await recordPass(9, CNET_URL);

    await expect(
      handleMessage({ type: 'isBlocked', url: CNET_URL }, { tab: { id: 7 } }, deps()),
    ).resolves.toEqual({ ok: true, blocked: true, site: CNET_SITE });
  });
});

describe('the list refresh', () => {
  it('refreshes the list from the worker', async () => {
    const fake = installFakeChrome();
    const { fetchImpl, calls } = recordingFetch(() => listResponse(NETWORK_LIST));

    await expect(refreshList(deps({ fetchImpl }))).resolves.toEqual({
      listId: await idOf(NETWORK_LIST),
      source: 'network',
      disabled: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${API_BASE}/v1/list`);
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(fake.storage.local.values.list).toEqual({
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: NOW,
      listId: await idOf(NETWORK_LIST),
      list: NETWORK_LIST,
    });
  });

  it('keeps the stored list when the refresh fails', async () => {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => new Response('busy', { status: 503 }));

    await writeStoredList(NOW - 1_000, NETWORK_LIST, STORED_ID);

    await expect(refreshList(deps({ fetchImpl }))).resolves.toEqual({
      listId: STORED_ID,
      source: 'stored',
      disabled: false,
    });

    expect(fake.storage.local.values.list).toEqual({
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: NOW - 1_000,
      listId: STORED_ID,
      list: NETWORK_LIST,
    });
  });

  it('falls back to the bundled list when nothing is stored and the refresh fails', async () => {
    installFakeChrome();

    await expect(
      refreshList(
        deps({
          fetchImpl: async () => {
            throw new Error('offline');
          },
        }),
      ),
    ).resolves.toEqual({
      listId: BUNDLED_LIST_ID,
      source: 'bundled',
      disabled: BUNDLED_LIST.disabled,
    });
  });

  it('stores a disabled list', async () => {
    const fake = installFakeChrome();
    const disabled = { ...NETWORK_LIST, disabled: true };
    const { fetchImpl } = recordingFetch(() => listResponse(disabled));

    await expect(refreshList(deps({ fetchImpl }))).resolves.toEqual({
      listId: await idOf(disabled),
      source: 'network',
      disabled: true,
    });

    expect(fake.storage.local.values.list).toEqual({
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: NOW,
      listId: await idOf(disabled),
      list: disabled,
    });
    await expect(handleMessage({ type: 'isBlocked', url: CNET_URL }, {}, deps())).resolves.toEqual({
      ok: true,
      blocked: false,
      site: null,
    });
  });
});

describe('the clearCache handler', () => {
  it('removes the cache keys and downloads the list again', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.list] = { storageVersion: 1, fetchedAt: 1, list: {} };
    fake.storage.local.values[`${STORAGE.alt}aaa`] = { answer: {}, storedAt: 1 };
    fake.storage.local.values[`${STORAGE.meta}bbb`] = { meta: {}, storedAt: 1 };
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };

    const { fetchImpl, calls } = recordingFetch(() => listResponse(NETWORK_LIST));

    await expect(handleMessage({ type: 'clearCache' }, {}, deps({ fetchImpl }))).resolves.toEqual({
      ok: true,
      cleared: 3,
    });

    expect(calls.map((call) => call.url)).toEqual([`${API_BASE}/v1/list`]);
    expect(fake.storage.local.values[STORAGE.settings]).toBeDefined();

    const stored = fake.storage.local.values[STORAGE.list] as { listId: string } | undefined;

    expect(stored?.listId).toBe(await idOf(NETWORK_LIST));
  });

  it('keeps the bundled copy when the download fails', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.list] = { storageVersion: 1, fetchedAt: 1, list: {} };
    fake.storage.local.values[`${STORAGE.alt}aaa`] = { answer: {}, storedAt: 1 };
    fake.storage.local.values[STORAGE.settings] = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };

    const { fetchImpl } = recordingFetch(() => {
      throw new Error('offline');
    });

    await expect(handleMessage({ type: 'clearCache' }, {}, deps({ fetchImpl }))).resolves.toEqual({
      ok: true,
      cleared: 2,
    });

    expect(fake.storage.local.values[STORAGE.settings]).toBeDefined();
    expect(fake.storage.local.values[STORAGE.list]).toBeUndefined();
  });

  it('answers an error when the store fails', async () => {
    const fake = installFakeChrome();

    fake.storage.local.failReads = true;

    await expect(handleMessage({ type: 'clearCache' }, {}, deps())).resolves.toEqual({
      ok: false,
      error: 'bad_message',
    });
  });
});
