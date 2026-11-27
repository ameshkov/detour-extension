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
  icon: null,
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

function names(): Array<string | null> {
  return engines().map(
    (link) => link.querySelector('[data-role="engine-name"]')?.textContent ?? null,
  );
}

function keyCaps(): Array<string | null> {
  return engines().map(
    (link) => link.querySelector('[data-role="engine-key"]')?.textContent ?? null,
  );
}

function box(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-role="fallback"]');

  if (element === null) {
    throw new Error('the shell has no fallback box');
  }

  return element;
}

function hrefs(): Array<string | null> {
  return engines().map((link) => link.getAttribute('href'));
}

function type(text: string): void {
  field().value = text;
  field().dispatchEvent(new Event('input'));
}

function press(key: string, target: HTMLElement): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/**
 * Records the engines that a press would open, and keeps the run from
 * navigating. The listener sits on the container, because every edit rebuilds
 * the links.
 */
function recordClicks(): string[] {
  const clicked: string[] = [];
  const container = document.querySelector('[data-role="engines"]');

  container?.addEventListener('click', (event) => {
    event.preventDefault();

    if (event.target instanceof HTMLAnchorElement) {
      clicked.push(event.target.querySelector('[data-role="engine-name"]')?.textContent ?? '');
    }
  });

  return clicked;
}

beforeEach(() => {
  mountShell(readShell('block.html'));
});

describe('the search fallback', () => {
  it('offers the four engines in one order', () => {
    renderSearchFallback('Nvidia custom silicon');

    expect(names()).toEqual([
      SEARCH_ENGINE_NAMES.duckduckgo,
      SEARCH_ENGINE_NAMES.brave,
      SEARCH_ENGINE_NAMES.google,
      SEARCH_ENGINE_NAMES.bing,
    ]);
  });

  it('names the keys of the engines on a line below the box', () => {
    renderSearchFallback('Nvidia custom silicon');

    const note = document.querySelector<HTMLElement>('[data-role="fallback-note"]');
    const keys = [...document.querySelectorAll('[data-role="fallback-note"] kbd')];

    expect(note).not.toBeNull();
    expect(note?.closest('[data-role="fallback"]')).toBeNull();
    expect(note?.textContent).toContain('to search with an engine');
    expect(keys.map((key) => key.textContent)).toEqual(['1', '4', '↵', '↑']);
  });

  it('numbers the engines from one', () => {
    renderSearchFallback('Nvidia custom silicon');

    expect(keyCaps()).toEqual(['1', '2', '3', '4']);
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

  it('searches with the first engine on enter in the query', () => {
    renderSearchFallback('Nvidia custom silicon');

    const clicked = recordClicks();

    press('Enter', field());

    expect(clicked).toEqual([SEARCH_ENGINE_NAMES.duckduckgo]);
  });

  it('searches with the engine that the query was edited to', () => {
    renderSearchFallback('Nvidia custom silicon');

    const clicked = recordClicks();

    type('my own words');
    press('Enter', field());

    expect(clicked).toEqual([SEARCH_ENGINE_NAMES.duckduckgo]);
    expect(engines()[0]?.href).toBe(engineUrl('duckduckgo', 'my own words'));
  });

  it('walks the engines with the arrows and returns to the query', () => {
    renderSearchFallback('Nvidia custom silicon');

    press('ArrowDown', field());

    expect(document.activeElement).toBe(engines()[0]);
    expect(engines()[0]?.dataset.selected).toBe('true');

    press('ArrowDown', engines()[0]!);

    expect(document.activeElement).toBe(engines()[1]);
    expect(engines()[1]?.dataset.selected).toBe('true');
    expect(engines()[0]?.dataset.selected).toBeUndefined();

    press('ArrowUp', engines()[1]!);

    expect(document.activeElement).toBe(engines()[0]);

    press('ArrowUp', engines()[0]!);

    expect(document.activeElement).toBe(field());
  });

  it('selects an engine with its digit and gives it the focus', () => {
    renderSearchFallback('Nvidia custom silicon');

    press('3', box());

    expect(document.activeElement).toBe(engines()[2]);
    expect(engines()[2]?.dataset.selected).toBe('true');
    expect(engines()[0]?.dataset.selected).toBeUndefined();
  });

  it('leaves a digit that belongs to the query to the query field', () => {
    renderSearchFallback('Nvidia custom silicon');

    press('3', box());
    press('4', field());

    expect(engines()[3]?.dataset.selected).toBeUndefined();
    expect(engines()[2]?.dataset.selected).toBe('true');
  });

  it('searches with the engine chosen with a digit', () => {
    renderSearchFallback('Nvidia custom silicon');

    const clicked = recordClicks();

    press('3', box());
    press('Enter', field());

    expect(clicked).toEqual([SEARCH_ENGINE_NAMES.google]);
  });

  it('keeps a digit above four inside the box away from the list', () => {
    renderSearchFallback('Nvidia custom silicon');

    press('3', box());

    const event = new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true });

    engines()[2]?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(engines()[2]?.dataset.selected).toBe('true');
  });

  it('opens the engine that holds the focus with enter', () => {
    renderSearchFallback('Nvidia custom silicon');

    const clicked = recordClicks();

    press('4', box());
    press('Enter', engines()[3]!);

    expect(clicked).toEqual([SEARCH_ENGINE_NAMES.bing]);
  });

  it('offers sites similar to the domain when the page carries no title', () => {
    const query = fallbackQuery({
      answer: null,
      meta: { ...META, title: '   ' },
      url: URL,
      siteName: 'Forbes',
      edited: '',
    });

    expect(query).toBe('Sites similar to forbes.com');
  });

  it('offers similar sites when the metadata names no title at all', () => {
    const query = fallbackQuery({
      answer: null,
      meta: { ...META, title: null },
      url: URL,
      siteName: 'Forbes',
      edited: '',
    });

    expect(query).toBe('Sites similar to forbes.com');
  });

  it('still takes the edit of the reader when the page carries no title', () => {
    const query = fallbackQuery({
      answer: null,
      meta: { ...META, title: '' },
      url: URL,
      siteName: 'Forbes',
      edited: 'my own words',
    });

    expect(query).toBe('my own words');
  });

  it('names the host of a page without a registrable domain', () => {
    const query = fallbackQuery({
      answer: null,
      meta: { ...META, title: '' },
      url: 'http://127.0.0.1:8787/walled/slow',
      siteName: 'Local fixture',
      edited: '',
    });

    expect(query).toBe('Sites similar to 127.0.0.1');
  });

  it('keeps the cleaner query when the metadata did not arrive', () => {
    const query = fallbackQuery({
      answer: null,
      meta: null,
      url: 'https://www.forbes.com/tech/nvidia-custom-silicon/',
      siteName: 'Forbes',
      edited: '',
    });

    expect(query).toBe('tech nvidia custom silicon');
  });

  it('takes the query the worker answered with', () => {
    const answer: AlternativesAnswer = {
      query: 'The worker query',
      degraded: false,
      provider: 'ceramic',
      topic: null,
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
