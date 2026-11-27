import { handleAllow, handleRevoke } from './allowance-handlers';
import { MESSAGE } from './constants';
import { handleBlocked, handleClearCache, handleIsBlocked, handleSetSettings } from './handlers';
import type { MessageResponse } from './messages';
import { parseMessage } from './messages';
import type { FetchLike } from './net';
import { handlePass } from './pass-handler';
import { refreshList } from './refresh';
import { handleRememberScope } from './scope-handlers';
import { handleOpenRoute, handlePageState, handlePopupState } from './state-handlers';
import type { TabSender } from './sender';

export type ServiceWorkerDeps = {
  apiBase: string;
  now: () => number;
  fetchImpl: FetchLike;
};

/**
 * The service worker's public surface. The work lives in the module that owns
 * it, and every caller keeps importing it from here.
 */
export { pruneTabAllowances } from './allowance-handlers';
export { pruneCapability } from './capabilities';
export { prunePass } from './passes';
export { refreshList };
export { refreshToolbar } from './toolbar';
export type { RefreshResult } from './refresh';

const KNOWN_TYPES: ReadonlySet<string> = new Set(Object.values(MESSAGE));

function messageType(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const type = (value as Record<string, unknown>).type;

  return typeof type === 'string' ? type : null;
}

/**
 * The one entry of the message contract: a known type whose fields the handler
 * needs answers from its handler, and every other message answers an error
 * instead of throwing across the boundary.
 */
export async function handleMessage(
  message: unknown,
  sender: TabSender,
  deps: ServiceWorkerDeps,
): Promise<MessageResponse> {
  const type = messageType(message);

  if (type === null) {
    return { ok: false, error: 'bad_message' };
  }

  if (!KNOWN_TYPES.has(type)) {
    return { ok: false, error: 'unknown_message' };
  }

  const parsed = parseMessage(message);

  if (parsed === null) {
    return { ok: false, error: 'bad_message' };
  }

  try {
    switch (parsed.type) {
      case MESSAGE.isBlocked:
        return await handleIsBlocked(parsed, sender);
      case MESSAGE.blocked:
        return await handleBlocked(parsed, sender, deps);
      case MESSAGE.popupState:
        return await handlePopupState(sender, deps);
      case MESSAGE.pageState:
        return await handlePageState(parsed, sender, deps);
      case MESSAGE.openRoute:
        return await handleOpenRoute(parsed, sender);
      case MESSAGE.allow:
        return await handleAllow(parsed, sender, deps);
      case MESSAGE.pass:
        return await handlePass(parsed, sender);
      case MESSAGE.rememberScope:
        return await handleRememberScope(parsed, sender);
      case MESSAGE.revoke:
        return await handleRevoke(parsed);
      case MESSAGE.setSettings:
        return await handleSetSettings(parsed);
      case MESSAGE.clearCache:
        return await handleClearCache(deps);
      default:
        return { ok: false, error: 'unknown_message' };
    }
  } catch {
    return { ok: false, error: 'bad_message' };
  }
}
