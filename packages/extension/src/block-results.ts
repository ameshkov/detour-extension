import type { Alternative, AlternativesAnswer } from './alternatives';
import {
  ALTERNATIVES_FAILED,
  ALTERNATIVES_LOADING,
  ALTERNATIVES_NONE,
  FAILED_DETAIL,
  NONE_DETAIL,
  RETRY_EMPTY_LABEL,
  RETRY_LABEL,
  resultsCount,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import { renderSearchFallback } from './search-fallback';

/** The whole state set of the list area. The 3-second note is not one of them. */
export type AlternativesState = 'loading' | 'results' | 'empty' | 'error';

export type AlternativesView = {
  state: AlternativesState;
  answer: AlternativesAnswer | null;
  imagesEnabled: boolean;
  query: string;
};

/** Nine dark colours, so a white tile letter keeps its contrast on every one. */
export const TILE_COLORS = [
  '#1F2937',
  '#2F4A6D',
  '#3B2F63',
  '#0B6B57',
  '#5C3B2E',
  '#44403C',
  '#4A2F3D',
  '#1B3A5C',
  '#2E4A2A',
] as const;

/**
 * The same domain always gets the same tile, so a reader learns the colours of
 * the publishers they see twice.
 */
export function tileColor(domain: string): string {
  let hash = 0;

  for (const character of domain) {
    hash += character.charCodeAt(0);
  }

  return TILE_COLORS[hash % TILE_COLORS.length] ?? TILE_COLORS[0];
}

const TILE_LETTER = /[a-z0-9]/i;

const STATUS: Record<AlternativesState, string> = {
  loading: ALTERNATIVES_LOADING,
  results: '',
  empty: ALTERNATIVES_NONE,
  error: ALTERNATIVES_FAILED,
};

const DETAIL: Record<AlternativesState, string> = {
  loading: '',
  results: '',
  empty: NONE_DETAIL,
  error: FAILED_DETAIL,
};

/**
 * The tile reuses the favicon of the answer when the service sends one: the
 * icon is the tile, with no generated colour and no letter behind it. The
 * backend serves that favicon, so the request tells the publisher nothing, and
 * a favicon that fails to load falls back to the letter tile.
 */
function tileElement(alternative: Alternative, imagesEnabled: boolean): HTMLSpanElement {
  const tile = document.createElement('span');
  const favicon = imagesEnabled ? alternative.favicon : undefined;

  tile.setAttribute('data-role', 'tile');
  tile.setAttribute('aria-hidden', 'true');

  const letter = (): void => {
    tile.replaceChildren();
    tile.dataset.tile = 'letter';
    tile.style.backgroundColor = tileColor(alternative.domain);
    tile.textContent = TILE_LETTER.exec(alternative.domain)?.[0]?.toUpperCase() ?? '';
  };

  if (favicon === undefined) {
    letter();

    return tile;
  }

  const image = document.createElement('img');

  tile.dataset.tile = 'favicon';
  image.alt = '';
  image.setAttribute('referrerpolicy', 'no-referrer');
  image.setAttribute('loading', 'lazy');
  image.addEventListener('error', letter);
  image.src = favicon;
  tile.append(image);

  return tile;
}

function imageElement(url: string): HTMLImageElement {
  const image = document.createElement('img');

  image.alt = '';
  image.setAttribute('referrerpolicy', 'no-referrer');
  image.setAttribute('loading', 'lazy');
  image.src = url;

  return image;
}

/**
 * One row: the hero leads with its preview image, and a row trails with its
 * thumbnail and carries the tile of the answer's favicon, or its letter.
 */

function rowFor(alternative: Alternative, imagesEnabled: boolean, hero: boolean): HTMLLIElement {
  const row = document.createElement('li');
  const preview =
    imagesEnabled && typeof alternative.image === 'string' ? imageElement(alternative.image) : null;

  row.dataset.variant = hero ? 'hero' : 'row';

  if (preview === null) {
    row.dataset.layout = 'text';
  }

  if (hero && preview !== null) {
    row.append(preview);
  }

  if (!hero) {
    row.append(tileElement(alternative, imagesEnabled));
  }

  const link = document.createElement('a');
  const meta = document.createElement('p');
  const domain = document.createElement('span');

  link.setAttribute('href', alternative.url);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noreferrer noopener');
  link.textContent = alternative.title;

  // The domain names the source and the description follows it, so one line
  // carries both and the row keeps its height for the title.
  meta.setAttribute('data-role', 'result-meta');
  domain.setAttribute('data-role', 'result-domain');
  domain.textContent = alternative.domain;
  meta.append(domain);

  if (alternative.description !== '') {
    meta.append(` · ${alternative.description}`);
  }

  row.append(link, meta);

  if (!hero && preview !== null) {
    row.append(preview);
  }

  return row;
}

/**
 * The list area's four answers. The rows carry the count; the empty and failed
 * states share the search fallback and the retry, and each names its own reason.
 */
export function renderAlternatives(view: AlternativesView): void {
  const section = roleElement('alternatives');
  const list = roleElement('list');
  const rows = view.state === 'results' && view.answer !== null ? view.answer.alternatives : [];

  if (section !== null) {
    section.dataset.state = view.state;
  }

  list?.replaceChildren();

  setText('status', STATUS[view.state]);
  setText('detail', DETAIL[view.state]);
  setText('count', view.state === 'results' ? resultsCount(rows.length) : '');
  setText('retry', '');
  setHidden('fallback', true);
  setHidden('retry-row', true);

  if (view.state === 'results') {
    for (const [index, alternative] of rows.entries()) {
      list?.append(rowFor(alternative, view.imagesEnabled, index === 0));
    }

    return;
  }

  if (view.state === 'empty' || view.state === 'error') {
    renderSearchFallback(view.query);
    setText('retry', view.state === 'empty' ? RETRY_EMPTY_LABEL : RETRY_LABEL);
    setHidden('retry-row', false);
  }
}
