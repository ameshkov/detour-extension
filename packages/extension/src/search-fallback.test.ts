// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

import type { AlternativesAnswer } from './alternatives';
import { SEARCH_ENGINE_NAMES } from './copy';
import type { PageMeta } from './metadata';
import {
  SEARCH_ENGINES,
  engineUrl,
  fallbackQuery,
  readFallbackQuery,
  renderSearchFallback,
} from './search-fallback';
import { mountShell, readShell } from './testing/shell';

const URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';

const META: PageMeta = {
  title: 'Nvidia Bets On Custom Silicon',
  description: null,
};

function field(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('[data-role="query"]');

  if (input === null) {
    throw new Error('the shell has no query field');
  }

  return input;
}

function engines(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('[data-role="engines"] a')];
}

function hrefs(): Array<string | null> {
  return engines().map((link) => link.getAttribute('href'));
}

function type(text: string): void {
  field().value = text;
  field().dispatchEvent(new Event('input'));
}

beforeEach(() => {
  mountShell(readShell('block.html'));
});

describe('the search fallback', () => {
  it('offers the four engines in one order', () => {
    renderSearchFallback('Nvidia custom silicon');

    expect(engines().map((link) => link.textContent)).toEqual([
      SEARCH_ENGINE_NAMES.duckduckgo,
      SEARCH_ENGINE_NAMES.brave,
      SEARCH_ENGINE_NAMES.google,
      SEARCH_ENGINE_NAMES.bing,
    ]);
  });

  it('links the four engines with the encoded query', () => {
    renderSearchFallback('Nvidia custom silicon');

    expect(hrefs()).toEqual([
      'https://duckduckgo.com/?q=Nvidia%20custom%20silicon',
      'https://search.brave.com/search?q=Nvidia%20custom%20silicon',
      'https://www.google.com/search?q=Nvidia%20custom%20silicon',
      'https://www.bing.com/search?q=Nvidia%20custom%20silicon',
    ]);
  });

  it('rebuilds every link when the query is edited', () => {
    renderSearchFallback('Nvidia custom silicon');

    type('my own words');

    expect(hrefs()).toEqual(SEARCH_ENGINES.map((key) => engineUrl(key, 'my own words')));
  });

  it("reports an edit and never the page's own query", () => {
    renderSearchFallback('Nvidia custom silicon');

    expect(readFallbackQuery()).toBe('');

    type('my own words');

    expect(readFallbackQuery()).toBe('my own words');
  });

  it('keeps an edited query through a later render', () => {
    renderSearchFallback('first query');

    type('my own words');
    renderSearchFallback('second query');

    expect(field().value).toBe('my own words');
    expect(hrefs()).toEqual(SEARCH_ENGINES.map((key) => engineUrl(key, 'my own words')));
  });

  it('opens an engine in a new tab without a referrer', () => {
    renderSearchFallback('Nvidia custom silicon');

    expect(engines()).toHaveLength(4);

    for (const link of engines()) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noreferrer noopener');
    }
  });

  it('takes the query the worker answered with', () => {
    const answer: AlternativesAnswer = {
      query: 'The worker query',
      degraded: false,
      provider: 'ceramic',
      alternatives: [],
    };

    const query = fallbackQuery({
      answer,
      meta: META,
      url: URL,
      siteName: 'Forbes',
      edited: '',
    });

    expect(query).toBe('The worker query');
  });

  it('builds the query with the shared cleaner without an answer', () => {
    const query = fallbackQuery({
      answer: null,
      meta: { ...META, title: 'Chips - Forbes' },
      url: 'https://www.forbes.com/tech/nvidia-custom-silicon/',
      siteName: 'Forbes',
      edited: '',
    });

    expect(query).toBe('Chips tech nvidia custom silicon');
  });
});
