import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, LIST_STORAGE_VERSION } from './constants';
import { BUNDLED_LIST_ID } from './sites-id';
import {
  BUNDLED_LIST,
  isSettings,
  readAllowance,
  readAllowances,
  readList,
  readListId,
  readSettings,
  readStoredList,
  writeAllowance,
  writeStoredList,
} from './storage';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';

afterEach(() => {
  resetFakeChrome();
});

describe('the settings store', () => {
  it('reads the default settings', async () => {
    installFakeChrome();

    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('accepts the settings shape and nothing else', () => {
    expect(isSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(isSettings({ ...DEFAULT_SETTINGS, theme: 'sepia' })).toBe(false);
    expect(isSettings({ ...DEFAULT_SETTINGS, enabled: 'yes' })).toBe(false);
    expect(isSettings({ enabled: true })).toBe(false);
    expect(isSettings(null)).toBe(false);
  });

  it('merges a stored setting over the defaults', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.settings = { enabled: false };

    await expect(readSettings()).resolves.toEqual({
      enabled: false,
      autoOpenBest: false,
      imagesEnabled: true,
      theme: 'system',
      walls: { hard: ['adblock'], soft: ['adblock'], metered: [] },
    });
  });

  it('reads a stored theme back and falls back to the system', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.settings = { theme: 'dark' };

    await expect(readSettings()).resolves.toMatchObject({ theme: 'dark' });

    fake.storage.local.values.settings = { theme: 'sepia' };

    await expect(readSettings()).resolves.toMatchObject({ theme: 'system' });
  });

  it('reads a stored wall choice back', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.settings = {
      enabled: true,
      walls: { hard: ['adblock', 'paywall'], soft: [], metered: ['paywall'] },
    };

    await expect(readSettings()).resolves.toEqual({
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
      theme: 'system',
      walls: {
        hard: ['adblock', 'paywall'],
        soft: [],
        metered: ['paywall'],
      },
    });
  });

  it('drops a stored wall that the list cannot hold', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.settings = {
      enabled: true,
      walls: { hard: ['ads', 'adblock'], soft: 'adblock', metered: ['adblock'] },
    };

    await expect(readSettings()).resolves.toEqual({
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
      theme: 'system',
      walls: { hard: ['adblock'], soft: ['adblock'], metered: [] },
    });
  });

  it('serves the defaults when the store fails', async () => {
    const fake = installFakeChrome();

    fake.storage.local.failReads = true;

    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});

describe('the list store', () => {
  const LIST_ID = 'a'.repeat(64);

  it('stores the list with its identifier and fetch time', async () => {
    const fake = installFakeChrome();

    await writeStoredList(1_000, BUNDLED_LIST, LIST_ID);

    expect(fake.storage.local.values.list).toEqual({
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: 1_000,
      listId: LIST_ID,
      list: BUNDLED_LIST,
    });
  });

  it('reads the stored list back', async () => {
    installFakeChrome();

    await writeStoredList(1_000, BUNDLED_LIST, LIST_ID);

    await expect(readStoredList()).resolves.toEqual({
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: 1_000,
      listId: LIST_ID,
      list: BUNDLED_LIST,
    });
  });

  it('discards an envelope of another storage version', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.list = {
      storageVersion: LIST_STORAGE_VERSION + 1,
      fetchedAt: 1_000,
      listId: LIST_ID,
      list: BUNDLED_LIST,
    };

    await expect(readList()).resolves.toEqual(BUNDLED_LIST);
  });

  it('discards an envelope without an identifier', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.list = {
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: 1_000,
      list: BUNDLED_LIST,
    };

    await expect(readList()).resolves.toEqual(BUNDLED_LIST);
  });

  it('discards a list the schema rejects', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.list = {
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: 1_000,
      listId: LIST_ID,
      list: { ...BUNDLED_LIST, sites: [{ ...BUNDLED_LIST.sites[0]!, walls: [] }] },
    };

    await expect(readList()).resolves.toEqual(BUNDLED_LIST);
  });

  it('accepts a stored list other than the bundle', async () => {
    const fake = installFakeChrome();
    const other = { ...BUNDLED_LIST, disabled: true };

    fake.storage.local.values.list = {
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: 1_000,
      listId: LIST_ID,
      list: other,
    };

    await expect(readStoredList()).resolves.not.toBeNull();
    await expect(readList()).resolves.toEqual(other);
    await expect(readListId()).resolves.toBe(LIST_ID);
  });

  it('falls back to the bundled list and its identifier', async () => {
    installFakeChrome();

    await expect(readList()).resolves.toEqual(BUNDLED_LIST);
    await expect(readListId()).resolves.toBe(BUNDLED_LIST_ID);
  });
});

describe('the allowance stores', () => {
  it('writes an always allowance to the local store', async () => {
    const fake = installFakeChrome();

    await writeAllowance('always', [{ host: 'forbes.com', addedAt: 1_000 }]);

    expect(fake.storage.local.values.allowAlways).toEqual([{ host: 'forbes.com', addedAt: 1_000 }]);
    expect(fake.storage.session.values.allowAlways).toBeUndefined();
  });

  it('writes a session allowance and a tab allowance to the session store', async () => {
    const fake = installFakeChrome();

    await writeAllowance('session', [{ host: 'cnn.com', addedAt: 2_000 }]);
    await writeAllowance('tab', [{ host: 'forbes.com', tabId: 7, addedAt: 3_000 }]);

    expect(fake.storage.session.values.allowSession).toEqual([{ host: 'cnn.com', addedAt: 2_000 }]);
    expect(fake.storage.session.values.allowTabs).toEqual([
      { host: 'forbes.com', tabId: 7, addedAt: 3_000 },
    ]);
    expect(fake.storage.local.values.allowSession).toBeUndefined();
    expect(fake.storage.local.values.allowTabs).toBeUndefined();
  });

  it('reads every allowance store as one state', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.allowAlways = [{ host: 'forbes.com', addedAt: 1_000 }];
    fake.storage.session.values.allowSession = [{ host: 'cnn.com', addedAt: 2_000 }];
    fake.storage.session.values.allowTabs = [{ host: 'example.com', tabId: 7, addedAt: 3_000 }];

    await expect(readAllowances()).resolves.toEqual({
      allowAlways: [{ host: 'forbes.com', addedAt: 1_000 }],
      allowSession: [{ host: 'cnn.com', addedAt: 2_000 }],
      allowTabs: [{ host: 'example.com', tabId: 7, addedAt: 3_000 }],
    });
    await expect(readAllowance('always')).resolves.toEqual([
      { host: 'forbes.com', addedAt: 1_000 },
    ]);
  });

  it('serves a miss when a store fails', async () => {
    const fake = installFakeChrome();

    fake.storage.local.failReads = true;
    fake.storage.session.failReads = true;

    await expect(readAllowances()).resolves.toEqual({
      allowAlways: [],
      allowSession: [],
      allowTabs: [],
    });
    await expect(readStoredList()).resolves.toBeNull();
  });
});
