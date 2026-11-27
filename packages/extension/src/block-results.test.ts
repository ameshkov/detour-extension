// @vitest-environment happy-dom
import type { SitesJson } from '@detour/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AlternativesAnswer } from './alternatives';
import type { AlternativesView } from './block-results';
import { renderAlternatives } from './block-results';
import { TILE_COLORS, tileColor } from './tile-color';
import {
  ALTERNATIVES_FAILED,
  ALTERNATIVES_LOADING,
  ALTERNATIVES_NONE,
  FAILED_DETAIL,
  NONE_DETAIL,
  FALLBACK_HEADING,
  NO_WALLS_LABEL,
  RETRY_EMPTY_LABEL,
  RETRY_LABEL,
  SEARCH_CARD_DETAIL,
  keyboardHint,
  resultsCount,
  resultsLabel,
} from './copy';
import { routeViews } from './state-view';
import { mountShell, readShell, role } from './testing/shell';

const ANSWER: AlternativesAnswer = {
  query: 'Best AI Image Generators 2026',
  degraded: false,
  provider: 'ceramic',
  topic: 'AI image generators',
  alternatives: [
    {
      url: 'https://arstechnica.com/gadgets/2026/10/ai-image-tools-compared/',
      title: 'The best AI image generators, compared',
      description: 'We tested every tool that asks for your money.',
      domain: 'arstechnica.com',
      image: 'https://detour-api.invalid/v1/img?u=a&sig=b',
      match: 'same_story',
    },
    {
      url: 'https://www.theverge.com/ai-image-tools-ranked/',
      title: 'AI image tools, ranked',
      description: 'A second look at the same tools.',
      domain: 'theverge.com',
      match: 'different',
    },
  ],
};

function rows(): NodeListOf<HTMLLIElement> {
  return role('list').querySelectorAll('li');
}

const FAVICON = 'https://detour-api.invalid/v1/img?u=fav&sig=c';

/** The same answer with the favicon that the service sends for the second row. */
function answeredWithFavicon(): AlternativesAnswer {
  return {
    ...ANSWER,
    alternatives: ANSWER.alternatives.map((row, index) =>
      index === 1 ? { ...row, favicon: FAVICON } : row,
    ),
  };
}

/** One list that carries the first alternative and none of the others. */
const LIST: SitesJson = {
  disabled: false,
  avoid: [],
  prefer: [],
  sites: [
    {
      domain: 'arstechnica.com',
      name: 'Ars Technica',
      walls: [{ category: 'paywall', type: 'soft' }],
      paths: [],
      note: 'A paywall covers the article after the first read.',
      avoid: [],
      prefer: [],
    },
  ],
};

/** The tests name an answer and a list; the view carries the rows they make. */
type TestView = Partial<AlternativesView> & {
  answer?: AlternativesAnswer | null;
  list?: SitesJson | null;
};

function view(overrides: TestView = {}): AlternativesView {
  const { answer = null, list = null, ...rest } = overrides;

  return {
    state: 'loading',
    routes: routeViews(answer, list),
    imagesEnabled: true,
    query: '',
    topic: null,
    searchDetail: SEARCH_CARD_DETAIL,
    ...rest,
  };
}

function wallsBadges(): HTMLElement[] {
  return [...role('list').querySelectorAll<HTMLElement>('[data-role="result-walls"]')];
}

