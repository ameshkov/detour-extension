// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ALLOWED_SITES } from './copy';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import { mountShell, readShell } from './testing/shell';

beforeEach(() => {
  installFakeChrome();
  mountShell(readShell('options.html'));
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
  resetFakeChrome();
});

describe('the options page entry', () => {
  it('renders the page when the bundle loads', async () => {
    await import('./options-entry');

    await vi.waitFor(() => {
      expect(document.querySelector('[data-role="allowed-heading"]')?.textContent ?? null).toBe(
        ALLOWED_SITES,
      );
    });
  });
});
