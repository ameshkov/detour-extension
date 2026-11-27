import { buildQuery, registrableDomain } from '@detour/shared';

import type { AlternativesAnswer } from './alternatives';
import {
  FALLBACK_HEADING,
  QUERY_LABEL,
  SEARCH_ENGINE_NAMES,
  fallbackHintParts,
  sitesSimilarLabel,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import { renderHint } from './hint';
import type { PageMeta } from './metadata';

/**
 * The four engines that the block page offers as its search fallback, in the
 * order it offers them.
 */
export type SearchEngineKey = 'duckduckgo' | 'brave' | 'google' | 'bing';

/** The engine that Enter searches with when the reader chose none. */
export const FIRST_ENGINE: SearchEngineKey = 'duckduckgo';

export const SEARCH_ENGINES: readonly SearchEngineKey[] = [FIRST_ENGINE, 'brave', 'google', 'bing'];

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
 * The domain that a similar-sites query names: the registrable one, and the
 * host when the host has none, as an IP address and a local name do.
 */
function queryDomain(url: string): string {
  const domain = registrableDomain(url);

  if (domain !== '') {
    return domain;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * The text that the fallback hands to an engine: what the reader typed, else
 * the sites of the same publication when the page carries no title, else what
 * the backend searched with, else what the shared cleaner makes of the page.
 */
export function fallbackQuery(input: FallbackQueryInput): string {
  const edited = input.edited.trim();

  if (edited !== '') {
    return edited;
  }

  // A page without a title names no story to search for, so the box asks for
  // the sites of the same publisher instead.
  if (input.meta !== null && (input.meta.title ?? '').trim() === '') {
    const domain = queryDomain(input.url);

    if (domain !== '') {
      return sitesSimilarLabel(domain);
    }
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

/** The engine links of the box, in the order that each render puts them. */
function engineLinks(): HTMLAnchorElement[] {
  const engines = roleElement('engines');

  return engines === null ? [] : [...engines.querySelectorAll<HTMLAnchorElement>('a')];
}

/** The index of the engine that the reader chose, and the first one otherwise. */
function chosenEngineIndex(): number {
  const index = engineLinks().findIndex((link) => link.dataset.selected === 'true');

  return index === -1 ? 0 : index;
}

/**
 * Marks one engine as the choice and gives it the focus, so the ring and the
 * focus are one state: the engine that Enter opens.
 */
export function selectEngine(index: number): void {
  const links = engineLinks();

  for (const link of links) {
    delete link.dataset.selected;
  }

  links[index]?.setAttribute('data-selected', 'true');
  links[index]?.focus();
}

function engineLink(key: SearchEngineKey, query: string, index: number): HTMLAnchorElement {
  const link = document.createElement('a');
  const cap = document.createElement('kbd');
  const name = document.createElement('span');

  link.setAttribute('href', engineUrl(key, query));
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noreferrer noopener');

  // The cap is the digit that picks the engine, not part of its name.
  cap.setAttribute('data-role', 'engine-key');
  cap.setAttribute('aria-hidden', 'true');
  cap.textContent = String(index + 1);

  name.setAttribute('data-role', 'engine-name');
  name.textContent = SEARCH_ENGINE_NAMES[key];

  link.append(cap, name);

  return link;
}

/** Every engine link, rebuilt from the current query in the field. */
function fillEngines(query: string): void {
  const engines = roleElement('engines');

  if (engines !== null) {
    engines.replaceChildren(...SEARCH_ENGINES.map((key, index) => engineLink(key, query, index)));
  }
}

/**
 * The box answers the keys the way the list does, so the reader who arrives
 * here from the search card never has to reach for the mouse. A digit selects
 * its engine and Enter opens the selected one; the arrows walk the engines,
 * Down enters them from the field, and Up from the first returns to the field
 * for the query. The field keeps every key that belongs to typing, so a digit
 * in the query stays a digit, and Enter in the field opens the chosen engine.
 * The engine keys stop at the box, so they never reach the list behind it.
 */
function installFallbackKeys(field: HTMLInputElement): void {
  field.onkeydown = (event: KeyboardEvent): void => {
    // Enter that confirms an IME composition belongs to the composition.
    if (event.isComposing) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      engineLinks()[chosenEngineIndex()]?.click();

      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectEngine(chosenEngineIndex());
    }
  };

  const box = roleElement('fallback');

  if (box === null) {
    return;
  }

  box.onkeydown = (event: KeyboardEvent): void => {
    // The field owns its keys, so this point sees only the box and its links.
    if (event.target === field) {
      return;
    }

    // Inside the box a digit belongs to the engines, so no digit reaches the
    // list, and only 1 to 4 name one.
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      event.stopPropagation();

      if (/^[1-4]$/.test(event.key)) {
        selectEngine(Number(event.key) - 1);
      }

      return;
    }

    const links = engineLinks();
    const index = links.findIndex((link) => link === event.target);

    if (index === -1) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      links[index]?.click();

      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'ArrowUp' && index === 0) {
      field.focus();

      return;
    }

    const step = event.key === 'ArrowDown' ? 1 : -1;

    selectEngine(Math.min(Math.max(index + step, 0), links.length - 1));
  };
}

/**
 * The fallback box of the empty and error states. A render never overwrites what
 * the reader typed, and every render rebuilds the links from the field, so the
 * four hrefs always carry the text that the next click would search for.
 */
export function renderSearchFallback(query: string): void {
  setText('fallback-heading', FALLBACK_HEADING);
  setText('query-label', QUERY_LABEL);
  renderHint(roleElement('fallback-note'), fallbackHintParts());

  const field = queryField();

  if (field !== null && field.dataset.edited !== 'true') {
    field.value = query;
  }

  fillEngines(field?.value ?? query);
  setHidden('fallback', false);
  setHidden('fallback-note', false);

  if (field === null) {
    return;
  }

  installFallbackKeys(field);
  field.oninput = (): void => {
    field.dataset.edited = 'true';
    fillEngines(field.value);
    installFallbackKeys(field);
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