function channel(value: number): number {
  const ratio = value / 255;

  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = channel(parseInt(hex.slice(1, 3), 16));
  const green = channel(parseInt(hex.slice(3, 5), 16));
  const blue = channel(parseInt(hex.slice(5, 7), 16));

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

beforeEach(() => {
  mountShell(readShell('block.html'));
});

describe('the alternatives list', () => {
  it('renders the loading state', () => {
    renderAlternatives(view());

    expect(role('alternatives').dataset.state).toBe('loading');
    expect(role('status').textContent).toBe(ALTERNATIVES_LOADING);
    expect(role('count').textContent).toBe('');
    expect(role('list').children).toHaveLength(0);
    expect(role('fallback').hidden).toBe(true);
    expect(role('retry-row').hidden).toBe(true);
  });

  it('renders the results state', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER, query: ANSWER.query }));

    expect(role('status').textContent).toBe('');
    expect(role('detail').textContent).toBe('');
    expect(role('fallback').hidden).toBe(true);
    expect(role('retry-row').hidden).toBe(true);
    // The search card is the last route, so the count and the digits include it.
    expect(role('count').textContent).toBe(resultsCount(3));
    expect(role('count').getAttribute('title')).toBe(resultsLabel(3));
    expect(role('keyboard-hint').textContent).toBe(keyboardHint(3));
    expect(role('search-key').textContent).toBe('3');
    expect(role('keyboard-hint').querySelectorAll('kbd')).toHaveLength(4);
    expect(role('keyboard-hint').hidden).toBe(false);
    expect(role('search').hidden).toBe(false);
    expect(role('search-title').textContent).toBe(FALLBACK_HEADING);
    expect(role('search-detail').textContent).toBe(SEARCH_CARD_DETAIL);
    expect(role('fallback').hidden).toBe(true);
    expect(rows()).toHaveLength(2);
  });

  it('numbers every row and ends it with the arrow', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER }));

    for (const [index, row] of [...rows()].entries()) {
      const key = row.querySelector('[data-role="result-key"]');

      expect(key?.textContent, `row ${index}`).toBe(String(index + 1));
      expect(row.querySelector('[data-role="result-arrow"] svg'), `row ${index}`).not.toBeNull();
    }
  });

  it('hides the keyboard line and the search card outside the results', () => {
    renderAlternatives(view());

    expect(role('keyboard-hint').hidden).toBe(true);
    expect(role('keyboard-hint').textContent).toBe('');
    expect(role('search').hidden).toBe(true);
  });

  it('opens the query form from the search card', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER, query: ANSWER.query }));

    const search = role('search');

    search.click();

    expect(search.hidden).toBe(true);
    expect(role('fallback').hidden).toBe(false);
    expect((role('query') as HTMLInputElement).value).toBe(ANSWER.query);
    expect(role('engines').querySelectorAll('a')).toHaveLength(4);

    const links = [...role('engines').querySelectorAll<HTMLAnchorElement>('a')];

    expect(document.activeElement).toBe(links[0]);
    expect(links[0]?.dataset.selected).toBe('true');
  });

  it('says No walls on a route that the list does not carry', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER, query: ANSWER.query, list: LIST }));

    const rows = [...role('list').querySelectorAll<HTMLLIElement>('li')];

    expect(rows[0]?.querySelector('[data-role="result-walls"]')).toBeNull();
    expect(rows[1]?.querySelector('[data-role="result-walls"]')?.textContent).toBe(NO_WALLS_LABEL);
    expect(rows[1]?.querySelector('[data-role="result-walls"] svg')).not.toBeNull();
  });

  it('says No walls on every route of a list that carries none of them', () => {
    renderAlternatives(
      view({
        state: 'results',
        answer: ANSWER,
        query: ANSWER.query,
        list: { ...LIST, sites: [] },
      }),
    );

    expect(wallsBadges()).toHaveLength(ANSWER.alternatives.length);

    for (const badge of wallsBadges()) {
      expect(badge.textContent).toBe(NO_WALLS_LABEL);
      expect(badge.closest('a')).not.toBeNull();
    }
  });

  it('makes no claim while the list is unknown', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER, query: ANSWER.query }));

    expect(wallsBadges()).toHaveLength(0);
  });

  it('renders the empty state', () => {
    const answer: AlternativesAnswer = { ...ANSWER, alternatives: [] };

    renderAlternatives(view({ state: 'empty', answer, query: 'Chips' }));

    expect(role('alternatives').dataset.state).toBe('empty');
    expect(role('status').textContent).toBe(ALTERNATIVES_NONE);
    expect(role('detail').textContent).toBe(NONE_DETAIL);
    expect(role('count').textContent).toBe('');
    expect(role('search').hidden).toBe(true);
    expect(role('fallback').hidden).toBe(false);
    expect(role('retry-row').hidden).toBe(false);
    expect(role('retry').textContent).toBe(RETRY_EMPTY_LABEL);
    expect(rows()).toHaveLength(0);
  });

  it('renders the error state', () => {
    renderAlternatives(view({ state: 'error', answer: null, query: 'Chips' }));

    expect(role('alternatives').dataset.state).toBe('error');
    expect(role('status').textContent).toBe(ALTERNATIVES_FAILED);
    expect(role('detail').textContent).toBe(FAILED_DETAIL);
    expect(role('count').textContent).toBe('');
    expect(role('fallback').hidden).toBe(false);
    expect(role('retry-row').hidden).toBe(false);
    expect(role('retry').textContent).toBe(RETRY_LABEL);
    expect(rows()).toHaveLength(0);
  });

  it('renders every alternative as the same card', () => {
    renderAlternatives(view({ state: 'results', answer: answeredWithFavicon() }));

    expect(rows()).toHaveLength(2);

    for (const row of rows()) {
      expect(row.dataset.variant).toBeUndefined();
      expect(row.dataset.layout).toBeUndefined();
      expect(row.querySelector('a > [data-role="tile"]')).not.toBeNull();
      expect(row.querySelector('a > img')).toBeNull();
    }
  });

  it('makes the whole row one link, so any part of it opens the story', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER }));

    for (const [index, row] of [...rows()].entries()) {
      const link = row.querySelector('a');

      expect(row.children, `row ${index}`).toHaveLength(1);
      expect(link?.parentElement, `row ${index}`).toBe(row);
      expect(link?.getAttribute('href'), `row ${index}`).toBe(ANSWER.alternatives[index]?.url);
      expect(link?.hasAttribute('target'), `row ${index}`).toBe(false);
      expect(link?.getAttribute('rel'), `row ${index}`).toBe('noreferrer');
      expect(link?.querySelector('[data-role="result-title"]')?.textContent).toBe(
        ANSWER.alternatives[index]?.title,
      );
      expect(link?.querySelector('[data-role="result-meta"]'), `row ${index}`).not.toBeNull();
    }
  });

  it('keeps the tile inside the link', () => {
    renderAlternatives(view({ state: 'results', answer: answeredWithFavicon() }));

    for (const row of rows()) {
      expect(row.querySelector('a > [data-role="tile"]')).not.toBeNull();
      expect(row.querySelector('a > img')).toBeNull();
    }
  });

  it('writes the description in its own element, so a phone can drop it', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER }));

    const description = rows()[1]?.querySelector('[data-role="result-description"]');

    expect(description?.textContent).toBe('A second look at the same tools.');
  });

  it('reuses the favicon of the answer as the tile of a row', () => {
    renderAlternatives(view({ state: 'results', answer: answeredWithFavicon() }));

    const tile = rows()[1]?.querySelector<HTMLElement>('[data-role="tile"]');
    const image = tile?.querySelector('img');

    expect(image?.getAttribute('src')).toBe(FAVICON);
    expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');

    image?.dispatchEvent(new Event('load'));

    expect(tile?.dataset.tile).toBe('favicon');
    expect(tile?.textContent).toBe('');
  });

  it('draws no letter tile behind the favicon it reuses', () => {
    renderAlternatives(view({ state: 'results', answer: answeredWithFavicon() }));

    const tile = rows()[1]?.querySelector<HTMLElement>('[data-role="tile"]');
    const image = tile?.querySelector('img');

    image?.dispatchEvent(new Event('load'));

    expect(tile?.style.backgroundColor).toBe('');
    expect(tile?.dataset.tile).toBe('favicon');
  });

  it('keeps the letter of the domain until the favicon loads', () => {
    renderAlternatives(view({ state: 'results', answer: answeredWithFavicon() }));

    const tile = rows()[1]?.querySelector<HTMLElement>('[data-role="tile"]');
    const image = tile?.querySelector('img');

    // The backend signs the image, so the row starts on the letter and the
    // favicon takes the tile when it arrives.
    expect(tile?.dataset.tile).toBe('letter');
    expect(tile?.textContent).toBe('T');
    expect(image?.hidden).toBe(true);
  });

  it('keeps the letter when the answer carries no favicon', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER }));

    const tile = rows()[1]?.querySelector<HTMLElement>('[data-role="tile"]');

    expect(tile?.querySelector('img')).toBeNull();
    expect(tile?.dataset.tile).toBe('letter');
    expect(tile?.textContent).toBe('T');
  });

  it('keeps the letter when the reader turned images off', () => {
    renderAlternatives(
      view({ state: 'results', answer: answeredWithFavicon(), imagesEnabled: false }),
    );

    const tile = rows()[1]?.querySelector<HTMLElement>('[data-role="tile"]');

    expect(tile?.querySelector('img')).toBeNull();
    expect(tile?.dataset.tile).toBe('letter');
    expect(tile?.textContent).toBe('T');
  });

  it('falls back to the letter tile when the favicon does not load', () => {
    renderAlternatives(view({ state: 'results', answer: answeredWithFavicon() }));

    const tile = rows()[1]?.querySelector<HTMLElement>('[data-role="tile"]');
    const image = tile?.querySelector('img');

    image?.dispatchEvent(new Event('error'));

    expect(tile?.querySelector('img')).toBeNull();
    expect(tile?.dataset.tile).toBe('letter');
    expect(tile?.style.backgroundColor).toBe(tileColor('theverge.com'));
    expect(tile?.textContent).toBe('T');
  });

  it('writes the domain on the row line, after the description', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER }));

    const row = rows()[1];
    const meta = row?.querySelector('[data-role="result-meta"]');
    const description = row?.querySelector('[data-role="result-description"]');

    expect(meta?.querySelector('[data-role="result-domain"]')?.textContent).toBe('theverge.com');
    expect(meta?.textContent).toBe('theverge.comDifferent story');
    expect(description?.textContent).toBe('A second look at the same tools.');
    expect(
      description!.compareDocumentPosition(meta!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('leaves the separator out when the answer carries no description', () => {
    const answer: AlternativesAnswer = {
      ...ANSWER,
      alternatives: ANSWER.alternatives.map((row, index) =>
        index === 1 ? { ...row, description: '' } : row,
      ),
    };

    renderAlternatives(view({ state: 'results', answer }));

    expect(rows()[1]?.querySelector('[data-role="result-meta"]')?.textContent).toBe(
      'theverge.comDifferent story',
    );
    expect(rows()[1]?.querySelector('[data-role="result-description"]')).toBeNull();
  });

  it('names how close each row is to the story', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER }));

    const first = rows()[0]?.querySelector<HTMLElement>('[data-role="result-match"]');
    const second = rows()[1]?.querySelector<HTMLElement>('[data-role="result-match"]');

    expect(first?.textContent).toBe('Same story');
    expect(first?.dataset.match).toBe('same_story');
    expect(second?.textContent).toBe('Different story');
    expect(second?.dataset.match).toBe('different');
  });

  it('leaves the label out when the analysis could not place a row', () => {
    const answer: AlternativesAnswer = {
      ...ANSWER,
      alternatives: ANSWER.alternatives.map((row) => ({ ...row, match: 'unknown' as const })),
    };

    renderAlternatives(view({ state: 'results', answer }));

    for (const row of rows()) {
      expect(row.querySelector('[data-role="result-match"]')).toBeNull();
    }
  });

  it('carries the story of the article at the end of the keyboard line', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER, topic: 'AI image generators' }));

    const topic = role('keyboard-hint').querySelector('[data-role="topic"]');

    expect(topic?.textContent).toBe('Topic: AI image generators');
    expect(role('keyboard-hint').querySelector('[data-role="keyboard-keys"]')).not.toBeNull();
  });

  it('leaves the story out when the answer names none', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER }));

    expect(role('keyboard-hint').querySelector('[data-role="topic"]')).toBeNull();
    expect(role('keyboard-hint').textContent).toBe(keyboardHint(3));
  });

  it('colours the tile of a domain the same way every time', () => {
    const colour = tileColor('arstechnica.com');

    expect(tileColor('arstechnica.com')).toBe(colour);
    expect(TILE_COLORS).toContain(colour);
  });

  it('shows a white letter on every tile colour', () => {
    for (const colour of TILE_COLORS) {
      expect(contrast('#FFFFFF', colour), colour).toBeGreaterThanOrEqual(4.5);
    }
  });
});
