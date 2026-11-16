import { sha256Hex } from '@detour/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { META_MAX_ENTRIES, META_TTL_MS, STORAGE } from './constants';
import type { PageMeta } from './metadata';
import { readMetaCache, writeMetaCache } from './metadata-cache';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';

const NOW = 1_700_000_000_000;
const URL = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';

const META: PageMeta = {
  title: 'Best AI Image Generators of 2026',
  description: 'Everything you need to pick the right AI for your project and budget.',
};

function article(index: number): string {
  return `https://www.cnet.com/news/article-${String(index)}/`;
}

function keyOf(url: string): Promise<string> {
  return sha256Hex(url).then((digest) => `${STORAGE.meta}${digest}`);
}

afterEach(() => {
  resetFakeChrome();
});

describe('the metadata cache', () => {
  it('keys the cache by the page digest', async () => {
    const fake = installFakeChrome();

    await writeMetaCache(URL, META, NOW);

    expect(fake.storage.local.values[await keyOf(URL)]).toEqual({ meta: META, storedAt: NOW });
  });

  it('reads a fresh entry', async () => {
    installFakeChrome();

    await writeMetaCache(URL, META, NOW);

    await expect(readMetaCache(URL, NOW)).resolves.toEqual(META);
    await expect(readMetaCache(URL, NOW + META_TTL_MS - 1)).resolves.toEqual(META);
  });

  it('loads a legacy entry that carries the removed fields', async () => {
    const fake = installFakeChrome();
    const legacy = {
      meta: {
        title: 'A legacy title',
        description: 'A legacy description',
        image: 'https://cdn.example.com/old.jpg',
        canonical: 'https://example.com/old',
      },
      storedAt: NOW,
    };

    fake.storage.local.values[await keyOf(URL)] = legacy;

    await expect(readMetaCache(URL, NOW)).resolves.toEqual({
      title: 'A legacy title',
      description: 'A legacy description',
    });
  });

  it('drops an entry at seven days', async () => {
    installFakeChrome();

    await writeMetaCache(URL, META, NOW);

    await expect(readMetaCache(URL, NOW + META_TTL_MS)).resolves.toBeNull();
  });

  it('keeps at most five hundred entries', async () => {
    const fake = installFakeChrome();

    for (let index = 0; index < META_MAX_ENTRIES + 1; index += 1) {
      await writeMetaCache(article(index), META, NOW + index);
    }

    const keys = Object.keys(fake.storage.local.values).filter((key) =>
      key.startsWith(STORAGE.meta),
    );

    expect(keys).toHaveLength(META_MAX_ENTRIES);
    expect(keys).not.toContain(await keyOf(article(0)));
    expect(keys).toContain(await keyOf(article(META_MAX_ENTRIES)));
  });

  it('evicts an expired entry before counting', async () => {
    const fake = installFakeChrome();
    const liveKeys: string[] = [];

    fake.storage.local.values[await keyOf(article(0))] = {
      meta: META,
      storedAt: NOW - META_TTL_MS,
    };

    for (let index = 1; index < META_MAX_ENTRIES; index += 1) {
      const key = await keyOf(article(index));

      liveKeys.push(key);
      fake.storage.local.values[key] = { meta: META, storedAt: NOW + index };
    }

    await writeMetaCache(article(META_MAX_ENTRIES), META, NOW + META_MAX_ENTRIES);

    const keys = Object.keys(fake.storage.local.values).filter((key) =>
      key.startsWith(STORAGE.meta),
    );

    expect(keys).toHaveLength(META_MAX_ENTRIES);
    expect(keys).not.toContain(await keyOf(article(0)));
    expect(keys).toContain(await keyOf(article(META_MAX_ENTRIES)));

    for (const key of liveKeys) {
      expect(keys).toContain(key);
    }
  });

  it('drops an unreadable entry on the next write', async () => {
    const fake = installFakeChrome();
    const broken = await keyOf(article(0));

    fake.storage.local.values[broken] = { meta: { title: 1 }, storedAt: NOW };

    await writeMetaCache(URL, META, NOW);

    expect(fake.storage.local.values[broken]).toBeUndefined();
    expect(Object.keys(fake.storage.local.values)).toEqual([await keyOf(URL)]);
  });

  it('answers a miss when the store fails', async () => {
    const fake = installFakeChrome();

    await writeMetaCache(URL, META, NOW);
    fake.storage.local.failReads = true;

    await expect(readMetaCache(URL, NOW)).resolves.toBeNull();
  });
});
