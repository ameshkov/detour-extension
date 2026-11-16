// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import type { AlternativesAnswer } from './alternatives';
import { TILE_COLORS, renderAlternatives, tileColor } from './block-results';
import { mountShell, readShell } from './testing/shell';

const CSS = readFileSync(resolve(import.meta.dirname, './ui.css'), 'utf8');

const PALETTE: Record<string, string> = {
  '--paper': '#fbfaf8',
  '--surface': '#ffffff',
  '--ink': '#16161a',
  '--muted': '#6e6c67',
  '--line': '#e8e4dd',
  '--accent': '#0b6b57',
  '--blocked': '#c0513f',
  '--chip-ink': '#96382e',
  '--chip-surface': '#fcf0ed',
  '--chip-line': '#f0d9d3',
  '--notice-ink': '#6b5322',
  '--notice-surface': '#fdf6e7',
  '--notice-line': '#efdfbc',
};

const TONES: Array<[string, string]> = [
  ['--ink', '--paper'],
  ['--ink', '--surface'],
  ['--muted', '--paper'],
  ['--muted', '--surface'],
  ['--chip-ink', '--chip-surface'],
  ['--notice-ink', '--notice-surface'],
  ['--surface', '--accent'],
];

const ANSWER: AlternativesAnswer = {
  query: 'Nvidia custom silicon',
  degraded: false,
  provider: 'ceramic',
  alternatives: [
    {
      url: 'https://arstechnica.com/gadgets/2026/10/nvidia-custom-silicon/',
      title: 'Nvidia custom silicon, explained',
      description: 'Hyperscalers want their own silicon.',
      domain: 'arstechnica.com',
    },
    {
      url: 'https://www.theverge.com/nvidia-custom-silicon/',
      title: 'The custom silicon race',
      description: 'Every large platform wants a chip of its own.',
      domain: 'theverge.com',
    },
  ],
};

type MediaRule = CSSRule & { media: MediaList; cssRules: CSSRuleList };

/** The environment writes an attribute selector with either quote and keeps source newlines. */
function normalize(selector: string): string {
  return selector.replace(/'/g, '"').replace(/\s+/g, ' ').trim();
}

function rules(): CSSRule[] {
  return [...document.styleSheets[0]!.cssRules];
}

function styleRule(selector: string): CSSStyleRule | null {
  const found = rules().find(
    (candidate) =>
      'selectorText' in candidate &&
      normalize((candidate as CSSStyleRule).selectorText) === normalize(selector),
  );

  return found === undefined ? null : (found as CSSStyleRule);
}

function mediaRule(text: string): MediaRule | null {
  const found = rules().find(
    (candidate) => 'media' in candidate && (candidate as MediaRule).media.mediaText === text,
  );

  return found === undefined ? null : (found as MediaRule);
}

function innerRule(media: MediaRule | null, selector: string): CSSStyleRule | null {
  const found =
    media === null
      ? undefined
      : [...media.cssRules].find(
          (candidate) =>
            'selectorText' in candidate &&
            normalize((candidate as CSSStyleRule).selectorText) === normalize(selector),
        );

  return found === undefined ? null : (found as CSSStyleRule);
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
  document.head.replaceChildren();
  document.body.replaceChildren();

  const sheet = document.createElement('style');

  sheet.textContent = CSS;
  document.head.append(sheet);
});

