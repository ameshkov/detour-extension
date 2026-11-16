import { sha256Hex } from '@detour/shared';

import { STORAGE } from './constants';

/**
 * One key per tab that the guard stopped and sent to the block page:
 * `capability:<tabId>` holds the digest of the URL it was stopped on. One key
 * per tab means two tabs stopped in the same tick cannot overwrite each other,
 * which a shared map allows because `chrome.storage` has no compare-and-set.
 * The record lives in the session store, so it survives a stopped service worker
 * and is gone after a browser restart. A page that merely opens `block.html` has
 * no record.
 */
function capabilityKey(tabId: number): string {
  return `${STORAGE.capability}${tabId}`;
}

async function readCapability(tabId: number): Promise<string | null> {
  try {
    const values = await chrome.storage.session.get(capabilityKey(tabId));
    const digest = values[capabilityKey(tabId)];

    return typeof digest === 'string' ? digest : null;
  } catch {
    return null;
  }
}

/** Records the stopped tab before its navigation, replacing any earlier record. */
export async function recordCapability(tabId: number, url: string): Promise<void> {
  await chrome.storage.session.set({ [capabilityKey(tabId)]: await sha256Hex(url) });
}

/** Whether the sender's own tab was stopped on this exact URL. */
export async function hasCapability(tabId: number | undefined, url: string): Promise<boolean> {
  if (tabId === undefined) {
    return false;
  }

  const digest = await readCapability(tabId);

  return digest !== null && digest === (await sha256Hex(url));
}

/** A closed tab loses its record; every other tab keeps its own. */
export async function pruneCapability(tabId: number): Promise<void> {
  await chrome.storage.session.remove(capabilityKey(tabId));
}
