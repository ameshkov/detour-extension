import { METADATA_MAX_BYTES, METADATA_TIMEOUT_MS } from './constants';
import { readPageMeta } from './metadata-read';
import type { FetchLike } from './net';
import { readCappedBody } from './net';

export { readPageMeta } from './metadata-read';

export type PageMeta = {
  title: string | null;
  description: string | null;
};

/**
 * The one guard of the shape: a stored entry and a message answer use it. An
 * entry stored by an earlier release may carry extra fields, and they are
 * accepted and ignored rather than invalidating the entry.
 */
export function isPageMeta(value: unknown): value is PageMeta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    (record.title === null || typeof record.title === 'string') &&
    (record.description === null || typeof record.description === 'string')
  );
}

/**
 * Fetches one page for its head, without cookies, under the read deadline. Every
 * failure answers null so the block page keeps the URL alone.
 */
export async function fetchPageMeta(url: string, fetchImpl: FetchLike): Promise<PageMeta | null> {
  let response: Response;

  try {
    response = await fetchImpl(url, {
      credentials: 'omit',
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const body = await readCappedBody(response, METADATA_MAX_BYTES);

  if (body === null) {
    return null;
  }

  return readPageMeta(new TextDecoder().decode(body));
}