describe('the stylesheet', () => {
  it('pins the palette of the design', () => {
    for (const [name, value] of Object.entries(PALETTE)) {
      expect(token(name), name).toBe(value);
    }
  });

  it('keeps every text tone at 4.5 to 1', () => {
    for (const [foreground, background] of TONES) {
      expect(
        contrast(token(foreground), token(background)),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('closes a hidden component over its own display rule', () => {
    const row = document.createElement('div');

    row.setAttribute('data-role', 'actions');
    document.body.append(row);

    expect(getComputedStyle(row).display).toBe('flex');

    row.hidden = true;

    expect(getComputedStyle(row).display).toBe('none');

    const hidden = styleRule('[hidden]');

    expect(hidden).not.toBeNull();
    expect(hidden?.style.getPropertyPriority('display')).toBe('important');
  });

  it('drops the thumbnails below 520 pixels', () => {
    const narrow = mediaRule('(max-width: 520px)');

    expect(narrow).not.toBeNull();
    expect(
      innerRule(narrow, '[data-role="list"] > li > img')?.style.getPropertyValue('display'),
    ).toBe('none');
    expect(innerRule(narrow, '[data-role="headline"]')?.style.getPropertyValue('font-size')).toBe(
      '24px',
    );
  });

  it('stacks the action row below 520 pixels', () => {
    const narrow = mediaRule('(max-width: 520px)');

    expect(narrow).not.toBeNull();
    expect(innerRule(narrow, '[data-role="open-site"]')?.style.getPropertyValue('flex-grow')).toBe(
      '1',
    );
    expect(innerRule(narrow, '[data-role="report"]')?.style.getPropertyValue('flex-basis')).toBe(
      '100%',
    );
    expect(innerRule(narrow, '[data-role="report"]')?.style.getPropertyValue('margin-left')).toBe(
      '0px',
    );
  });

  it('frames the popup at 340 pixels', () => {
    expect(styleRule('body[data-page="popup"]')?.style.getPropertyValue('width')).toBe('340px');
    expect(
      styleRule(
        'body[data-page="popup"] [data-role="state"][data-state="off"]',
      )?.style.getPropertyValue('color'),
    ).toBe('var(--muted)');
    expect(
      styleRule(
        'body[data-page="popup"] [data-role="state"][data-state="paused"]',
      )?.style.getPropertyValue('color'),
    ).toBe('var(--notice-ink)');
  });

  it('frames the options page at 640 pixels', () => {
    expect(styleRule('body[data-page="options"] main')?.style.getPropertyValue('max-width')).toBe(
      '640px',
    );
    expect(
      styleRule('body[data-page="options"] [data-role="allowance-table"]')?.style.getPropertyValue(
        'width',
      ),
    ).toBe('100%');
    expect(
      styleRule('body[data-page="options"] th')?.style.getPropertyValue('text-transform'),
    ).toBe('uppercase');
    expect(
      styleRule('body[data-page="options"] th[data-role="th-added"]')?.style.getPropertyValue(
        'text-align',
      ),
    ).toBe('right');
    expect(
      styleRule('body[data-page="options"] td:nth-child(3)')?.style.getPropertyValue('text-align'),
    ).toBe('right');
    expect(
      styleRule('body[data-page="options"] td:last-child')?.style.getPropertyValue('text-align'),
    ).toBe('right');
    expect(
      styleRule('body[data-page="options"] td:last-child')?.style.getPropertyValue('padding-left'),
    ).toBe('18px');
    expect(
      styleRule(
        'body[data-page="options"] [data-role="allowance-rows"] button',
      )?.style.getPropertyValue('text-decoration'),
    ).toBe('underline');
    expect(
      styleRule('body[data-page="options"] [data-role="allowed-heading"]')?.style.getPropertyValue(
        'margin-top',
      ),
    ).toBe('22px');
  });

  it('joins the two halves of the open control', () => {
    const gap = styleRule('[data-role="actions"]')?.style.getPropertyValue('gap') ?? '';
    // The shorthand carries the row gap first and the column gap second.
    const columnGap = gap.split(/\s+/)[1];

    expect(columnGap).toBe('0');

    const report = styleRule('[data-role="report"]');

    expect(report?.style.getPropertyValue('margin-left')).toBe('auto');
    expect(report?.style.getPropertyValue('padding-left')).toBe('20px');
  });

  it('shows a focus ring for the keyboard', () => {
    const focus = styleRule(':focus-visible');

    expect(focus).not.toBeNull();
    expect(focus?.style.getPropertyValue('outline')).toContain('var(--accent)');
    expect(focus?.style.getPropertyValue('outline-offset')).toBe('2px');
    expect(CSS).not.toContain('outline: none');
  });

  it('stops the motion the reader cannot stop', () => {
    const motion = mediaRule('(prefers-reduced-motion: reduce)');
    const inner = innerRule(motion, '*, *::before, *::after');

    expect(motion).not.toBeNull();
    expect(inner).not.toBeNull();
    expect(inner?.style.getPropertyValue('transition')).toBe('none');
    expect(inner?.style.getPropertyValue('animation')).toBe('none');
    expect(inner?.style.getPropertyPriority('transition')).toBe('important');
    expect(inner?.style.getPropertyPriority('animation')).toBe('important');
  });

  it('colours every letter on its tile', () => {
    mountShell(readShell('block.html'));
    renderAlternatives({ state: 'results', answer: ANSWER, imagesEnabled: false, query: '' });

    const tile = document.querySelector<HTMLElement>('[data-role="tile"]');

    expect(tile).not.toBeNull();
    expect(TILE_COLORS).toContain(tile?.style.backgroundColor);
    expect(tile?.style.backgroundColor).toBe(tileColor('theverge.com'));
    expect(getComputedStyle(tile!).color).toBe(token('--surface'));
  });
});
