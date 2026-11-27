// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GUARD_TIMEOUT_MS, META_HEAD_WAIT_MS } from './constants';
import { GUARD_LINK_LABEL } from './copy';
import { awaitHeadClose } from './guard';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';

const LISTED_URL = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';
const QUERY_URL = 'https://www.example.com/story?id=7&ref=home#top';
const BLOCK_PAGE_URL = 'chrome-extension://jcncblagncbpbamfnekhdkomffdpehpk/block.html?u=x';
const LISTED_SITE = {
  domain: 'cnet.com',
  name: 'CNET',
  walls: [{ category: 'adblock', type: 'soft' }],
} as const;

type MessageAnswer = (message: unknown) => unknown;
type StopSpy = ReturnType<typeof vi.fn>;

let fake: FakeChrome;
let stop: StopSpy;

/** A fresh module instance, because the once-per-document marker is module state. */
async function loadGuard(): Promise<(href?: string) => Promise<void>> {
  vi.resetModules();

  const module = await import('./guard');

  return module.runGuard;
}

function answerIsBlocked(answer: MessageAnswer): void {
  fake.respond('isBlocked', answer);
}

function answerBlocked(answer: MessageAnswer): void {
  fake.respond('blocked', answer);
}

function visibility(): string {
  return document.documentElement.style.getPropertyValue('visibility');
}

function hasVisibilityRule(): boolean {
  return document.documentElement.getAttribute('style') !== null;
}

function installStop(): StopSpy {
  const spy = vi.fn();

  Object.defineProperty(window, 'stop', { value: spy, configurable: true });

  return spy;
}

beforeEach(() => {
  fake = installFakeChrome();
  document.body.innerHTML = '';
  stop = installStop();
});

afterEach(() => {
  vi.useRealTimers();
  resetFakeChrome();
  document.documentElement.removeAttribute('style');
});

