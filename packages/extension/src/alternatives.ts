import { ALT_TIMEOUT_MS } from './constants';
import type { FetchLike } from './net';
import { isWebUrl } from './page-url';

/**
 * How closely one alternative matches the story, as the backend classifies it.
 * `same_story` is the same article, `same_event` the same news event,
 * `same_topic` the subject without the event, `different` another story, and
 * `unknown` a page that the classifier could not place.
 */
export const MATCH_KINDS = [
  'same_story',
  'same_event',
  'same_topic',
  'different',
  'unknown',
] as const;

export type MatchKind = (typeof MATCH_KINDS)[number];

export function isMatchKind(value: unknown): value is MatchKind {
  return typeof value === 'string' && (MATCH_KINDS as readonly string[]).includes(value);
}

export type Alternative = {
  url: string;
  title: string;
  description: string;
  domain: string;
  image?: string;
  favicon?: string;
  /** The match category, or null when the analysis did not run for this row. */
  match: MatchKind | null;
};

export type AlternativesAnswer = {
  query: string;
  degraded: boolean;
  provider: string;
  /** The story of the article, or null when the analysis gave none. */
  topic: string | null;
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

  const { url, title, description, domain, image, favicon, match } = value;

  if (
    typeof url !== 'string' ||
    !isWebUrl(url) ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    typeof domain !== 'string'
  ) {
    return null;
  }

  const row: Alternative = {
    url,
    title,
    description,
    domain,
    match: isMatchKind(match) ? match : null,
  };
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

  const { query, degraded, provider, topic, alternatives } = value;

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

  return { query, degraded, provider, topic: normalizeTopic(topic), alternatives: rows };
}

/**
 * One request for one article. The URL and the title travel with the language,
 * and an absent title travels as an empty string. A non-200 answer, a failed
 * request, and an unparseable body all answer null, so the page shows its
 * failure text and caches nothing.
 */
/** The story as one phrase: whitespace collapses, and a blank value names none. */
function normalizeTopic(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const phrase = value.replace(/\s+/g, ' ').trim();

  return phrase === '' ? null : phrase;
}

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
