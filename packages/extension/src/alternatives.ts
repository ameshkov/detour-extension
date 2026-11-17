import { ALT_TIMEOUT_MS } from './constants';
import type { FetchLike } from './net';
import { isWebUrl } from './page-url';

export type Alternative = {
  url: string;
  title: string;
  description: string;
  domain: string;
  image?: string;
  favicon?: string;
};

export type AlternativesAnswer = {
  query: string;
  degraded: boolean;
  provider: string;
  alternatives: Alternative[];
};

type RequestInput = {
  apiBase: string;
  url: string;
  title: string;
  fetchImpl: FetchLike;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * One row, or null when the row is malformed. A bad row costs its own place in
 * the list and nothing else, so one odd result cannot empty the answer.
 */
function toAlternative(value: unknown): Alternative | null {
  if (!isRecord(value)) {
    return null;
  }

  const { url, title, description, domain, image, favicon } = value;

  if (
    typeof url !== 'string' ||
    !isWebUrl(url) ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    typeof domain !== 'string'
  ) {
    return null;
  }

  const row: Alternative = { url, title, description, domain };
  const pictured: Alternative =
    typeof image === 'string' && isWebUrl(image) ? { ...row, image } : row;

  return typeof favicon === 'string' && isWebUrl(favicon) ? { ...pictured, favicon } : pictured;
}

/**
 * The backend's answer, or null when the value is not one. The answer level is
 * all or nothing; a row is dropped on its own.
 */
export function parseAlternativesAnswer(value: unknown): AlternativesAnswer | null {
  if (!isRecord(value)) {
    return null;
  }

  const { query, degraded, provider, alternatives } = value;

  if (
    typeof query !== 'string' ||
    typeof degraded !== 'boolean' ||
    typeof provider !== 'string' ||
    !Array.isArray(alternatives)
  ) {
    return null;
  }

  const rows: Alternative[] = [];

  for (const item of alternatives as unknown[]) {
    const row = toAlternative(item);

    if (row !== null) {
      rows.push(row);
    }
  }

  return { query, degraded, provider, alternatives: rows };
}

/**
 * One request for one article. The URL and the title travel with the language,
 * and an absent title travels as an empty string. A non-200 answer, a failed
 * request, and an unparseable body all answer null, so the page shows its
 * failure text and caches nothing.
 */
export async function requestAlternatives(input: RequestInput): Promise<AlternativesAnswer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ALT_TIMEOUT_MS);

  try {
    const response = await input.fetchImpl(`${input.apiBase}/v1/alternatives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: input.url,
        title: input.title,
        lang: 'en',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch {
      return null;
    }

    return parseAlternativesAnswer(body);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
