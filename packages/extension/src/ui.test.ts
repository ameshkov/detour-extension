// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { TILE_COLORS, tileColor } from './tile-color';

const CSS = readFileSync(resolve(import.meta.dirname, './ui.css'), 'utf8');

const PALETTE: Record<string, string> = {
  '--paper': '#f8fafc',
  '--surface': '#ffffff',
  '--ink': '#0f172a',
  '--body': '#475569',
  '--muted': '#64748b',
  '--faint': '#94a3b8',
  '--line': '#e2e8f0',
  '--line-soft': '#f1f5f9',
  '--control-line': '#cbd5e1',
  '--accent': '#2563eb',
  '--accent-deep': '#1d4ed8',
  '--blocked': '#e11d48',
  '--clear-ink': '#047857',
  '--notice-ink': '#92400e',
  '--notice-surface': '#fffbeb',
  '--notice-line': '#fde68a',
};

const DARK: Record<string, string> = {
  '--paper': '#090d16',
  '--surface': '#111827',
  '--ink': '#f1f5f9',
  '--body': '#cbd5e1',
  '--muted': '#94a3b8',
  '--faint': '#64748b',
  '--line': '#1e293b',
  '--accent': '#3b82f6',
  '--clear-ink': '#34d399',
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

/** An inner rule that names this selector, alone or as one of a group. */
function innerStyleRule(media: MediaRule | null, selector: string): CSSStyleRule | null {
  const exact = innerRule(media, selector);

  if (exact !== null || media === null) {
    return exact;
  }

  const wanted = normalize(selector);
  const found = [...media.cssRules].find(
    (candidate) =>
      'selectorText' in candidate &&
      (candidate as CSSStyleRule).selectorText
        .split(',')
        .some((part) => normalize(part) === wanted),
  );

  return found === undefined ? null : (found as CSSStyleRule);
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function decl(rule: CSSStyleRule | null, name: string): string {
  return rule?.style.getPropertyValue(name).trim() ?? '';
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

describe('the design tokens', () => {
  it('pins the palette of the design', () => {
    for (const [name, value] of Object.entries(PALETTE)) {
      expect(token(name), name).toBe(value);
    }
  });

  it('pins a dark set that the system or the stored choice selects', () => {
    const dark = exactRule(':root[data-theme="dark"]');
    const system = innerRule(
      mediaRule('(prefers-color-scheme: dark)'),
      ':root:not([data-theme="light"])',
    );

    expect(dark, 'the stored dark theme').not.toBeNull();
    expect(system, 'the system dark theme').not.toBeNull();

    for (const [name, value] of Object.entries(DARK)) {
      expect(decl(dark, name), name).toBe(value);
      expect(decl(system, name), `${name} on the system choice`).toBe(value);
    }
  });

  it('keeps every text tone at 4.5 to 1', () => {
    const pairs: Array<[string, string]> = [
      ['--ink', '--surface'],
      ['--muted', '--surface'],
      ['--muted', '--paper'],
      ['--notice-ink', '--notice-surface'],
      ['--accent', '--surface'],
    ];

    for (const [foreground, background] of pairs) {
      expect(
        contrast(PALETTE[foreground]!, PALETTE[background]!),
        `${foreground}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    const dark = exactRule(':root[data-theme="dark"]');

    for (const [foreground, background] of [
      ['--ink', '--surface'],
      ['--muted', '--surface'],
    ] as Array<[string, string]>) {
      expect(
        contrast(decl(dark, foreground), decl(dark, background)),
        `${foreground} in the dark set`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('ships the interface font with the sheet', () => {
    expect(CSS).toContain('@font-face');
    expect(CSS).toContain("url('inter.woff2')");
    expect(token('--sans')).toContain('Inter');
  });

  it('leaves the display face out', () => {
    expect(CSS).not.toContain('--serif');
    expect(CSS).not.toContain('Iowan Old Style');
    expect(CSS).not.toContain('var(--serif)');
  });

  it('closes a hidden component over its own display rule', () => {
    const row = document.createElement('div');

    row.setAttribute('data-role', 'actions');
    document.body.append(row);
    expect(getComputedStyle(row).display).not.toBe('none');
    row.hidden = true;
    expect(getComputedStyle(row).display).toBe('none');
  });

  it('draws the focus ring from the accent', () => {
    const rule = styleRule(':focus-visible');

    expect(decl(rule, 'outline')).toContain('var(--accent)');
    expect(decl(rule, 'outline-offset')).toBe('2px');
  });

  it('stops a transition when the reader asks for less motion', () => {
    const rule = mediaRule('(prefers-reduced-motion: reduce)');
    const all = innerRule(rule, '*, *::before, *::after');

    expect(decl(all, 'transition')).toContain('none');
    expect(decl(all, 'animation')).toContain('none');
    expect(CSS).toContain('!important');
  });
});

describe('the card', () => {
  it('centres one card on a dotted canvas', () => {
    const body = styleRule("body[data-page='block']");
    const card = exactRule("[data-role='card']");

    expect(decl(body, 'background-image')).toContain('radial-gradient');
    expect(decl(body, 'background-size')).toBe('24px 24px');
    expect(decl(body, 'display')).toBe('flex');
    expect(decl(card, 'border-radius')).toBe('var(--radius)');
    expect(decl(card, 'background')).toBe('var(--surface)');
    expect(decl(card, 'box-shadow')).toBe('var(--shadow-card)');
    expect(decl(card, 'max-width')).toBe('664px');
    expect(token('--radius')).toBe('16px');
  });

  it('frames the options page at 640 pixels with the same card', () => {
    const card = exactRule("body[data-page='options'] [data-role='card']");

    expect(decl(card, 'max-width')).toBe('640px');
    expect(
      decl(exactRule("body[data-page='options'] [data-role='options-heading']"), 'font-size'),
    ).toBe('23px');
  });

  it('gives the card a header strip and a footer bar', () => {
    const header = exactRule("[data-role='header']");
    const actions = exactRule("[data-role='actions']");

    expect(decl(header, 'padding')).toBe('14px 28px');
    expect(decl(header, 'border-bottom')).toContain('var(--line-soft)');
    expect(decl(actions, 'border-top')).toContain('var(--line)');
    expect(decl(actions, 'background')).toBe('var(--sunken)');
    expect(decl(actions, 'border-radius')).toContain('var(--radius) var(--radius)');
  });

  it('draws the mark in a small rounded tile', () => {
    const mark = exactRule("[data-role='mark']");

    expect(decl(mark, 'width')).toBe('24px');
    expect(decl(mark, 'height')).toBe('24px');
    expect(decl(mark, 'border-radius')).toBe('6px');
    expect(decl(mark, 'background')).toBe('var(--mark)');
    expect(decl(exactRule("[data-role='mark'] img"), 'width')).toBe('16px');
    expect(decl(exactRule("[data-role='mark'] img"), 'filter')).toBe('');
    expect(decl(exactRule("[data-role='wordmark']"), 'font-size')).toBe('13.5px');
  });

  it('names the wall count in the header with one amber dot', () => {
    expect(decl(exactRule("[data-role='wall-status']"), 'display')).toBe('inline-flex');
    expect(decl(exactRule("[data-role='header-sep']"), 'height')).toBe('14px');
    expect(decl(exactRule("[data-role='wall-status-dot']"), 'width')).toBe('6px');
    expect(decl(exactRule("[data-role='wall-status-dot']"), 'background')).toBe('var(--amber-dot)');
    expect(decl(exactRule("[data-role='wall-status-text']"), 'font-size')).toBe('12px');
  });
});

describe('the type scale', () => {
  it('sets the block page headline above the body that follows it', () => {
    expect(decl(exactRule("[data-role='headline']"), 'font-size')).toBe('23px');
    expect(decl(exactRule("[data-role='lede']"), 'font-size')).toBe('14px');
    expect(
      decl(innerRule(mediaRule('(max-width: 520px)'), "[data-role='headline']"), 'font-size'),
    ).toBe('21px');
  });

  it('sets the content area on the card padding', () => {
    expect(decl(styleRule('main'), 'padding')).toBe('24px 28px');
    expect(decl(exactRule("[data-role='list-head']"), 'margin')).toContain('28px');
    expect(decl(innerRule(mediaRule('(max-width: 520px)'), 'main'), 'padding')).toBe('20px');
  });

  it('sets the list as a small label over compact rows', () => {
    const heading = exactRule("[data-role='alternatives-heading']");

    expect(decl(heading, 'font-size')).toBe('12.5px');
    expect(decl(heading, 'text-transform')).toBe('uppercase');
    expect(decl(exactRule("[data-role='result-title']"), 'font-size')).toBe('14px');
    expect(decl(exactRule("[data-role='result-description']"), 'font-size')).toBe('13px');
    expect(decl(exactRule("[data-role='result-meta']"), 'font-size')).toBe('11.5px');
    expect(decl(exactRule("[data-role='result-meta']"), 'display')).toBe('flex');
    expect(decl(exactRule("[data-role='result-meta']"), 'align-items')).toBe('center');
    expect(decl(exactRule("[data-role='result-domain']"), 'font-family')).toBe('var(--mono)');
  });

  it('names the stopped page in mono with its host in ink and its path in grey', () => {
    expect(decl(exactRule("[data-role='source-address']"), 'font-family')).toBe('var(--mono)');
    expect(decl(exactRule("[data-role='source-address']"), 'font-size')).toBe('12.5px');
    expect(decl(exactRule("[data-role='source-domain']"), 'font-weight')).toBe('600');
    expect(decl(exactRule("[data-role='source-domain']"), 'color')).toBe('var(--ink)');
    expect(decl(exactRule("[data-role='source-path']"), 'color')).toBe('var(--faint)');
    expect(decl(exactRule("[data-role='source-title']"), 'font-size')).toBe('13px');
    expect(decl(exactRule("[data-role='source-title']"), 'color')).toBe('var(--ink)');
    expect(decl(exactRule("[data-role='source-description']"), 'color')).toBe('var(--body)');
    expect(decl(exactRule("[data-role='source']"), 'align-items')).toBe('start');
    expect(decl(exactRule("[data-role='source-tile']"), 'width')).toBe('36px');
    expect(decl(exactRule("[data-role='source-tile']"), 'height')).toBe('36px');
  });

  it('puts a quiet copy control and the icon beside the address', () => {
    expect(decl(exactRule("[data-role='source-line']"), 'display')).toBe('flex');
    expect(decl(exactRule("[data-role='copy']"), 'width')).toBe('24px');
    expect(decl(exactRule("[data-role='copy']"), 'color')).toBe('var(--faint)');
    expect(decl(exactRule("[data-role='copy']:hover"), 'background')).toBe('var(--line-soft)');
    expect(decl(exactRule("[data-role='copy'][data-copied='true']"), 'color')).toBe(
      'var(--accent-ink)',
    );
    expect(decl(exactRule("[data-role='source-tile'][data-icon='true']"), 'background')).toBe(
      'var(--surface)',
    );
  });
});

describe('the block page', () => {
  it('draws a wall as a tinted pill of the category', () => {
    const pill = exactRule("[data-role='wall']");

    expect(decl(pill, 'border-radius')).toBe('999px');
    expect(decl(pill, 'font-size')).toBe('12px');
    expect(decl(pill, 'background')).toBe('var(--wall-surface, var(--surface))');
    expect(decl(exactRule("[data-role='wall-icon']"), 'width')).toBe('12px');

    for (const category of [
      'adblock',
      'paywall',
      'registration',
      'consent',
      'region',
      'vpn',
      'age',
    ]) {
      const rule = exactRule(`[data-role='wall'][data-category='${category}']`);

      expect(decl(rule, '--wall-ink'), category).toBe(`var(--wall-${category}-ink)`);
      expect(decl(rule, '--wall-surface'), category).toBe(`var(--wall-${category}-surface)`);
    }
  });

  it('draws the count as one small pill beside the label', () => {
    const count = exactRule("[data-role='count']");

    expect(decl(count, 'background')).toBe('var(--line-soft)');
    expect(decl(count, 'border-radius')).toBe('999px');
    expect(decl(count, 'font-family')).toBe('var(--mono)');
    expect(decl(count, 'font-size')).toBe('11px');
  });

  it('closes the rows with the search card', () => {
    const search = exactRule("[data-role='search']");

    expect(decl(search, 'grid-template-columns')).toBe('36px minmax(0, 1fr) auto');
    expect(decl(search, 'border-radius')).toBe('var(--radius-inner)');
    expect(decl(exactRule("[data-role='search-icon']"), 'width')).toBe('36px');
    expect(decl(exactRule("[data-role='search-arrow']"), 'width')).toBe('28px');
    expect(decl(exactRule("[data-role='search-action']"), 'display')).toBe('flex');
    expect(decl(exactRule("[data-role='search'][data-selected='true']"), 'border-color')).toBe(
      'var(--accent)',
    );
    expect(decl(styleRule("[data-role='search']:hover [data-role='search-key']"), 'color')).toBe(
      'var(--accent-ink)',
    );
  });

  it('keeps the match label on the row line and the story on the keyboard line', () => {
    expect(decl(exactRule("[data-role='result-match']"), 'display')).toBe('inline-flex');
    expect(decl(exactRule("[data-role='topic']"), 'text-overflow')).toBe('ellipsis');
    expect(decl(exactRule("[data-role='keyboard-hint']"), 'justify-content')).toBe('space-between');
    expect(decl(exactRule("body[data-page='popup'] [data-role='result-match']"), 'display')).toBe(
      'none',
    );
  });

  it('marks a route without walls in the clear ink', () => {
    const badge = exactRule("[data-role='result-walls']");

    expect(decl(badge, 'display')).toBe('inline-flex');
    expect(decl(badge, 'align-items')).toBe('center');
    expect(decl(badge, 'color')).toBe('var(--clear-ink)');
    expect(decl(exactRule("[data-role='result-walls'] svg"), 'width')).toBe('12px');
  });

  it('gives the open box the ring of the last stop', () => {
    const box = exactRule("[data-role='fallback'][data-selected='true']");

    expect(decl(box, 'border-color')).toBe('var(--accent)');
    expect(decl(box, 'box-shadow')).toBe('0 0 0 2px var(--accent-ring)');
  });

  it('numbers the engines and rings the chosen one', () => {
    const key = styleRule("[data-role='engine-key']");
    const hover = styleRule("[data-role='engines'] a:hover [data-role='engine-key']");
    const chosen = exactRule("[data-role='engines'] a[data-selected='true']");

    // The engine number is the same cap as the number of a result row.
    expect(decl(key, 'min-width')).toBe('20px');
    expect(decl(key, 'height')).toBe('20px');
    expect(decl(key, 'font-family')).toBe('var(--mono)');
    expect(decl(key, 'font-size')).toBe('10.5px');
    expect(decl(hover, 'border-color')).toBe('var(--accent-line)');
    expect(decl(hover, 'color')).toBe('var(--accent-ink)');
    expect(decl(chosen, 'border-color')).toBe('var(--accent)');
    expect(decl(chosen, 'box-shadow')).toBe('0 0 0 2px var(--accent-ring)');
  });

  it('puts the number and the arrow at the end of the row', () => {
    const action = exactRule("[data-role='result-action']");
    const key = styleRule("[data-role='result-key']");
    const arrow = exactRule("[data-role='result-arrow']");

    expect(decl(action, 'grid-row')).toBe('1 / span 3');
    expect(decl(action, 'align-self')).toBe('center');
    expect(decl(key, 'min-width')).toBe('20px');
    expect(decl(key, 'border-radius')).toBe('4px');
    expect(decl(key, 'font-family')).toBe('var(--mono)');
    expect(decl(arrow, 'width')).toBe('28px');
    expect(decl(arrow, 'border-radius')).toBe('8px');
    expect(decl(exactRule("[data-role='result-arrow'] svg"), 'width')).toBe('16px');
    expect(
      decl(exactRule("[data-role='list'] > li > a:hover [data-role='result-arrow']"), 'background'),
    ).toBe('var(--accent)');

    // The number takes the accent with the row, the way the reference does.
    expect(
      decl(styleRule("[data-role='list'] > li > a:hover [data-role='result-key']"), 'border-color'),
    ).toBe('var(--accent-line)');
    expect(
      decl(styleRule("[data-role='list'] > li > a:hover [data-role='result-key']"), 'color'),
    ).toBe('var(--accent-ink)');
  });

  it('draws the keyboard line under the rows with a cap per key', () => {
    expect(decl(exactRule("[data-role='keyboard-hint']"), 'font-size')).toBe('11px');

    const key = styleRule("[data-role='keyboard-hint'] kbd");

    expect(decl(key, 'border')).toContain('1px solid');
    expect(decl(key, 'background')).toBe('var(--sunken)');
    expect(decl(key, 'border-radius')).toBe('4px');
    expect(decl(key, 'font-family')).toBe('var(--mono)');

    // The engine hint is the same line under its box, so it takes the same caps.
    expect(decl(styleRule("[data-role='fallback-note']"), 'font-size')).toBe('11px');
    expect(decl(styleRule("[data-role='fallback-note']"), 'color')).toBe('var(--faint)');
    expect(decl(styleRule("[data-role='fallback-note'] kbd"), 'border')).toContain('1px solid');
    const media = mediaRule('(max-width: 520px)');

    expect(decl(innerStyleRule(media, "[data-role='result-action']"), 'display')).toBe('none');
    expect(decl(innerStyleRule(media, "[data-role='keyboard-hint']"), 'display')).toBe('none');
    expect(decl(innerStyleRule(media, "[data-role='fallback-note']"), 'display')).toBe('none');
    expect(decl(innerStyleRule(media, "[data-role='search-action']"), 'display')).toBe('none');
  });

  it('opens a row from every part of it and lifts it on hover', () => {
    const link = exactRule("[data-role='list'] > li > a");
    const hover = styleRule("[data-role='list'] > li > a:hover");

    expect(decl(link, 'border-radius')).toBe('var(--radius-inner)');
    expect(decl(link, 'padding')).toBe('14px');
    expect(decl(link, 'grid-template-columns')).toContain('36px');
    expect(decl(hover, 'background')).toBe('var(--hover)');
    expect(decl(exactRule("[data-role='list'] > li > a > [data-role='tile']"), 'width')).toBe(
      '36px',
    );
  });

  it('keeps one column on a phone', () => {
    const media = mediaRule('(max-width: 520px)');

    expect(decl(innerRule(media, "[data-role='list'] > li > a"), 'grid-template-columns')).toBe(
      '36px minmax(0, 1fr)',
    );
    expect(decl(innerRule(media, "[data-role='result-description']"), 'display')).toBe('none');
    expect(decl(innerRule(media, "[data-role='source']"), 'grid-template-columns')).toBe(
      'auto minmax(0, 1fr)',
    );
    expect(decl(innerRule(media, "[data-role='actions']"), 'flex-direction')).toBe('column');
  });

  it('draws a failure as a notice and a slow search as an accent note', () => {
    const notice = exactRule("[data-role='alternatives'][data-state='error'] [data-role='status']");
    const slow = exactRule("[data-role='slow-note']");

    expect(CSS).toContain('border: 1px solid var(--notice-line)');
    expect(decl(notice, 'background')).toBe('var(--notice-surface)');
    expect(CSS).toContain('border: 1px solid var(--accent-line)');
    expect(decl(slow, 'background')).toBe('var(--accent-soft)');
  });

  it('gives the footer controls the quiet hover of the example', () => {
    expect(decl(styleRule("[data-role='open-site']:hover"), 'background')).toBe('var(--line-soft)');
    expect(decl(styleRule("[data-role='open-menu']:hover"), 'background')).toBe('var(--line-soft)');
    expect(decl(exactRule("[data-role='back']:hover"), 'border-color')).toBe('var(--control-line)');
  });

  it('keeps the way back and the way out in the card footer', () => {
    expect(decl(exactRule("[data-role='source']"), 'grid-template-columns')).toBe(
      'auto minmax(0, 1fr)',
    );
    expect(decl(exactRule("[data-role='actions-start']"), 'display')).toBe('flex');
    expect(decl(exactRule("[data-role='actions-end']"), 'display')).toBe('flex');
    expect(decl(exactRule("[data-role='actions-end']"), 'margin-left')).toBe('auto');
    expect(decl(exactRule("[data-role='back']"), 'border')).toContain('1px solid');
    expect(decl(styleRule("[data-role='open-site']"), 'background')).toBe('transparent');
    expect(decl(exactRule("[data-role='note']"), 'max-width')).toBe('664px');
  });

  it('centres the footnote and the report under the card', () => {
    const note = exactRule("[data-role='note']");

    expect(decl(note, 'flex-direction')).toBe('column');
    expect(decl(note, 'align-items')).toBe('center');
    expect(decl(note, 'text-align')).toBe('center');
    expect(decl(exactRule("[data-role='report']"), 'margin-left')).toBe('');
  });
});

describe('the theme control', () => {
  it('shows the theme that a press moves to', () => {
    expect(decl(exactRule("[data-role='theme']"), 'width')).toBe('32px');
    expect(decl(exactRule("[data-role='theme-icon'] [data-icon='sun']"), 'display')).toBe('none');
    expect(
      decl(exactRule("[data-theme='dark'] [data-role='theme-icon'] [data-icon='moon']"), 'display'),
    ).toBe('none');
    expect(
      decl(exactRule("[data-theme='dark'] [data-role='theme-icon'] [data-icon='sun']"), 'display'),
    ).toBe('block');
  });

  it('offers three segments in the settings page', () => {
    const group = exactRule("body[data-page='options'] [data-role='theme-choices']");
    const pressed = exactRule(
      "body[data-page='options'] [data-role='theme-choices'] button[aria-pressed='true']",
    );

    expect(decl(group, 'display')).toBe('inline-flex');
    expect(decl(pressed, 'background')).toBe('var(--surface)');
    expect(decl(pressed, 'box-shadow')).toBe('var(--shadow-control)');
  });
});

describe('the popup', () => {
  it('keeps the window at 340 pixels and its rows at the popup density', () => {
    expect(decl(exactRule("body[data-page='popup']"), 'width')).toBe('340px');
    expect(decl(exactRule("body[data-page='popup'] [data-role='header']"), 'height')).toBe('52px');
    expect(decl(styleRule("body[data-page='popup'] [data-role='list'] > li > a"), 'padding')).toBe(
      '8px 10px',
    );
    expect(decl(styleRule("body[data-page='popup'] [data-role='search']"), 'padding')).toBe(
      '8px 10px',
    );
  });

  it('draws the report as a row of the search card family', () => {
    const report = exactRule("body[data-page='popup'] [data-role='site-report']");

    expect(decl(report, 'grid-template-columns')).toBe('24px minmax(0, 1fr) auto');
    expect(decl(report, 'column-gap')).toBe('10px');
    expect(decl(report, 'text-decoration')).toBe('none');
    expect(decl(exactRule("body[data-page='popup'] [data-role='wall']"), 'font-size')).toBe('11px');
    expect(decl(exactRule("body[data-page='popup'] [data-role='enabled']"), 'width')).toBe('36px');
  });

  it('keeps the two footer links and the two controls on one row', () => {
    const footer = exactRule("body[data-page='popup'] footer");
    const end = exactRule("body[data-page='popup'] footer [data-role='footer-end']");

    // A block footer puts the theme and the gear on a second line, which is the
    // one layout the wireframe does not carry.
    expect(decl(footer, 'display')).toBe('flex');
    expect(decl(footer, 'flex-wrap')).toBe('wrap');
    expect(decl(end, 'display')).toBe('flex');
    expect(decl(end, 'margin-left')).toBe('auto');
  });
});

describe('the settings page', () => {
  it('draws a checkbox the sheet controls', () => {
    const box = styleRule("body[data-page='options'] [data-role='wall-check']");

    expect(decl(box, 'width')).toBe('16px');
    expect(decl(box, 'height')).toBe('16px');
    expect(decl(box, 'border-radius')).toBe('4px');
    expect(
      decl(styleRule("body[data-page='options'] [data-role='auto-open']:checked"), 'background'),
    ).toBe('var(--accent)');
  });

  it('marks a cell that the list cannot hold with a dashed square', () => {
    const empty = exactRule(
      "body[data-page='options'] [data-role='wall-cell'][data-empty='true']::after",
    );

    expect(decl(empty, 'border')).toContain('dashed');
    expect(decl(empty, 'width')).toBe('16px');
  });

  it('sets the section labels above the page title', () => {
    const label = styleRule("body[data-page='options'] [data-role='walls-heading']");

    expect(decl(label, 'font-size')).toBe('12px');
    expect(decl(label, 'text-transform')).toBe('uppercase');
    expect(decl(label, 'letter-spacing')).toBe('0.06em');
  });
});

describe('the result tiles', () => {
  it('keeps a white letter readable on every colour', () => {
    for (const colour of TILE_COLORS) {
      expect(contrast('#ffffff', colour), colour).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives one domain one colour', () => {
    expect(tileColor('arstechnica.com')).toBe(tileColor('arstechnica.com'));
  });
});
