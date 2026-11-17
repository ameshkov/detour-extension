import { afterEach, describe, expect, it } from 'vitest';

import { clearCache } from './cache';
import { STORAGE } from './constants';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';

const SETTINGS = { enabled: true, autoOpenBest: false, imagesEnabled: true };

afterEach(() => {
  resetFakeChrome();
});

describe('the cache', () => {
  it('removes the list, the answers, and the metadata', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.list] = { storageVersion: 1, fetchedAt: 1, list: {} };
    fake.storage.local.values[`${STORAGE.alt}aaa`] = { answer: {}, storedAt: 1 };
    fake.storage.local.values[`${STORAGE.meta}bbb`] = { meta: {}, storedAt: 1 };

    await expect(clearCache()).resolves.toBe(3);
    expect(fake.storage.local.values).toEqual({});
  });

  it('keeps the settings, the allowances, and the stopped tabs', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.settings] = SETTINGS;
    fake.storage.local.values[STORAGE.pauseUntil] = 42;
    fake.storage.local.values[STORAGE.allowAlways] = [{ host: 'forbes.com', addedAt: 1 }];
    fake.storage.local.values[`${STORAGE.alt}aaa`] = { answer: {}, storedAt: 1 };
    fake.storage.session.values[`${STORAGE.capability}11`] = 'digest';
    fake.storage.session.values[STORAGE.allowTabs] = [
      { host: 'forbes.com', tabId: 11, addedAt: 1 },
    ];

    await expect(clearCache()).resolves.toBe(1);

    expect(fake.storage.local.values[STORAGE.settings]).toEqual(SETTINGS);
    expect(fake.storage.local.values[STORAGE.pauseUntil]).toBe(42);
    expect(fake.storage.local.values[STORAGE.allowAlways]).toHaveLength(1);
    expect(fake.storage.session.values[`${STORAGE.capability}11`]).toBe('digest');
    expect(fake.storage.session.values[STORAGE.allowTabs]).toHaveLength(1);
  });

  it('answers zero when nothing is cached', async () => {
    installFakeChrome();

    await expect(clearCache()).resolves.toBe(0);
  });
});
