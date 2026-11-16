// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import { installFramedWindow, restoreWindowTop } from './testing/frame';
import { mountShell, readShell, role } from './testing/shell';

const URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';

let fake: FakeChrome;

beforeEach(() => {
  fake = installFakeChrome();
  mountShell(readShell('block.html'));
  history.replaceState({}, '', `/block.html?u=${encodeURIComponent(URL)}`);
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreWindowTop();
  document.body.innerHTML = '';
  resetFakeChrome();
});

describe('the block page entry', () => {
  it('draws nothing and sends nothing in a framed document', async () => {
    installFramedWindow();

    const read = vi.spyOn(fake.storage.local, 'get');
    const send = vi.spyOn(fake.runtime, 'sendMessage');

    vi.resetModules();

    await import('./block-entry');

    // One macrotask: an unframed page would have read the store and asked by now.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(send).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(role('headline').textContent).toBe('');
    expect(role('source-link').textContent).toBe('');
    expect(role('chip').hidden).toBe(true);
  });
});
