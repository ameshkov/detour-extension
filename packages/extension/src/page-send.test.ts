import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE } from './constants';
import type { PauseMessage } from './messages';
import { createPageSender } from './page-send';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';

const NOW = Date.UTC(2026, 10, 13, 12, 0);
const PAUSE: PauseMessage = { type: MESSAGE.pause, until: NOW, session: false };

let fake: FakeChrome;

beforeEach(() => {
  fake = installFakeChrome();
});

afterEach(() => {
  resetFakeChrome();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the page sender', () => {
  it('sends the message and reloads after it settles', async () => {
    const sender = createPageSender('popup');
    const reload = vi.fn();

    sender.send(PAUSE, reload);

    expect(fake.calls.messages).toEqual([PAUSE]);
    expect(reload).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it('reloads and logs a rejected send', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation((): void => undefined);
    const error = new Error('no listener');
    const sender = createPageSender('popup');
    const reload = vi.fn();

    vi.stubGlobal('DEV', true);
    fake.respond('pause', () => Promise.reject(error));
    sender.send(PAUSE, reload);

    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(log).toHaveBeenCalledWith('[detour] popup: the message failed', error);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('holds a send that throws before it returns a promise', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation((): void => undefined);
    const error = new Error('no runtime');
    const sender = createPageSender('popup');
    const reload = vi.fn();

    vi.stubGlobal('DEV', true);
    fake.runtime.sendMessage = (): Promise<unknown> => {
      throw error;
    };
    sender.send(PAUSE, reload);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[detour] popup: the message failed', error);
  });

  it('runs the guarded work and then its after', async () => {
    const sender = createPageSender('popup');

    sender.guard(() => chrome.runtime.openOptionsPage());

    await vi.waitFor(() => {
      expect(fake.calls.openedOptionsPage).toBe(1);
    });

    const after = vi.fn();

    sender.guard(() => Promise.resolve('done'), after);

    await vi.waitFor(() => {
      expect(after).toHaveBeenCalledTimes(1);
    });
    expect(after).toHaveBeenCalledTimes(1);
  });
});
