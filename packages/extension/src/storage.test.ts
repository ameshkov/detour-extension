import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, LIST_STORAGE_VERSION } from './constants';
import { BUNDLED_LIST_ID } from './sites-id';
import {
  BUNDLED_LIST,
  isPaused,
  readAllowance,
  readAllowances,
  readList,
  readListId,
  readPause,
  readSettings,
  readStoredList,
  writeAllowance,
  writePause,
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

  it('merges a stored setting over the defaults', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.settings = { enabled: false };

    await expect(readSettings()).resolves.toEqual({
      enabled: false,
      autoOpenBest: false,
      imagesEnabled: true,
      walls: { hard: ['adblock'], soft: ['adblock'], metered: [] },
    });
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

describe('the pause store', () => {
  it('reports a pause in the future', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.pauseUntil = 2_000;

    expect(isPaused(await readPause(), 1_000)).toBe(true);
  });

  it('clears a pause at its own time and after it', async () => {
    installFakeChrome();

    await writePause({ until: 2_000, session: false });
    const pause = await readPause();

    expect(isPaused(pause, 2_000)).toBe(false);
    expect(isPaused(pause, 2_001)).toBe(false);
  });

  it('keeps a session pause until the browser drops the store', async () => {
    const fake = installFakeChrome();

    await writePause({ until: 0, session: true });

    expect(fake.storage.session.values.pauseSession).toBe(true);
    expect(fake.storage.local.values.pauseUntil).toBe(0);
    expect(isPaused(await readPause(), 2_000_000)).toBe(true);
  });

  it('drops the session flag when a timed pause replaces it', async () => {
    const fake = installFakeChrome();

    fake.storage.session.values.pauseSession = true;

    await writePause({ until: 3_000, session: false });

    expect(fake.storage.session.values.pauseSession).toBe(false);
    expect(fake.storage.local.values.pauseUntil).toBe(3_000);
    expect(isPaused(await readPause(), 1_000)).toBe(true);
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
    await expect(readPause()).resolves.toEqual({ until: 0, session: false });
  });
});
