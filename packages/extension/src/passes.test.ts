import { afterEach, describe, expect, it } from 'vitest';

import { STORAGE } from './constants';
import { consumePass, prunePass, recordPass } from './passes';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';

const URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';
const OTHER_URL = 'https://www.forbes.com/sites/richardnieva/2026/10/15/another-story/';

afterEach(() => {
  resetFakeChrome();
});

describe('the one-time pass', () => {
  it('opens one navigation and is spent', async () => {
    installFakeChrome();

    await recordPass(7, URL);

    await expect(consumePass(7, URL)).resolves.toBe(true);
    await expect(consumePass(7, URL)).resolves.toBe(false);
  });

  it('names the url, so another page does not spend it', async () => {
    installFakeChrome();

    await recordPass(7, URL);

    await expect(consumePass(7, OTHER_URL)).resolves.toBe(false);
    await expect(consumePass(7, URL)).resolves.toBe(true);
  });

  it('belongs to one tab', async () => {
    installFakeChrome();

    await recordPass(9, URL);

    await expect(consumePass(7, URL)).resolves.toBe(false);
    await expect(consumePass(9, URL)).resolves.toBe(true);
  });

  it('answers false without a tab', async () => {
    installFakeChrome();

    await recordPass(7, URL);

    await expect(consumePass(undefined, URL)).resolves.toBe(false);
  });

  it('drops the pass of a closed tab', async () => {
    const fake = installFakeChrome();

    await recordPass(7, URL);
    await recordPass(9, URL);
    await prunePass(7);

    expect(fake.storage.session.values[`${STORAGE.pass}7`]).toBeUndefined();
    expect(fake.storage.session.values[`${STORAGE.pass}9`]).toBeDefined();
  });
});
