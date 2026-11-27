import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const BRAND_DOC = 'docs/brand.md';
const PAGE_MARK = 'packages/extension/src/logo-mark.png';
const SHEET = 'packages/extension/src/ui.css';
const SITE_SHEET = 'website/styles.css';

const PAGES = [
  'packages/extension/src/block.html',
  'packages/extension/src/options.html',
  'packages/extension/src/popup.html',
];

const MANIFEST = 'packages/extension/manifest.json';

const MANIFESTS = [MANIFEST];

const PALETTE = ['#F8FAFC', '#FFFFFF', '#0F172A', '#64748B', '#E2E8F0', '#2563EB', '#E11D48'];

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

/** One custom property, with the newlines of a wrapped value joined. */
function property(sheet: string, name: string): string {
  const value = new RegExp(`${name}\\s*:\\s*([^;]*);`).exec(sheet)?.[1] ?? '';

  return value.replace(/\s+/g, ' ').trim();
}

/** A font stack as its families, without the quotes of a family with spaces. */
function families(value: string): string[] {
  return value.split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, ''));
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
    expect(brand).toContain('scripts/icons.ts');
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

  it('ships the toolbar icons the manifest names at their size', () => {
    const manifest = JSON.parse(read(MANIFEST)) as { icons?: Record<string, string> };
    const icons = manifest.icons ?? {};

    expect(
      Object.keys(icons)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([16, 32, 48, 128]);

    for (const [size, file] of Object.entries(icons)) {
      const bytes = readFileSync(join(ROOT, 'packages/extension/src', file));

      // A PNG carries the width and the height in its IHDR chunk, first.
      expect({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }, file).toEqual({
        width: Number(size),
        height: Number(size),
      });
    }
  });

  it('keeps the site on the palette, the radius, and the type of the sheet', () => {
    const sheet = read(SHEET);
    const site = read(SITE_SHEET);

    for (const name of [
      '--paper',
      '--surface',
      '--ink',
      '--muted',
      '--line',
      '--accent',
      '--mark',
    ]) {
      expect(property(site, name), name).toBe(property(sheet, name));
    }

    for (const name of ['--accent-deep', '--radius']) {
      expect(property(site, name), name).toBe(property(sheet, name));
    }

    // An empty read would compare two empty stacks and pass, so the sheet's
    // own stack is named first. The product carries one family and no display
    // face, so the site cannot grow a serif of its own.
    expect(families(property(sheet, '--sans'))[0]).toBe('Inter');
    expect(families(property(site, '--sans'))).toEqual(families(property(sheet, '--sans')));
    expect(sheet).not.toContain('--serif');
    expect(site).not.toContain('--display');
  });

  it('keeps the wordmark tracking in step with the sheet', () => {
    expect(wordmarkTrackingOfDoc(brand)).toBe('-0.025em');
    expect(wordmarkTrackingOfSheet(read(SHEET))).toBe('-0.025em');
    expect(wordmarkTrackingOfDoc(brand)).toBe(wordmarkTrackingOfSheet(read(SHEET)));
  });

  it('records the licence of the mark', () => {
    const licence = section(brand, 'License');

    expect(licence).toContain('drawn for the project');
    expect(licence).toContain('no third-party licence');
    expect(licence).toContain('- **Drawn**: 2026-11-27');
    expect(licence).not.toContain('pending');
    expect(licence).not.toContain('cannot be prepared');
  });

  it('links no attribution page', () => {
    for (const path of [BRAND_DOC, ...MANIFESTS, ...PAGES]) {
      expect(read(path)).not.toContain('icons8.com');
    }
  });

  it('paints the mark tile with the mark colour and not a white silhouette', () => {
    const sheet = read(SHEET);
    const tile = /\[data-role='mark'\]\s*\{([^}]*)\}/.exec(sheet)?.[1] ?? '';

    expect(property(sheet, '--mark')).toBe('#0f172a');
    expect(tile).toContain('background: var(--mark)');
    expect(sheet).not.toContain('invert(1)');
    expect(read(SITE_SHEET)).toContain('background: var(--mark)');
  });

  it('draws the mark and the toolbar icons from one geometry', () => {
    const icons = read('scripts/icons.ts');

    expect(icons).toContain('M8 18.5V14.2C8 12.1 9.7 10.4 11.8 10.4H17.8');
    expect(icons).toContain('M15 7.6L18.2 10.4L15 13.2');

    const scripts = (JSON.parse(read('package.json')) as { scripts?: Record<string, string> })
      .scripts as Record<string, string>;

    expect(scripts.icons).toBe('tsx scripts/icons.ts');
  });
});