describe('the guard', () => {
  it('hides the document before it asks', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => {
      expect(visibility()).toBe('hidden');

      return { ok: true, blocked: false, site: null };
    });

    const run = runGuard(LISTED_URL);

    expect(visibility()).toBe('hidden');
    expect(fake.calls.messages).toEqual([{ type: 'isBlocked', url: LISTED_URL }]);

    await run;
  });

  it('hides the document with an important rule', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => ({ ok: true, blocked: false, site: null }));

    const run = runGuard(LISTED_URL);

    expect(document.documentElement.style.getPropertyPriority('visibility')).toBe('important');

    await run;
  });

  it('stops the page on a listed url', async () => {
    const runGuard = await loadGuard();
    const order: string[] = [];

    stop.mockImplementation(() => {
      order.push('stop');
    });

    answerIsBlocked(() => ({ ok: true, blocked: true, site: LISTED_SITE }));
    answerBlocked(() => {
      order.push('blocked');

      return { ok: true, blockPageUrl: BLOCK_PAGE_URL };
    });

    await runGuard(LISTED_URL);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['stop', 'blocked']);
    expect(fake.calls.messages).toEqual([
      { type: 'isBlocked', url: LISTED_URL },
      {
        type: 'blocked',
        url: LISTED_URL,
        meta: { title: null, description: null, icon: 'https://www.cnet.com/favicon.ico' },
      },
    ]);
  });

  it('stops the page for an answer that takes most of the budget', async () => {
    const runGuard = await loadGuard();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let answer: (value: unknown) => void = () => {};

    answerIsBlocked(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    answerBlocked(() => ({ ok: true, blockPageUrl: BLOCK_PAGE_URL }));

    const run = runGuard(LISTED_URL);

    // A cold worker needs more than the start of the budget, and the page must
    // still stop when the answer arrives inside it.
    vi.advanceTimersByTime(GUARD_TIMEOUT_MS - 100);
    answer({ ok: true, blocked: true, site: LISTED_SITE });

    await run;

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('restores the page on an unlisted url', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => ({ ok: true, blocked: false, site: null }));

    await runGuard(LISTED_URL);

    expect(hasVisibilityRule()).toBe(false);
    expect(stop).not.toHaveBeenCalled();
  });

  it('restores the page when the worker does not answer in time', async () => {
    const runGuard = await loadGuard();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    answerIsBlocked(() => new Promise(() => {}));

    const run = runGuard(LISTED_URL);

    expect(visibility()).toBe('hidden');

    vi.advanceTimersByTime(GUARD_TIMEOUT_MS);

    await run;

    expect(hasVisibilityRule()).toBe(false);
    expect(stop).not.toHaveBeenCalled();
  });

  it('ignores an answer that arrives after the timeout', async () => {
    const runGuard = await loadGuard();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let answer: (value: unknown) => void = () => {};

    answerIsBlocked(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    const run = runGuard(LISTED_URL);

    vi.advanceTimersByTime(GUARD_TIMEOUT_MS);

    await run;

    answer({ ok: true, blocked: true, site: LISTED_SITE });
    await Promise.resolve();
    await Promise.resolve();

    expect(stop).not.toHaveBeenCalled();
    expect(hasVisibilityRule()).toBe(false);
    expect(fake.calls.messages).toEqual([{ type: 'isBlocked', url: LISTED_URL }]);
  });

  it('restores the page when the message fails', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => Promise.reject(new Error('the worker is gone')));

    await runGuard(LISTED_URL);

    expect(hasVisibilityRule()).toBe(false);
    expect(stop).not.toHaveBeenCalled();
  });

  it('restores the page when the navigation message fails', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => ({ ok: true, blocked: true, site: LISTED_SITE }));
    answerBlocked(() => Promise.reject(new Error('the worker is gone')));

    await runGuard(LISTED_URL);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(hasVisibilityRule()).toBe(false);
    expect(document.body.querySelectorAll('a')).toHaveLength(0);
  });

  it('leaves no link when the failure answer carries no url', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => ({ ok: true, blocked: true, site: LISTED_SITE }));
    answerBlocked(() => ({ ok: false, error: 'navigation_failed' }));

    await runGuard(LISTED_URL);

    expect(hasVisibilityRule()).toBe(false);
    expect(document.body.querySelectorAll('a')).toHaveLength(0);
  });

  it('runs once on one document', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => ({ ok: true, blocked: false, site: null }));

    await runGuard(LISTED_URL);
    await runGuard(LISTED_URL);

    expect(fake.calls.messages).toEqual([{ type: 'isBlocked', url: LISTED_URL }]);
  });

  it('leaves no marker on the document', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => ({ ok: true, blocked: true, site: LISTED_SITE }));
    answerBlocked(() => ({
      ok: false,
      error: 'navigation_failed',
      blockPageUrl: BLOCK_PAGE_URL,
    }));

    await runGuard(LISTED_URL);
    await runGuard(LISTED_URL);

    expect(document.documentElement.getAttributeNames()).toEqual([]);
  });

  it('shows a link when the navigation fails', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => ({ ok: true, blocked: true, site: LISTED_SITE }));
    answerBlocked(() => ({
      ok: false,
      error: 'navigation_failed',
      blockPageUrl: BLOCK_PAGE_URL,
    }));

    await runGuard(LISTED_URL);

    const links = document.body.querySelectorAll('a');

    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(BLOCK_PAGE_URL);
    expect(links[0]?.textContent).toBe(GUARD_LINK_LABEL);
    expect(hasVisibilityRule()).toBe(false);
  });

  it('leaves the page stopped when the navigation succeeds', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => ({ ok: true, blocked: true, site: LISTED_SITE }));
    answerBlocked(() => ({ ok: true, blockPageUrl: BLOCK_PAGE_URL }));

    await runGuard(LISTED_URL);

    expect(document.body.querySelectorAll('a')).toHaveLength(0);
    expect(visibility()).toBe('hidden');
  });

  it('reads the head after the stop and sends it with the blocked message', async () => {
    const runGuard = await loadGuard();

    document.title = 'Before the stop';
    stop.mockImplementation(() => {
      document.title = 'After the stop';
    });

    answerIsBlocked(() => ({ ok: true, blocked: true, site: LISTED_SITE }));
    answerBlocked(() => ({ ok: true, blockPageUrl: BLOCK_PAGE_URL }));

    await runGuard(LISTED_URL);

    const [, blocked] = fake.calls.messages;

    expect(blocked).toMatchObject({ type: 'blocked', meta: { title: 'After the stop' } });
  });

  it('sends the original url with its query', async () => {
    const runGuard = await loadGuard();

    answerIsBlocked(() => ({ ok: true, blocked: false, site: null }));

    await runGuard(QUERY_URL);

    expect(fake.calls.messages).toEqual([{ type: 'isBlocked', url: QUERY_URL }]);
  });
});

describe('the head wait', () => {
  it('resolves at once when the head already closed', async () => {
    const resolved = vi.fn();

    void awaitHeadClose(document, 10_000).then(resolved);

    await vi.waitFor(() => {
      expect(resolved).toHaveBeenCalledTimes(1);
    });
  });

  it('resolves on the mutation that inserts the body', async () => {
    vi.useFakeTimers();

    const body = document.body;
    const parent = body.parentNode as HTMLElement;

    parent.removeChild(body);

    const resolved = vi.fn();

    void awaitHeadClose(document, META_HEAD_WAIT_MS).then(resolved);

    // The timer has not run, so only the observer can settle this.
    parent.append(body);

    for (let tick = 0; tick < 5; tick += 1) {
      await Promise.resolve();
    }

    expect(resolved).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('resolves at the cap when no body arrives', async () => {
    vi.useFakeTimers();

    const body = document.body;
    const parent = body.parentNode as HTMLElement;

    parent.removeChild(body);

    const resolved = vi.fn();

    void awaitHeadClose(document, META_HEAD_WAIT_MS).then(resolved);
    vi.advanceTimersByTime(META_HEAD_WAIT_MS);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledTimes(1);

    parent.append(body);
    vi.useRealTimers();
  });

  it('disconnects the observer when it settles', async () => {
    vi.useFakeTimers();

    const body = document.body;
    const parent = body.parentNode as HTMLElement;

    parent.removeChild(body);

    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');

    void awaitHeadClose(document, META_HEAD_WAIT_MS);
    vi.advanceTimersByTime(META_HEAD_WAIT_MS);
    await Promise.resolve();

    expect(disconnect).toHaveBeenCalled();
    disconnect.mockRestore();
    parent.append(body);
    vi.useRealTimers();
  });
});
