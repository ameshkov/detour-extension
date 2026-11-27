import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { chromium } from '@playwright/test';

/**
 * The mark of the product: a route that leaves its first line behind and turns
 * towards an arrow. The first line is amber and the route is blue, on a slate
 * tile. `pnpm icons` draws every image that carries it, so the toolbar, the
 * pages, and the store cannot show three different marks.
 */
const AMBER = '#f59e0b';
const BLUE = '#60a5fa';
const FAINT = '#94a3b8';
const INK = '#0f172a';
const OFF = '#64748b';
const WHITE = '#ffffff';

/** The glyph, in a 24 by 24 box, as the pages draw it. */
const GLYPH = [
  '<path d="M5.5 7.5H10.5" stroke="$LEFT" stroke-width="2.2" stroke-linecap="round" />',
  '<path d="M8 18.5V14.2C8 12.1 9.7 10.4 11.8 10.4H17.8" stroke="$ROUTE" stroke-width="2.2" stroke-linecap="round" />',
  '<path d="M15 7.6L18.2 10.4L15 13.2" stroke="$ROUTE" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />',
];

const SOURCE = resolve(import.meta.dirname, '..', 'packages', 'extension', 'src');

/** The page mark is the glyph alone, and a page paints the tile under it. */
const MARK = 96;

/** A toolbar icon is the whole tile, with the glyph at two thirds of its width. */
const SIZES = [16, 32, 48, 128] as const;

const GLYPH_BOX = 2 / 3;

/** The glyph paths in one pair of colours: the first line, and the route. */
function glyph(left: string, route: string): string {
  return GLYPH.join('\n  ').replaceAll('$LEFT', left).replaceAll('$ROUTE', route);
}

/** The glyph on a transparent canvas. */
export function markSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  ${glyph(AMBER, BLUE)}
</svg>`;
}

/** One rounded tile with the glyph centred on it. */
export function iconSvg(size: number, tile: string, left: string, route: string): string {
  const scale = GLYPH_BOX.toFixed(4);
  const offset = (((1 - GLYPH_BOX) / 2) * 24).toFixed(4);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none">
  <rect width="24" height="24" rx="6" fill="${tile}" />
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    ${glyph(left, route)}
  </g>
</svg>`;
}

/** A page that holds one image at the size of its shot and nothing else. */
function canvas(image: string, size: number): string {
  return `<!doctype html>
<style>
  html, body { margin: 0; background: transparent; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>
${image}`;
}

async function shoot(page: Page, image: string, size: number, path: string): Promise<void> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(canvas(image, size));

  // A document that has just been replaced paints on the second frame, and a
  // shot taken on the first can hold the surface before it.
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );

  await writeFile(path, await page.screenshot({ fullPage: false, omitBackground: true }));
  process.stdout.write(`${path}\n`);
}

/**
 * Every image that carries the mark. The toolbar carries the coloured route on
 * a page that Detour will stop, the faint route on a page that it lets load, and
 * the gray mark while it is off. The page mark is the glyph alone, because the
 * pages paint the tile in the stylesheet.
 */
async function main(): Promise<void> {
  const profile = await mkdtemp(join(tmpdir(), 'detour-icons-'));
  const browser = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    deviceScaleFactor: 1,
  });

  try {
    const page = browser.pages()[0] ?? (await browser.newPage());

    await shoot(page, markSvg(), MARK, join(SOURCE, 'logo-mark.png'));

    for (const size of SIZES) {
      await shoot(page, iconSvg(size, INK, AMBER, BLUE), size, join(SOURCE, `icon-${size}.png`));
      await shoot(
        page,
        iconSvg(size, INK, FAINT, FAINT),
        size,
        join(SOURCE, `icon-plain-${size}.png`),
      );
      await shoot(
        page,
        iconSvg(size, OFF, WHITE, WHITE),
        size,
        join(SOURCE, `icon-off-${size}.png`),
      );
    }
  } finally {
    await browser.close();
    await rm(profile, { recursive: true, force: true });
  }
}

const invoked = process.argv[1];

if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
