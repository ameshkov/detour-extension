import {
  ALTERNATIVES_FAILED,
  ALTERNATIVES_LOADING,
  ALTERNATIVES_NONE,
  FAILED_DETAIL,
  NONE_DETAIL,
  FALLBACK_HEADING,
  RETRY_EMPTY_LABEL,
  RETRY_LABEL,
  keyboardHintParts,
  resultsCount,
  resultsLabel,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import { renderHint } from './hint';
import { routeRow } from './result-row';
import { renderSearchFallback, selectEngine } from './search-fallback';
import type { RouteView } from './state-view';

/** The whole state set of the list area. The 3-second note is not one of them. */
export type AlternativesState = 'loading' | 'results' | 'empty' | 'error';

export type AlternativesView = {
  state: AlternativesState;
  /** The rows that the worker built, each with its wall verdict and match. */
  routes: RouteView[];
  imagesEnabled: boolean;
  query: string;
  /** The story of the article, which the keyboard line carries. */
  topic: string | null;
  /** The second line of the search card. The popup has no field to edit. */
  searchDetail: string;
};

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
 * The list area's four answers. The rows carry the count; the empty and failed
 * states share the search fallback and the retry, and each names its own reason.
 */
export function renderAlternatives(view: AlternativesView): void {
  const section = roleElement('alternatives');
  const list = roleElement('list');
  const rows = view.state === 'results' ? view.routes : [];

  if (section !== null) {
    section.dataset.state = view.state;
  }

  list?.replaceChildren();

  // The search card closes the list, so it is one more route and it carries the
  // last number. The count, the keyboard line, and the digit keys include it.
  const routes = view.state === 'results' ? rows.length + 1 : rows.length;

  setText('status', STATUS[view.state]);
  setText('detail', DETAIL[view.state]);

  const countText = view.state === 'results' ? resultsCount(routes) : '';

  setText('count', countText);
  setHidden('count', countText === '');
  const searchable = view.state === 'results' && rows.length > 0;

  setHidden('search', !searchable);
  setHidden('keyboard-hint', !searchable);

  if (searchable) {
    renderHint(roleElement('keyboard-hint'), keyboardHintParts(routes), view.topic);
    setText('search-key', String(routes));
    setText('search-title', FALLBACK_HEADING);
    setText('search-detail', view.searchDetail);

    const search = roleElement('search');

    if (search !== null) {
      search.onclick = (): void => {
        setHidden('search', true);
        renderSearchFallback(view.query);
        // The engines answer the digits, so the first one takes the focus and
        // the reader picks another with a number or the arrows.
        selectEngine(0);
      };
    }
  } else {
    setText('keyboard-hint', '');
    setText('search-key', '');

    const search = roleElement('search');

    if (search !== null) {
      search.onclick = null;
    }
  }
  setText('retry', '');

  const count = roleElement('count');

  if (count !== null && view.state === 'results') {
    count.setAttribute('title', resultsLabel(routes));
    count.setAttribute('aria-label', resultsLabel(routes));
  } else if (count !== null) {
    count.removeAttribute('title');
    count.removeAttribute('aria-label');
  }
  setHidden('fallback', true);
  setHidden('fallback-note', true);
  setHidden('retry-row', true);

  if (view.state === 'results') {
    for (const [index, route] of rows.entries()) {
      list?.append(routeRow(route, view.imagesEnabled, index));
    }

    return;
  }

  if (view.state === 'empty' || view.state === 'error') {
    renderSearchFallback(view.query);
    setText('retry', view.state === 'empty' ? RETRY_EMPTY_LABEL : RETRY_LABEL);
    setHidden('retry-row', false);
  }
}
