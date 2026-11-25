import type { SitesJson } from '@detour/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerBackground } from './background';
import { STORAGE } from './constants';
import type { FetchLike } from './net';
import { BUNDLED_LIST } from './storage';
import { LISTED_BADGE, TOOLBAR_OFF_TITLE, TOOLBAR_PAUSED_TITLE } from './copy';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';

const NOW = 1_700_000_000_000;
const API_BASE = 'http://127.0.0.1:8787';
const CNET_URL = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';

type FetchCall = { url: string; init?: RequestInit };

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

function listResponse(list: SitesJson): Response {
  return new Response(JSON.stringify(list), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function triggerMessage(
  fake: FakeChrome,
  message: unknown,
  sender: unknown,
  sendResponse: (answer: unknown) => void,
): unknown {
  const listener = fake.runtime.onMessage.listeners[0];

  if (listener === undefined) {
    throw new Error('the message listener is not registered');
  }

  return (listener as (...args: unknown[]) => unknown)(message, sender, sendResponse);
}

/** A tick of the event loop, for an event handler that repaints in the background. */
function tick(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}

afterEach(() => {
  resetFakeChrome();
});

describe('the toolbar', () => {
  function registered(): FakeChrome {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => listResponse(BUNDLED_LIST));

    registerBackground({ apiBase: API_BASE, now: () => NOW, fetchImpl });

    return fake;
  }

  it('registers every event that repaints it', () => {
    const fake = registered();

    expect(fake.tabs.onActivated.listeners).toHaveLength(1);
    expect(fake.tabs.onUpdated.listeners).toHaveLength(1);
    expect(fake.windows.onFocusChanged.listeners).toHaveLength(1);
    expect(fake.storage.onChanged.listeners).toHaveLength(1);
  });

  it('badges the site when a tab takes the focus', async () => {
    const fake = registered();

    fake.tabs.onActivated.trigger({ tabId: 11, windowId: 1 });

    await vi.waitFor(() => {
      expect(fake.calls.badges).toContain(LISTED_BADGE);
    });
    expect(fake.calls.titles.at(-1)).toContain('cnet.com');
  });

  it('repaints on a navigation and not on the other updates of a tab', async () => {
    const fake = registered();

    fake.tabs.onUpdated.trigger(11, { status: 'loading' }, {});
    await tick();

    expect(fake.calls.badges).toEqual([]);

    fake.tabs.onUpdated.trigger(11, { url: 'https://www.cnet.com/tech/' }, {});
    await vi.waitFor(() => {
      expect(fake.calls.badges).toContain(LISTED_BADGE);
    });
  });

  it('grays the mark when the settings switch Detour off', async () => {
    const fake = registered();

    fake.storage.local.values[STORAGE.settings] = { enabled: false };
    fake.storage.onChanged.trigger(
      { [STORAGE.settings]: { newValue: { enabled: false } } },
      'local',
    );

    await vi.waitFor(() => {
      expect(fake.calls.titles.at(-1)).toBe(TOOLBAR_OFF_TITLE);
    });
    expect(fake.calls.icons.at(-1)?.[16]).toBe('icon-off-16.png');
  });

  it('repaints when the session pause changes', async () => {
    const fake = registered();

    fake.storage.session.values[STORAGE.pauseSession] = true;
    fake.storage.onChanged.trigger({ [STORAGE.pauseSession]: { newValue: true } }, 'session');

    await vi.waitFor(() => {
      expect(fake.calls.titles.at(-1)).toBe(TOOLBAR_PAUSED_TITLE);
    });
  });

  it('ignores a write that the toolbar does not read', async () => {
    const fake = registered();

    fake.storage.onChanged.trigger({ 'alt:abc': { newValue: {} } }, 'local');
    await tick();

    expect(fake.calls.badges).toEqual([]);
  });
});

describe('the background registration', () => {
  it('registers the refresh alarm for six hours', () => {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => listResponse(BUNDLED_LIST));

    registerBackground({ apiBase: API_BASE, now: () => NOW, fetchImpl });

    fake.runtime.onInstalled.trigger();

    expect(fake.calls.createdAlarms).toEqual([{ name: 'list-refresh', periodInMinutes: 360 }]);
  });

  it('refreshes on browser start', async () => {
    const fake = installFakeChrome();
    const { fetchImpl, calls } = recordingFetch(() => listResponse(BUNDLED_LIST));

    registerBackground({ apiBase: API_BASE, now: () => NOW, fetchImpl });

    fake.runtime.onStartup.trigger();

    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });

    expect(calls[0]?.url).toBe(`${API_BASE}/v1/list`);
    expect(fake.calls.createdAlarms).toEqual([{ name: 'list-refresh', periodInMinutes: 360 }]);
  });

  it('refreshes when the alarm fires', async () => {
    const fake = installFakeChrome();
    const { fetchImpl, calls } = recordingFetch(() => listResponse(BUNDLED_LIST));

    registerBackground({ apiBase: API_BASE, now: () => NOW, fetchImpl });

    fake.alarms.onAlarm.trigger({ name: 'list-refresh' });

    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
  });

  it('drops the allowances of a closed tab', async () => {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => listResponse(BUNDLED_LIST));

    fake.storage.session.values.allowTabs = [{ host: 'cnet.com', tabId: 7, addedAt: NOW }];

    registerBackground({ apiBase: API_BASE, now: () => NOW, fetchImpl });

    fake.tabs.onRemoved.trigger(7);

    await vi.waitFor(() => {
      expect(fake.storage.session.values.allowTabs).toEqual([]);
    });
  });

  it('drops the capability of a closed tab', async () => {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => listResponse(BUNDLED_LIST));

    fake.storage.session.values[`${STORAGE.capability}7`] = 'a-digest';
    fake.storage.session.values[`${STORAGE.capability}9`] = 'another-digest';

    registerBackground({ apiBase: API_BASE, now: () => NOW, fetchImpl });

    fake.tabs.onRemoved.trigger(7);

    await vi.waitFor(() => {
      expect(fake.storage.session.values[`${STORAGE.capability}7`]).toBeUndefined();
      expect(fake.storage.session.values[`${STORAGE.capability}9`]).toBe('another-digest');
    });
  });

  it('drops the pass of a closed tab', async () => {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => listResponse(BUNDLED_LIST));

    fake.storage.session.values[`${STORAGE.pass}7`] = 'a-digest';
    fake.storage.session.values[`${STORAGE.pass}9`] = 'another-digest';

    registerBackground({ apiBase: API_BASE, now: () => NOW, fetchImpl });

    fake.tabs.onRemoved.trigger(7);

    await vi.waitFor(() => {
      expect(fake.storage.session.values[`${STORAGE.pass}7`]).toBeUndefined();
      expect(fake.storage.session.values[`${STORAGE.pass}9`]).toBe('another-digest');
    });
  });

  it('answers a message through the send response callback', async () => {
    const fake = installFakeChrome();
    const { fetchImpl } = recordingFetch(() => listResponse(BUNDLED_LIST));
    const sendResponse = vi.fn();

    registerBackground({ apiBase: API_BASE, now: () => NOW, fetchImpl });

    const returned = triggerMessage(
      fake,
      { type: 'isBlocked', url: CNET_URL },
      { tab: { id: 7 } },
      sendResponse,
    );

    expect(returned).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        blocked: true,
        site: { domain: 'cnet.com', name: 'CNET', walls: [{ category: 'adblock', type: 'soft' }] },
      });
    });
  });

  it('imports without an api base and registers nothing', async () => {
    const fake = installFakeChrome();

    vi.resetModules();

    await expect(import('./background')).resolves.toBeDefined();

    fake.runtime.onInstalled.trigger();

    expect(fake.calls.createdAlarms).toEqual([]);
  });
});
