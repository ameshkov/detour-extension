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
  '--line-soft': '#f0ece5',
  '--control-line': '#ded9d0',
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
    expect(
      innerRule(narrow, '[data-role="actions"] [data-role="report"]')?.style.getPropertyValue(
        'flex-basis',
      ),
    ).toBe('100%');
    expect(
      innerRule(narrow, '[data-role="actions"] [data-role="report"]')?.style.getPropertyValue(
        'margin-left',
      ),
    ).toBe('0px');
  });

  it('keeps the popup footer inside its frame below 520 pixels', () => {
    const narrow = mediaRule('(max-width: 520px)');

    expect(narrow).not.toBeNull();
    // The popup is 340 pixels wide, so this breakpoint always matches there. A
    // rule that hands the bare report link the whole row would push the privacy
    // link out of the frame, and the browser would widen the window to it.
    expect(innerRule(narrow, '[data-role="report"]')).toBeNull();
    expect(innerRule(narrow, '[data-role="actions"] [data-role="report"]')).not.toBeNull();
    expect(styleRule('body[data-page="popup"] footer')?.style.getPropertyValue('flex-wrap')).toBe(
      'wrap',
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
    expect(
      styleRule('body[data-page="options"] [data-role="cache-heading"]')?.style.getPropertyValue(
        'margin-top',
      ),
    ).toBe('26px');
    expect(
      styleRule('body[data-page="options"] [data-role="clear-cache"]')?.style.getPropertyValue(
        'border-color',
      ),
    ).toBe('var(--ink)');
  });

  it('joins the two halves of the open control', () => {
    const gap = styleRule('[data-role="actions"]')?.style.getPropertyValue('gap') ?? '';
    // The shorthand carries the row gap first and the column gap second.
    const columnGap = gap.split(/\s+/)[1];

    expect(columnGap).toBe('0');
    expect(gap.split(/\s+/)[0]).toBe('20px');

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

  it('draws a divider softer than a card border', () => {
    expect(
      styleRule('[data-role="list"] > li + li')?.style.getPropertyValue('border-top-color'),
    ).toBe('var(--line-soft)');
    expect(styleRule('[data-role="actions"]')?.style.getPropertyValue('border-top-color')).toBe(
      'var(--line-soft)',
    );
    expect(
      styleRule('body[data-page="popup"] [data-role="list"]')?.style.getPropertyValue(
        'border-bottom',
      ),
    ).toBe('0px');
    expect(
      styleRule('body[data-page="options"] td')?.style.getPropertyValue('border-top-color'),
    ).toBe('var(--line-soft)');
  });

  it('lifts a hovered row into a card of its own', () => {
    const hover = styleRule('[data-role="list"] > li[data-variant="row"]:hover');

    expect(hover?.style.getPropertyValue('border-radius')).toBe('var(--radius)');
    expect(
      styleRule('[data-role="list"] > li[data-variant="row"]:hover + li')?.style.getPropertyValue(
        'border-top-color',
      ),
    ).toBe('transparent');
  });

  it('keeps a row at two lines: the title, then the domain and the description', () => {
    const meta = styleRule('[data-role="list"] > li > [data-role="result-meta"]');

    expect(meta?.style.getPropertyValue('grid-row')).toBe('2');
    expect(meta?.style.getPropertyValue('margin')).toBe('0px');
    expect(styleRule('[data-role="result-domain"]')?.style.getPropertyValue('color')).toBe(
      'var(--ink)',
    );
  });

  it('reads the practice in the muted tone and the judgement in ink', () => {
    expect(styleRule('[data-role="lede"]')?.style.getPropertyValue('max-width')).toBe('610px');
    expect(styleRule('[data-role="lede"]')?.style.getPropertyValue('color')).toBe('var(--muted)');
    expect(styleRule('[data-role="explanation"]')?.style.getPropertyValue('color')).toBe(
      'var(--ink)',
    );
  });

  it('marks the on state of the popup with a dot', () => {
    const dot = styleRule('body[data-page="popup"] [data-role="state"][data-state="on"]::before');

    expect(dot?.style.getPropertyValue('background')).toBe('var(--accent)');
    expect(dot?.style.getPropertyValue('border-radius')).toBe('50%');
  });

  it('gives the allowance of this tab its own edge', () => {
    const row = styleRule('body[data-page="popup"] [data-role="tab-allowance"]');

    // The sheet writes `3px solid var(--accent)`, and this environment keeps the
    // colour out of a shorthand it cannot parse.
    expect(row?.style.getPropertyValue('border-left-width')).toBe('3px');
    expect(row?.style.getPropertyValue('border-left-style')).toBe('solid');
    expect(row?.style.getPropertyValue('border-left-color')).toBe('var(--accent)');
    expect(row?.style.getPropertyValue('background')).toBe('var(--surface)');
    expect(row?.style.getPropertyValue('padding-left')).toBe('12px');
  });

  it('borders the quiet controls at the control tone', () => {
    expect(styleRule('[data-role="query"]')?.style.getPropertyValue('border-color')).toBe(
      'var(--control-line)',
    );
    expect(
      styleRule('body[data-page="popup"] [data-role="pause-button"]')?.style.getPropertyValue(
        'border-radius',
      ),
    ).toBe('9px');
  });

  it('leads a failure with a mark and an engine link with an arrow', () => {
    const mark = styleRule(
      '[data-role="alternatives"][data-state="error"] [data-role="status"]::before',
    );
    const arrow = styleRule('[data-role="engines"] a::after');

    expect(mark?.style.getPropertyValue('content').replace(/["']/g, '')).toBe('!');
    expect(mark?.style.getPropertyValue('border-radius')).toBe('50%');
    expect(arrow?.style.getPropertyValue('content').replace(/["']/g, '')).toBe('↗');
  });

  it('tightens the lede and the actions below 520 pixels', () => {
    const narrow = mediaRule('(max-width: 520px)');

    expect(innerRule(narrow, '[data-role="headline"]')?.style.getPropertyValue('margin')).toBe(
      '14px 0px 12px',
    );
    expect(innerRule(narrow, '[data-role="lede"]')?.style.getPropertyValue('margin-bottom')).toBe(
      '20px',
    );
    expect(innerRule(narrow, '[data-role="actions"]')?.style.getPropertyValue('gap')).toBe(
      '12px 0',
    );
    expect(innerRule(narrow, '[data-role="source"]')?.style.getPropertyValue('padding')).toBe(
      '10px',
    );
  });

  it('gives the options page room under its last control', () => {
    const rows = styleRule(
      'body[data-page="options"] [data-role="auto-open-row"], body[data-page="options"] [data-role="images-row"]',
    );
    const detail = styleRule(
      'body[data-page="options"] [data-role="auto-open-detail"], body[data-page="options"] [data-role="images-detail"]',
    );

    expect(styleRule('body[data-page="options"] main')?.style.getPropertyValue('padding')).toBe(
      '22px 22px 24px',
    );
    expect(rows?.style.getPropertyValue('column-gap')).toBe('14px');
    expect(detail?.style.getPropertyValue('max-width')).toBe('400px');
    expect(detail?.style.getPropertyValue('margin-top')).toBe('3px');
  });
});
