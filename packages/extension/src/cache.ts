import { STORAGE } from './constants';

/** The keys that a fresh list, a fresh search, and a fresh read replace. */
function isCacheKey(key: string): boolean {
  return key === STORAGE.list || key.startsWith(STORAGE.alt) || key.startsWith(STORAGE.meta);
}

/**
 * Removes the list, the cached answers, and the cached page reads, and answers
 * how many keys it dropped. The settings, the allowances, and the records of the
 * stopped tabs stay: they hold what the reader chose, not what a search found.
 */
export async function clearCache(): Promise<number> {
  const values = await chrome.storage.local.get(null);
  const keys = Object.keys(values).filter(isCacheKey);

  if (keys.length > 0) {
    await chrome.storage.local.remove(keys);
  }

  return keys.length;
}
