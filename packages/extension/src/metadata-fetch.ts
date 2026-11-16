import { META_FAILURE_MEMO_MS } from './constants';
import type { PageMeta } from './metadata';
import { fetchPageMeta } from './metadata';
import { readMetaCache, writeMetaCache } from './metadata-cache';
import type { ServiceWorkerDeps } from './service-worker';

/**
 * The pages being fetched right now, so the block page joins the fetch that the
 * navigation already started. A settled promise leaves the map: it is a
 * coalescing aid, not a cache.
 */
const inFlight = new Map<string, Promise<PageMeta | null>>();

/**
 * The pages whose fetch failed, and when, so a second question inside
 * `META_FAILURE_MEMO_MS` asks the publisher nothing. It lives as long as this
 * worker instance and writes no storage entry.
 */
const failures = new Map<string, number>();

async function fetchAndStoreMeta(url: string, deps: ServiceWorkerDeps): Promise<PageMeta | null> {
  const cached = await readMetaCache(url, deps.now());

  if (cached !== null) {
    return cached;
  }

  const failedAt = failures.get(url);

  if (failedAt !== undefined) {
    if (deps.now() - failedAt < META_FAILURE_MEMO_MS) {
      return null;
    }

    // The window has passed, so the entry can go; nothing stops the fresh
    // attempt below, and a kept entry would sit in the map for the worker's life.
    failures.delete(url);
  }

  let meta: PageMeta | null;

  try {
    meta = await fetchPageMeta(url, deps.fetchImpl);
  } catch {
    meta = null;
  }

  if (meta === null) {
    failures.set(url, deps.now());

    return null;
  }

  try {
    await writeMetaCache(url, meta, deps.now());
  } catch {
    // A lost cache entry costs one fetch later, not this answer.
  }

  return meta;
}

/**
 * The metadata of one stopped page, and never a thrown error. Two callers of the
 * same URL share one fetch, and a failed fetch answers null for the next minute
 * without asking the publisher again.
 */
export function metadataFor(url: string, deps: ServiceWorkerDeps): Promise<PageMeta | null> {
  const running = inFlight.get(url);

  if (running !== undefined) {
    return running;
  }

  const promise = fetchAndStoreMeta(url, deps)
    .catch(() => null)
    .finally(() => {
      inFlight.delete(url);
    });

  inFlight.set(url, promise);

  return promise;
}
