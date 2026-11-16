import { sha256Hex } from '@detour/shared';

import type { AlternativesAnswer } from './alternatives';
import { parseAlternativesAnswer } from './alternatives';
import { ALT_MAX_ENTRIES, ALT_TTL_MS, STORAGE } from './constants';

/**
 * One cached answer with the time it was stored, so the cache can age an entry
 * out and evict the oldest first.
 */
type AltEntry = {
  answer: AlternativesAnswer;
  storedAt: number;
};

function toEntry(value: unknown): AltEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const answer = parseAlternativesAnswer(record.answer);

  return typeof record.storedAt === 'number' && answer !== null
    ? { answer, storedAt: record.storedAt }
    : null;
}

function isExpired(entry: AltEntry, now: number): boolean {
  return now - entry.storedAt >= ALT_TTL_MS;
}

async function cacheKey(url: string): Promise<string> {
  return `${STORAGE.alt}${await sha256Hex(url)}`;
}

/**
 * Every `alt:` entry the store holds, plus the keys whose value no longer
 * parses. A read failure answers an empty map, so a writer still stores the new
 * entry instead of failing on the cleanup.
 */
async function readEntries(): Promise<{ entries: Map<string, AltEntry>; malformed: string[] }> {
  const entries = new Map<string, AltEntry>();
  const malformed: string[] = [];
  let values: Record<string, unknown>;

  try {
    values = await chrome.storage.local.get(null);
  } catch {
    return { entries, malformed };
  }

  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(STORAGE.alt)) {
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
 * The cached answer of one page, or null when the page was never asked, the
 * entry passed a day, or the store fails.
 */
export async function readAltCache(
  url: string,
  now = Date.now(),
): Promise<AlternativesAnswer | null> {
  const key = await cacheKey(url);
  let stored: unknown;

  try {
    const values = await chrome.storage.local.get(key);

    stored = values[key];
  } catch {
    return null;
  }

  const entry = toEntry(stored);

  return entry === null || isExpired(entry, now) ? null : entry.answer;
}

/**
 * Stores one answer. An answer is several times the size of a metadata record,
 * so the writer drops the expired entries before it counts the new one and then
 * the oldest entries beyond the cap.
 */
export async function writeAltCache(
  url: string,
  answer: AlternativesAnswer,
  now = Date.now(),
): Promise<void> {
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

  while (live.length >= ALT_MAX_ENTRIES) {
    const oldest = live.shift();

    if (oldest === undefined) {
      break;
    }

    stale.push(oldest.key);
  }

  if (stale.length > 0) {
    await chrome.storage.local.remove(stale);
  }

  await chrome.storage.local.set({ [key]: { answer, storedAt: now } });
}
