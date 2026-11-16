import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const BRAND_DOC = 'docs/brand.md';
const PAGE_MARK = 'packages/extension/src/logo-mark.png';
const SHEET = 'packages/extension/src/ui.css';

const PAGES = [
  'packages/extension/src/block.html',
  'packages/extension/src/options.html',
  'packages/extension/src/popup.html',
];

const MANIFESTS = ['packages/extension/manifest.json'];

const PALETTE = ['#FBFAF8', '#FFFFFF', '#16161A', '#6E6C67', '#E8E4DD', '#0B6B57', '#C0513F'];

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

/** The body of one `##` section, so a value is checked where it belongs. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);

  if (start === -1) {
    return '';
  }

  const end = markdown.indexOf('\n## ', start + heading.length);
  const body = end === -1 ? markdown.slice(start) : markdown.slice(start, end);

  return body;
}

function wordmarkTrackingOfDoc(markdown: string): string | null {
  return /- \*\*Letter spacing\*\*: (\S+)/.exec(section(markdown, 'Wordmark'))?.[1] ?? null;
}

function wordmarkTrackingOfSheet(sheet: string): string | null {
  const rule = /\[data-role='wordmark'\]\s*\{([^}]*)\}/.exec(sheet)?.[1] ?? '';

  return /letter-spacing:\s*(-?[\d.]+em)/.exec(rule)?.[1] ?? null;
}

describe('the brand page', () => {
  const brand = read(BRAND_DOC);

  it('records the mark, the palette, and the sizes', () => {
    expect(brand).toContain('qUNTz1twfA8O');
    expect(brand).toContain(PAGE_MARK);

    for (const value of PALETTE) {
      expect(brand).toContain(`\`${value}\``);
    }

    expect(brand).toContain('PNG at 16, 32, 48, and 128 px');
    expect(brand).toContain('440 by 280 px');
  });

  it('ships the page mark the document names', () => {
    const mark = statSync(join(ROOT, PAGE_MARK));

    expect(mark.size).toBeGreaterThan(0);

    for (const page of PAGES) {
      expect(read(page)).toContain('src="logo-mark.png"');
    }
  });

  it('keeps the wordmark tracking in step with the sheet', () => {
    expect(wordmarkTrackingOfDoc(brand)).toBe('-0.01em');
    expect(wordmarkTrackingOfSheet(read(SHEET))).toBe('-0.01em');
    expect(wordmarkTrackingOfDoc(brand)).toBe(wordmarkTrackingOfSheet(read(SHEET)));
  });

  it('names the purchase date as pending', () => {
    const licence = section(brand, 'License');

    expect(licence).toContain(
      'The mark requires a paid icons8 licence, whose purchase is pending.',
    );
    expect(licence).toContain('The project does not yet hold that licence.');
    expect(licence).not.toContain('The mark is used under');
    expect(licence).not.toContain('The project holds a paid icons8 licence');
    expect(licence).toContain('- **Purchase date**: pending');
    expect(licence).toMatch(/release cannot be prepared until a date replaces that word/i);
  });

  it('links no attribution page', () => {
    for (const path of [BRAND_DOC, ...MANIFESTS, ...PAGES]) {
      expect(read(path)).not.toContain('icons8.com');
    }
  });
});
