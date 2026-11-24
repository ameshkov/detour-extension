import { SitesJsonSchema, sha256Hex } from '@detour/shared';

import { LIST_FETCH_TIMEOUT_MS } from './constants';
import type { ServiceWorkerDeps } from './service-worker';
import { BUNDLED_LIST, readStoredList, writeStoredList } from './storage';
import { BUNDLED_LIST_ID } from './sites-id';

export type RefreshResult = {
  listId: string;
  source: 'network' | 'stored' | 'bundled';
  disabled: boolean;
};

/**
 * One fetch of the list, under the read deadline. A non-OK answer, an
 * unparseable body, and a schema failure all keep the list that is already in
 * use, and a worker with no stored list answers the bundled copy. The
 * identifier of an accepted body is the SHA-256 of the body itself, which is
 * the value that a backend publishes as the ETag.
 */
export async function refreshList(deps: ServiceWorkerDeps): Promise<RefreshResult> {
  try {
    const response = await deps.fetchImpl(`${deps.apiBase}/v1/list`, {
      signal: AbortSignal.timeout(LIST_FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      const text = await response.text();
      const parsed = SitesJsonSchema.safeParse(JSON.parse(text));

      if (parsed.success) {
        const listId = await sha256Hex(text);

        await writeStoredList(deps.now(), parsed.data, listId);

        return { listId, source: 'network', disabled: parsed.data.disabled };
      }
    }
  } catch {
    // The fallback below answers the list that is already in use.
  }

  const stored = await readStoredList();

  if (stored !== null) {
    return { listId: stored.listId, source: 'stored', disabled: stored.list.disabled };
  }

  return {
    listId: BUNDLED_LIST_ID,
    source: 'bundled',
    disabled: BUNDLED_LIST.disabled,
  };
}
