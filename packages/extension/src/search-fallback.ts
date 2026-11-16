import { buildQuery } from '@detour/shared';

import type { AlternativesAnswer } from './alternatives';
import { FALLBACK_HEADING, FALLBACK_NOTE, QUERY_LABEL, SEARCH_ENGINE_NAMES } from './copy';
import { roleElement, setHidden, setText } from './dom';
import type { PageMeta } from './metadata';

/**
 * The four engines that the block page offers as its search fallback, in the
 * order it offers them.
 */
export type SearchEngineKey = 'duckduckgo' | 'brave' | 'google' | 'bing';

export const SEARCH_ENGINES: readonly SearchEngineKey[] = ['duckduckgo', 'brave', 'google', 'bing'];

const ENGINE_URLS: Record<SearchEngineKey, string> = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
};

export function engineUrl(key: SearchEngineKey, query: string): string {
  return `${ENGINE_URLS[key]}${encodeURIComponent(query)}`;
}

export type FallbackQueryInput = {
  answer: AlternativesAnswer | null;
  meta: PageMeta | null;
  url: string;
  siteName: string | null;
  edited: string;
};

/**
 * The text that the fallback hands to an engine: what the reader typed, else
 * what the backend searched with, else what the shared cleaner makes of the page.
 */
export function fallbackQuery(input: FallbackQueryInput): string {
  const edited = input.edited.trim();

  if (edited !== '') {
    return edited;
  }

  const answered = input.answer?.query.trim() ?? '';

  if (answered !== '') {
    return answered;
  }

  return buildQuery({
    title: input.meta?.title ?? '',
    url: input.url,
    siteName: input.siteName ?? '',
  });
}

function queryField(): HTMLInputElement | null {
  const element = roleElement('query');

  return element instanceof HTMLInputElement ? element : null;
}

function engineLink(key: SearchEngineKey, query: string): HTMLAnchorElement {
  const link = document.createElement('a');

  link.setAttribute('href', engineUrl(key, query));
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noreferrer noopener');
  link.textContent = SEARCH_ENGINE_NAMES[key];

  return link;
}

/** Every engine link, rebuilt from the current query in the field. */
function fillEngines(query: string): void {
  const engines = roleElement('engines');

  if (engines !== null) {
    engines.replaceChildren(...SEARCH_ENGINES.map((key) => engineLink(key, query)));
  }
}

/**
 * The fallback box of the empty and error states. A render never overwrites what
 * the reader typed, and every render rebuilds the links from the field, so the
 * four hrefs always carry the text that the next click would search for.
 */
export function renderSearchFallback(query: string): void {
  setText('fallback-heading', FALLBACK_HEADING);
  setText('query-label', QUERY_LABEL);
  setText('fallback-note', FALLBACK_NOTE);

  const field = queryField();

  if (field !== null && field.dataset.edited !== 'true') {
    field.value = query;
  }

  fillEngines(field?.value ?? query);
  setHidden('fallback', false);

  if (field === null) {
    return;
  }

  field.oninput = (): void => {
    field.dataset.edited = 'true';
    fillEngines(field.value);
  };
}

/**
 * The reader's own query, and nothing else: an unanswered field reports an empty
 * value, so a retry never mistakes the page's query for an edit.
 */
export function readFallbackQuery(): string {
  const field = queryField();

  return field !== null && field.dataset.edited === 'true' ? field.value.trim() : '';
}
