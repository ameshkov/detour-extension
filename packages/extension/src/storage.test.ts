import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, LIST_STORAGE_VERSION } from './constants';
import bundledList from './sites.json';
import {
  BUNDLED_LIST,
  isPaused,
  readAllowance,
  readAllowances,
  readList,
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
    });
  });

  it('serves the defaults when the store fails', async () => {
    const fake = installFakeChrome();

    fake.storage.local.failReads = true;

    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});

describe('the list store', () => {
  it('stores the list with its version and fetch time', async () => {
    const fake = installFakeChrome();

    await writeStoredList(1_000, BUNDLED_LIST);

    expect(fake.storage.local.values.list).toEqual({
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: 1_000,
      list: BUNDLED_LIST,
    });
  });

  it('reads the stored list back', async () => {
    installFakeChrome();

    await writeStoredList(1_000, BUNDLED_LIST);

    await expect(readStoredList()).resolves.toEqual({
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: 1_000,
      list: BUNDLED_LIST,
    });
  });

  it('discards an envelope of an unknown version', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values.list = {
      storageVersion: 2,
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
      list: { ...BUNDLED_LIST, version: 0 },
    };

    await expect(readList()).resolves.toEqual(BUNDLED_LIST);
  });

  it('accepts a list newer than the bundle', async () => {
    const fake = installFakeChrome();
    const newer = { ...BUNDLED_LIST, version: BUNDLED_LIST.version + 1 };

    fake.storage.local.values.list = {
      storageVersion: LIST_STORAGE_VERSION,
      fetchedAt: 1_000,
      list: newer,
    };

    await expect(readStoredList()).resolves.not.toBeNull();
    await expect(readList()).resolves.toEqual(newer);
  });

  it('falls back to the bundled list', async () => {
    installFakeChrome();

    await expect(readList()).resolves.toEqual(BUNDLED_LIST);
    expect(BUNDLED_LIST.version).toBe(bundledList.version);
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
