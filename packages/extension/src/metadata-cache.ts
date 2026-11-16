import { sha256Hex } from '@detour/shared';

import { META_MAX_ENTRIES, META_TTL_MS, STORAGE } from './constants';
import type { PageMeta } from './metadata';
import { isPageMeta } from './metadata';

/**
 * One cached read of a page, with the time it was stored, so the cache can age
 * an entry out and evict the oldest first.
 */
type MetaEntry = {
  meta: PageMeta;
  storedAt: number;
};

function toEntry(value: unknown): MetaEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const meta = record.meta;

  if (typeof record.storedAt !== 'number' || !isPageMeta(meta)) {
    return null;
  }

  // An earlier release stored an image and a canonical link beside the two
  // fields. They are dropped on read, so no migration rewrites the store.
  return { meta: { title: meta.title, description: meta.description }, storedAt: record.storedAt };
}

function isExpired(entry: MetaEntry, now: number): boolean {
  return now - entry.storedAt >= META_TTL_MS;
}

async function cacheKey(url: string): Promise<string> {
  return `${STORAGE.meta}${await sha256Hex(url)}`;
}

/**
 * Every `meta:` entry the store holds, plus the keys whose value no longer
 * parses. A read failure answers an empty map, so a writer still stores the new
 * entry instead of failing on the cleanup.
 */
async function readEntries(): Promise<{ entries: Map<string, MetaEntry>; malformed: string[] }> {
  const entries = new Map<string, MetaEntry>();
  const malformed: string[] = [];
  let values: Record<string, unknown>;

  try {
    values = await chrome.storage.local.get(null);
  } catch {
    return { entries, malformed };
  }

  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(STORAGE.meta)) {
      continue;
    }

    const entry = toEntry(value);

    if (entry !== null) {
      entries.set(key, entry);
    } else {
      malformed.push(key);
    }
  }

  return { entries, malformed };
}

/**
 * The cached read of one page, or null when the page was never read, the entry
 * passed seven days, or the store fails.
 */
export async function readMetaCache(url: string, now = Date.now()): Promise<PageMeta | null> {
  const key = await cacheKey(url);
  let stored: unknown;

  try {
    const values = await chrome.storage.local.get(key);

    stored = values[key];
  } catch {
    return null;
  }

  const entry = toEntry(stored);

  return entry === null || isExpired(entry, now) ? null : entry.meta;
}

/**
 * Stores one cached read. The writer drops the expired entries first, then the
 * oldest entries beyond the cap, so a busy day cannot push the live ones out.
 */
export async function writeMetaCache(url: string, meta: PageMeta, now = Date.now()): Promise<void> {
  const key = await cacheKey(url);
  const { entries, malformed } = await readEntries();
  const live: Array<{ key: string; storedAt: number }> = [];
  const stale: string[] = [...malformed];

  for (const [entryKey, entry] of entries) {
    if (entryKey === key || isExpired(entry, now)) {
      stale.push(entryKey);
    } else {
      live.push({ key: entryKey, storedAt: entry.storedAt });
    }
  }

  live.sort((one, other) => one.storedAt - other.storedAt || one.key.localeCompare(other.key));

  while (live.length >= META_MAX_ENTRIES) {
    const oldest = live.shift();

    if (oldest === undefined) {
      break;
    }

    stale.push(oldest.key);
  }

  if (stale.length > 0) {
    await chrome.storage.local.remove(stale);
  }

  await chrome.storage.local.set({ [key]: { meta, storedAt: now } });
}
