// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

import type { AlternativesAnswer } from './alternatives';
import type { AlternativesView } from './block-results';
import { TILE_COLORS, renderAlternatives, tileColor } from './block-results';
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
import { mountShell, readShell, role } from './testing/shell';

const ANSWER: AlternativesAnswer = {
  query: 'Best AI Image Generators 2026',
  degraded: false,
  provider: 'ceramic',
  alternatives: [
    {
      url: 'https://arstechnica.com/gadgets/2026/10/ai-image-tools-compared/',
      title: 'The best AI image generators, compared',
      description: 'We tested every tool that asks for your money.',
      domain: 'arstechnica.com',
      image: 'https://detour-api.invalid/v1/img?u=a&sig=b',
    },
    {
      url: 'https://www.theverge.com/ai-image-tools-ranked/',
      title: 'AI image tools, ranked',
      description: 'A second look at the same tools.',
      domain: 'theverge.com',
    },
  ],
};

function rows(): NodeListOf<HTMLLIElement> {
  return role('list').querySelectorAll('li');
}

function view(overrides: Partial<AlternativesView> = {}): AlternativesView {
  return { state: 'loading', answer: null, imagesEnabled: true, query: '', ...overrides };
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
    expect(role('count').textContent).toBe(resultsCount(2));
    expect(rows()).toHaveLength(2);
  });

  it('renders the empty state', () => {
    const answer: AlternativesAnswer = { ...ANSWER, alternatives: [] };

    renderAlternatives(view({ state: 'empty', answer, query: 'Chips' }));

    expect(role('alternatives').dataset.state).toBe('empty');
    expect(role('status').textContent).toBe(ALTERNATIVES_NONE);
    expect(role('detail').textContent).toBe(NONE_DETAIL);
    expect(role('count').textContent).toBe('');
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

  it('renders the first alternative as the hero', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER }));

    expect(rows()[0]?.dataset.variant).toBe('hero');
    expect(rows()[1]?.dataset.variant).toBe('row');
  });

  it('gives a row without an image the full width', () => {
    renderAlternatives(view({ state: 'results', answer: ANSWER }));

    expect(rows()[0]?.dataset.layout).toBeUndefined();
    expect(rows()[1]?.dataset.layout).toBe('text');
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
