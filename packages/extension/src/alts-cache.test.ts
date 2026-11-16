import { sha256Hex } from '@detour/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { readAltCache, writeAltCache } from './alts-cache';
import type { AlternativesAnswer } from './alternatives';
import { ALT_MAX_ENTRIES, ALT_TTL_MS, STORAGE } from './constants';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';

const NOW = 1_700_000_000_000;
const URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';

const ANSWER: AlternativesAnswer = {
  query: 'Nvidia Next Move custom silicon',
  degraded: false,
  provider: 'ceramic',
  alternatives: [
    {
      url: 'https://arstechnica.com/gadgets/2026/10/nvidias-custom-chip-push-explained/',
      title: 'Nvidia’s custom chip push, explained',
      description: 'Hyperscalers want their own silicon.',
      domain: 'arstechnica.com',
      image: 'https://detour-api.invalid/v1/img?u=x&sig=y',
    },
  ],
};

function article(index: number): string {
  return `https://www.forbes.com/sites/richardnieva/2026/10/article-${String(index)}/`;
}

function keyOf(url: string): Promise<string> {
  return sha256Hex(url).then((digest) => `${STORAGE.alt}${digest}`);
}

function altKeys(values: Record<string, unknown>): string[] {
  return Object.keys(values).filter((key) => key.startsWith(STORAGE.alt));
}

afterEach(() => {
  resetFakeChrome();
});

describe('the alternatives cache', () => {
  it('keys the answer by the page digest', async () => {
    const fake = installFakeChrome();

    await writeAltCache(URL, ANSWER, NOW);

    expect(fake.storage.local.values[await keyOf(URL)]).toEqual({ answer: ANSWER, storedAt: NOW });
  });

  it('reads a fresh answer', async () => {
    installFakeChrome();

    await writeAltCache(URL, ANSWER, NOW);

    await expect(readAltCache(URL, NOW)).resolves.toEqual(ANSWER);
    await expect(readAltCache(URL, NOW + ALT_TTL_MS - 1)).resolves.toEqual(ANSWER);
  });

  it('drops an answer at one day', async () => {
    installFakeChrome();

    await writeAltCache(URL, ANSWER, NOW);

    await expect(readAltCache(URL, NOW + ALT_TTL_MS)).resolves.toBeNull();
  });

  it('drops an expired answer before counting', async () => {
    const fake = installFakeChrome();
    const liveKeys: string[] = [];

    fake.storage.local.values[await keyOf(article(0))] = {
      answer: ANSWER,
      storedAt: NOW - ALT_TTL_MS,
    };

    for (let index = 1; index < ALT_MAX_ENTRIES; index += 1) {
      const key = await keyOf(article(index));

      liveKeys.push(key);
      fake.storage.local.values[key] = { answer: ANSWER, storedAt: NOW + index };
    }

    await writeAltCache(article(ALT_MAX_ENTRIES), ANSWER, NOW + ALT_MAX_ENTRIES);

    const keys = altKeys(fake.storage.local.values);

    expect(keys).toHaveLength(ALT_MAX_ENTRIES);
    expect(keys).not.toContain(await keyOf(article(0)));
    expect(keys).toContain(await keyOf(article(ALT_MAX_ENTRIES)));

    for (const key of liveKeys) {
      expect(keys).toContain(key);
    }
  });

  it('keeps at most two hundred answers', async () => {
    const fake = installFakeChrome();

    for (let index = 0; index < ALT_MAX_ENTRIES + 1; index += 1) {
      await writeAltCache(article(index), ANSWER, NOW + index);
    }

    const keys = altKeys(fake.storage.local.values);

    expect(keys).toHaveLength(ALT_MAX_ENTRIES);
    expect(keys).not.toContain(await keyOf(article(0)));
    expect(keys).toContain(await keyOf(article(ALT_MAX_ENTRIES)));
  });

  it('drops an unreadable entry on the next write', async () => {
    const fake = installFakeChrome();
    const broken = await keyOf(article(0));

    fake.storage.local.values[broken] = { answer: { alternatives: 'no' }, storedAt: NOW };

    await writeAltCache(URL, ANSWER, NOW);

    expect(fake.storage.local.values[broken]).toBeUndefined();
    expect(altKeys(fake.storage.local.values)).toEqual([await keyOf(URL)]);
  });

  it('answers a miss when the store fails', async () => {
    const fake = installFakeChrome();

    await writeAltCache(URL, ANSWER, NOW);
    fake.storage.local.failReads = true;

    await expect(readAltCache(URL, NOW)).resolves.toBeNull();
  });
});
