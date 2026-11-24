import { sha256Hex } from '@detour/shared';

import { STORAGE } from './constants';

/**
 * One key per tab that asked to open a page once: `pass:<tabId>` holds the
 * digest of the URL. The guard spends the key on the next navigation to that
 * URL, so the visit opens and the next one meets the wall again. A pass is not
 * an allowance: nothing lists it, nothing survives its navigation, and the
 * record lives in the session store.
 */
function passKey(tabId: number): string {
  return `${STORAGE.pass}${tabId}`;
}

/** Records the page that the tab opens once, replacing any earlier pass. */
export async function recordPass(tabId: number, url: string): Promise<void> {
  await chrome.storage.session.set({ [passKey(tabId)]: await sha256Hex(url) });
}

/**
 * Whether this tab holds a pass for this URL, and spends it. A pass for another
 * URL stays, because the tab may still open that page. A store that fails
 * answers false, so the page meets the wall instead of opening on an error.
 */
export async function consumePass(tabId: number | undefined, url: string): Promise<boolean> {
  if (tabId === undefined) {
    return false;
  }

  const key = passKey(tabId);
  let digest: unknown;

  try {
    const values = await chrome.storage.session.get(key);

    digest = values[key];
  } catch {
    return false;
  }

  if (typeof digest !== 'string' || digest !== (await sha256Hex(url))) {
    return false;
  }

  await chrome.storage.session.remove(key);

  return true;
}

/** A closed tab loses its pass; every other tab keeps its own. */
export async function prunePass(tabId: number): Promise<void> {
  await chrome.storage.session.remove(passKey(tabId));
}
