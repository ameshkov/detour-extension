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
  '--notice-ink': '#6b5322',
  '--notice-surface': '#fdf6e7',
  '--notice-line': '#efdfbc',
};

const TONES: Array<[string, string]> = [
  ['--ink', '--paper'],
  ['--ink', '--surface'],
  ['--muted', '--paper'],
  ['--muted', '--surface'],
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

/** A rule that names this selector, alone or as one of a group. */
function styleRule(selector: string): CSSStyleRule | null {
  const exact = exactRule(selector);

  if (exact !== null) {
    return exact;
  }

  const wanted = normalize(selector);
  const group = rules().find(
    (candidate) =>
      'selectorText' in candidate &&
      (candidate as CSSStyleRule).selectorText
        .split(',')
        .some((part) => normalize(part) === wanted),
  );

  return group === undefined ? null : (group as CSSStyleRule);
}

/** The rule that declares this selector beside others, whatever an exact rule says. */
function groupRule(selector: string): CSSStyleRule | null {
  const wanted = normalize(selector);
  const found = rules().find(
    (candidate) =>
      'selectorText' in candidate &&
      (candidate as CSSStyleRule).selectorText
        .split(',')
        .some((part) => normalize(part) === wanted),
  );

  return found === undefined ? null : (found as CSSStyleRule);
}

function exactRule(selector: string): CSSStyleRule | null {
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
      styleRule(
        'body[data-page="options"] [data-role="allowance-table"] td:nth-child(3)',
      )?.style.getPropertyValue('text-align'),
    ).toBe('right');
    expect(
      styleRule(
        'body[data-page="options"] [data-role="allowance-table"] td:last-child',
      )?.style.getPropertyValue('text-align'),
    ).toBe('right');
    expect(
      styleRule(
        'body[data-page="options"] [data-role="allowance-table"] td:last-child',
      )?.style.getPropertyValue('padding-left'),
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
    ).toBe('26px');
    expect(
      styleRule('body[data-page="options"] [data-role="cache-heading"]')?.style.getPropertyValue(
        'margin-top',
      ),
    ).toBe('26px');
    expect(
      styleRule('body[data-page="options"] [data-role="clear-cache"]')?.style.getPropertyValue(
        'border-color',
      ),
    ).toBe('var(--control-line)');
  });

  it('sets the page title above the labels of its sections', () => {
    const title = styleRule('body[data-page="options"] [data-role="options-heading"]');

    expect(title?.style.getPropertyValue('font-family')).toBe('var(--serif)');
    expect(title?.style.getPropertyValue('font-size')).toBe('27px');

    for (const role of ['allowed-heading', 'reading-heading', 'cache-heading']) {
      const label = styleRule(`body[data-page="options"] [data-role="${role}"]`);

      expect(label?.style.getPropertyValue('font-size'), role).toBe('11px');
      expect(label?.style.getPropertyValue('text-transform'), role).toBe('uppercase');
      expect(label?.style.getPropertyValue('letter-spacing'), role).toBe('0.1em');
    }
  });

  it('draws the reading checkbox in the sheet, not the platform one', () => {
    const box = styleRule('body[data-page="options"] [data-role="auto-open"]');

    expect(box?.style.getPropertyValue('appearance')).toBe('none');
    expect(box?.style.getPropertyValue('width')).toBe('16px');
    expect(box?.style.getPropertyValue('height')).toBe('16px');
    expect(box?.style.getPropertyValue('border-radius')).toBe('5px');
    expect(box?.style.getPropertyValue('border-color')).toBe('var(--control-line)');
    expect(box?.style.getPropertyValue('background')).toBe('var(--surface)');
    expect(
      styleRule(
        'body[data-page="options"] [data-role="auto-open"]:checked',
      )?.style.getPropertyValue('background'),
    ).toBe('var(--accent)');
    expect(
      styleRule('body[data-page="options"] [data-role="auto-open"]::after')?.style.getPropertyValue(
        'transform',
      ),
    ).toBe('translateX(-0.5px) rotate(45deg)');
  });

  it('answers the pointer on the page controls', () => {
    expect(
      styleRule(
        'body[data-page="options"] [data-role="clear-cache"]:hover',
      )?.style.getPropertyValue('background'),
    ).toBe('var(--hover)');
    expect(
      styleRule(
        'body[data-page="options"] [data-role="allowance-rows"] button:hover',
      )?.style.getPropertyValue('color'),
    ).toBe('var(--blocked)');
    expect(
      styleRule(
        'body[data-page="options"] [data-role="auto-open-row"]:hover [data-role="auto-open"]',
      )?.style.getPropertyValue('border-color'),
    ).toBe('var(--accent)');
    expect(
      styleRule(
        'body[data-page="options"] [data-role="auto-open"]:checked:hover',
      )?.style.getPropertyValue('background'),
    ).toBe('var(--accent-deep)');
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

  it('draws the menu caret from a path the button centres', () => {
    const button = styleRule('[data-role="open-menu"]');

    expect(button?.style.getPropertyValue('display')).toBe('inline-flex');
    expect(button?.style.getPropertyValue('align-items')).toBe('center');
    expect(button?.style.getPropertyValue('justify-content')).toBe('center');

    const svg = styleRule('[data-role="open-menu-caret"] svg');

    expect(svg?.style.getPropertyValue('fill')).toBe('none');
    expect(svg?.style.getPropertyValue('stroke')).toBe('currentColor');
    expect(svg?.style.getPropertyValue('stroke-width')).toBe('1.5');
    expect(
      styleRule(
        '[data-role="open-menu"][aria-expanded="true"] [data-role="open-menu-caret"]',
      )?.style.getPropertyValue('transform'),
    ).toBe('rotate(180deg)');
  });

  it('anchors the menu to the split control, not to the row above it', () => {
    const group = styleRule('[data-role="open-group"]');

    expect(group?.style.getPropertyValue('position')).toBe('relative');
    expect(group?.style.getPropertyValue('display')).toBe('flex');
    expect(styleRule('[data-role="actions"]')?.style.getPropertyValue('position')).toBe('');
  });

  it('opens the menu above a row that has no room below', () => {
    const top = styleRule('[data-role="scope-menu"][data-side="top"]');

    expect(top?.style.getPropertyValue('top')).toBe('auto');
    expect(top?.style.getPropertyValue('bottom')).toBe('calc(100% + 6px)');
  });

  it('sets the list heading above the titles it introduces', () => {
    const heading = styleRule('[data-role="alternatives-heading"]');

    expect(heading?.style.getPropertyValue('font-size')).toBe('20px');
    expect(heading?.style.getPropertyValue('font-family')).toBe('var(--serif)');
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
      styleRule('body[data-page="popup"] [data-role="settings"]')?.style.getPropertyValue(
        'border-top-color',
      ),
    ).toBe('var(--line-soft)');
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

  it('draws a wall as the category in ink, a middot, and the type in grey', () => {
    const pill = styleRule('[data-role="wall"]');

    expect(pill?.style.getPropertyValue('display')).toBe('inline-flex');
    expect(pill?.style.getPropertyValue('border-radius')).toBe('99px');
    expect(pill?.style.getPropertyValue('background')).toBe('var(--surface)');
    expect(pill?.style.getPropertyValue('font-size')).toBe('11.5px');
    expect(styleRule('[data-role="wall-category"]')?.style.getPropertyValue('font-weight')).toBe(
      '600',
    );
    expect(styleRule('[data-role="wall-sep"]')?.style.getPropertyValue('color')).toBe(
      'var(--control-line)',
    );
    expect(styleRule('[data-role="wall-type"]')?.style.getPropertyValue('color')).toBe(
      'var(--muted)',
    );
  });

  it('reads the judgement in ink, under the width of the column', () => {
    expect(styleRule('[data-role="lede"]')?.style.getPropertyValue('max-width')).toBe('610px');
    expect(styleRule('[data-role="lede"]')?.style.getPropertyValue('color')).toBe('var(--ink)');
    expect(styleRule('[data-role="explanation"]')).toBeNull();
    expect(styleRule('[data-role="practice"]')).toBeNull();
  });

  it('centres the site block between the header and the first row', () => {
    const row = styleRule('body[data-page="popup"] [data-role="site-row"]');

    expect(row?.style.getPropertyValue('padding')).toBe('12px 15px 0px');
    expect(
      styleRule('body[data-page="popup"] [data-role="site-walls"]')?.style.getPropertyValue(
        'padding',
      ),
    ).toBe('0px 15px 12px');
    // The action row carries no margin of its own, so the 12 px under the pills
    // is the only space between them and the hairline of that row.
    expect(
      styleRule('body[data-page="popup"] [data-role="site-alternatives"]')?.style.getPropertyValue(
        'margin-top',
      ),
    ).not.toBe('8px');
  });

  it('draws the popup pills smaller than the block page ones', () => {
    const pill = styleRule('body[data-page="popup"] [data-role="wall"]');

    expect(pill?.style.getPropertyValue('font-size')).toBe('10px');
    expect(pill?.style.getPropertyValue('padding')).toBe('3px 8px');
    expect(
      styleRule('body[data-page="popup"] [data-role="site-walls"]')?.style.getPropertyValue(
        'padding',
      ),
    ).toBe('0px 15px 12px');
  });

  it('draws the walls table as a grid of category rows and type columns', () => {
    const cell = styleRule('body[data-page="options"] [data-role="wall-cell"]');

    expect(cell?.style.getPropertyValue('text-align')).toBe('center');
    expect(
      styleRule(
        'body[data-page="options"] [data-role="walls-table"] th[data-role="th-hard"]',
      )?.style.getPropertyValue('text-align'),
    ).toBe('center');
    expect(
      styleRule(
        'body[data-page="options"] [data-role="wall-cell"][data-empty="true"]::after',
      )?.style.getPropertyValue('border'),
    ).toContain('dashed');
    expect(
      styleRule('body[data-page="options"] [data-role="wall-check"]')?.style.getPropertyValue(
        'appearance',
      ),
    ).toBe('none');
  });

  it('marks the on state of the popup with a dot', () => {
    const dot = styleRule('body[data-page="popup"] [data-role="state"][data-state="on"]::before');

    expect(dot?.style.getPropertyValue('background')).toBe('var(--accent)');
    expect(dot?.style.getPropertyValue('border-radius')).toBe('50%');
  });

  it('tones the verdict as text and draws no dot', () => {
    expect(
      styleRule('body[data-page="popup"] [data-role="site-text"]')?.style.getPropertyValue('color'),
    ).toBe('var(--accent)');
    expect(
      styleRule(
        'body[data-page="popup"] [data-role="site-row"][data-listed="false"] [data-role="site-text"]',
      )?.style.getPropertyValue('color'),
    ).toBe('var(--muted)');
    expect(styleRule('body[data-page="popup"] [data-role="site-mark"]')).toBeNull();
  });

  it('carries the report as a sentence link, not as a row', () => {
    const link = styleRule('body[data-page="popup"] [data-role="site-report"]');

    expect(link?.style.getPropertyValue('color')).toBe('var(--accent)');
    expect(link?.style.getPropertyValue('font-size')).toBe('11.5px');
    expect(link?.style.getPropertyValue('text-decoration')).toBe('underline');
    expect(
      styleRule('body[data-page="popup"] [data-role="site-report"]:hover')?.style.getPropertyValue(
        'color',
      ),
    ).toBe('var(--accent-deep)');
  });

  it('answers the pointer on every row and on the switch', () => {
    for (const role of ['site-alternatives', 'pause', 'settings']) {
      expect(
        styleRule(`body[data-page="popup"] [data-role="${role}"]:hover`)?.style.getPropertyValue(
          'background',
        ),
        role,
      ).toBe('var(--hover)');
    }

    expect(
      styleRule(
        'body[data-page="popup"] [data-role="durations"] button:hover',
      )?.style.getPropertyValue('background'),
    ).toBe('var(--hover)');
    expect(
      styleRule('body[data-page="popup"] [data-role="enabled"]:hover')?.style.getPropertyValue(
        'box-shadow',
      ),
    ).toBe('0 0 0 3px var(--accent-ring)');
    expect(
      styleRule(
        'body[data-page="popup"] [data-role="site-alternatives"]:hover .chevron',
      )?.style.getPropertyValue('color'),
    ).toBe('var(--ink)');
    expect(
      styleRule(
        'body[data-page="popup"] [data-role="enabled"]:not(:checked):hover',
      )?.style.getPropertyValue('background'),
    ).toBe('var(--control-line)');
    expect(
      styleRule(
        'body[data-page="popup"] [data-role="enabled"]:checked:hover',
      )?.style.getPropertyValue('background'),
    ).toBe('var(--accent-deep)');
  });

  it('borders the quiet controls at the control tone', () => {
    expect(styleRule('[data-role="query"]')?.style.getPropertyValue('border-color')).toBe(
      'var(--control-line)',
    );
    expect(styleRule('[data-role="engines"] a')?.style.getPropertyValue('border-color')).toBe(
      'var(--control-line)',
    );
  });

  it('sets a popup row at one height, with hairlines and no box', () => {
    for (const role of ['settings', 'site-alternatives']) {
      const row = groupRule(`body[data-page="popup"] [data-role="${role}"]`);

      // The environment keeps a `var()` colour out of the width it reads back,
      // so the colour and the height are what this contract can hold.
      expect(row?.style.getPropertyValue('min-height'), role).toBe('36px');
      expect(row?.style.getPropertyValue('border-top-color'), role).toBe('var(--line-soft)');
      expect(row?.style.getPropertyValue('border-radius'), role).toBe('');
      expect(row?.style.getPropertyValue('background'), role).toBe('var(--paper)');
    }
  });

  it('turns the one chevron down for the pause row and back up when it opens', () => {
    const closed = styleRule('body[data-page="popup"] [data-role="pause-chevron"]');

    expect(closed?.style.getPropertyValue('transform')).toBe('rotate(90deg)');
    expect(
      styleRule(
        'body[data-page="popup"] [data-role="pause"][aria-expanded="true"] [data-role="pause-chevron"]',
      )?.style.getPropertyValue('transform'),
    ).toBe('rotate(-90deg)');
  });

  it('hands the pause hairline to the wrapper that carries the resume', () => {
    expect(
      styleRule('body[data-page="popup"] [data-role="pause-row"]')?.style.getPropertyValue(
        'border-top-color',
      ),
    ).toBe('var(--line-soft)');
    expect(
      styleRule('body[data-page="popup"] [data-role="pause"]')?.style.getPropertyValue(
        'border-top-color',
      ),
      'the pause row drops the hairline its group declares',
    ).toBe('initial');
  });

  it('keeps the site block free of a second line of prose', () => {
    expect(styleRule('body[data-page="popup"] [data-role="site-wall"]')).toBeNull();
    expect(styleRule('body[data-page="popup"] [data-role="site-detail"]')).toBeNull();
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
