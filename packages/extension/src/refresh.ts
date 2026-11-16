import { SitesJsonSchema } from '@detour/shared';

import { LIST_FETCH_TIMEOUT_MS } from './constants';
import type { ServiceWorkerDeps } from './service-worker';
import { BUNDLED_LIST, readStoredList, writeStoredList } from './storage';

export type RefreshResult = {
  version: number;
  source: 'network' | 'stored' | 'bundled';
  disabled: boolean;
};

/**
 * One fetch of the list, under the read deadline. A non-OK answer, an
 * unparseable body, and a schema failure all keep the list that is already in
 * use, and a worker with no stored list answers the bundled copy.
 */
export async function refreshList(deps: ServiceWorkerDeps): Promise<RefreshResult> {
  try {
    const response = await deps.fetchImpl(`${deps.apiBase}/v1/list`, {
      signal: AbortSignal.timeout(LIST_FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      const body: unknown = await response.json();
      const parsed = SitesJsonSchema.safeParse(body);

      if (parsed.success) {
        await writeStoredList(deps.now(), parsed.data);

        return {
          version: parsed.data.version,
          source: 'network',
          disabled: parsed.data.disabled,
        };
      }
    }
  } catch {
    // The fallback below answers the list that is already in use.
  }

  const stored = await readStoredList();

  if (stored !== null) {
    return { version: stored.list.version, source: 'stored', disabled: stored.list.disabled };
  }

  return { version: BUNDLED_LIST.version, source: 'bundled', disabled: BUNDLED_LIST.disabled };
}
