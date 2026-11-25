import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';

import { startDummyServer } from '../dev/dummy-server';

export const ROOT = resolve(import.meta.dirname, '..');
export const ASSETS = join(ROOT, 'store', 'assets');
const DIST = join(ROOT, 'packages', 'extension', 'dist');
const LOGO = join(ROOT, 'packages', 'extension', 'src', 'logo-mark.png');
const TILE_ICON = join(ROOT, 'packages', 'extension', 'src', 'icon-128.png');

/** The development build names this origin, so the server takes the same port. */
const PORT = 8787;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ITEM_ID = 'jcncblagncbpbamfnekhdkomffdpehpk';
const BLOCK_URL = `${ORIGIN}/walled/nvidia-custom-silicon`;
const BLOCK_PAGE = new RegExp(`^chrome-extension://${ITEM_ID}/block\\.html\\?u=`);
const ABORTED = /net::ERR_ABORTED|NS_ERROR_ABORT/;

export const SHOT = { width: 1280, height: 800 } as const;
export const TILE = { width: 440, height: 280 } as const;
export const MARQUEE = { width: 1400, height: 560 } as const;
export const POPUP_WIDTH = 340;
export const STORE_ICON = { size: 128, art: 96 } as const;

const FAMILY = '-apple-system, "Segoe UI", system-ui, sans-serif';

type Promo = {
  width: number;
  height: number;
  mark: number;
  word: number;
  gap: number;
};

const SMALL: Promo = { ...TILE, mark: 84, word: 42, gap: 18 };
const MARQUEE_PROMO: Promo = { ...MARQUEE, mark: 168, word: 96, gap: 36 };

/** One promo image: the mark and the wordmark on the accent colour. */
function promoPage(logo: string, promo: Promo): string {
  return `<!doctype html>
<style>
  html, body { margin: 0; background: #0B6B57; }
  .promo { width: ${promo.width}px; height: ${promo.height}px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: ${promo.gap}px; }
  .mark { width: ${promo.mark}px; height: ${promo.mark}px; display: block; filter: brightness(0) invert(1); }
  .word { font: 650 ${promo.word}px/1.15 ${FAMILY}; letter-spacing: -0.01em; color: #FBFAF8; }
</style>
<div class="promo">
  <img class="mark" src="${logo}" alt="">
  <div class="word">Detour</div>
</div>`;
}

/** The small promo tile, 440 by 280 px. */
export function tilePage(logo: string): string {
  return promoPage(logo, SMALL);
}

/**
 * The store icon: the tile at 96 px in a 128 px canvas. The dashboard asks for
 * 16 px of transparent margin on each side, so its own frame meets no edge.
 */
export function storeIconPage(icon: string): string {
  return `<!doctype html>
<style>
  html, body { margin: 0; background: transparent; }
  .icon { width: ${STORE_ICON.size}px; height: ${STORE_ICON.size}px; display: flex;
    align-items: center; justify-content: center; }
  .art { width: ${STORE_ICON.art}px; height: ${STORE_ICON.art}px; display: block; }
</style>
<div class="icon"><img class="art" src="${icon}" alt=""></div>`;
}

/** The marquee promo tile, 1400 by 560 px. */
export function marqueePage(logo: string): string {
  return promoPage(logo, MARQUEE_PROMO);
}

/** A page shot placed on the paper colour, so a 340 px popup fills 1280 by 800. */
export function stagePage(image: string): string {
  return `<!doctype html>
<style>
  html, body { margin: 0; background: #FBFAF8; }
  .stage { width: ${SHOT.width}px; height: ${SHOT.height}px; display: flex;
    align-items: center; justify-content: center; }
  .shot { display: block; border-radius: 12px; box-shadow: 0 24px 60px rgba(22, 22, 26, 0.14); }
</style>
<div class="stage"><img class="shot" src="${image}" alt=""></div>`;
}

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

/**
 * A page that changed its viewport or its content needs its fonts and two
 * frames before a shot. Without the wait, Chromium can paint the old surface
 * over the new one and the image repeats at an offset.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function launch(
  profile: string,
  viewport: { width: number; height: number },
  deviceScaleFactor: number,
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    viewport,
    deviceScaleFactor,
    reducedMotion: 'reduce',
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      `--force-device-scale-factor=${deviceScaleFactor}`,
    ],
  });
}

async function ready(context: BrowserContext): Promise<void> {
  await (context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker'));
}

/**
 * The images of the store listing, drawn from the real pages and the local
 * fixtures. A page redesign is one command away from new images, so the listing
 * cannot show a page that no longer exists.
 */
async function main(): Promise<void> {
  const server = await startDummyServer({ port: PORT }).catch((error: unknown) => {
    throw new Error(
      `the dummy server did not start on ${ORIGIN}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  const profiles = [
    await mkdtemp(join(tmpdir(), 'detour-store-')),
    await mkdtemp(join(tmpdir(), 'detour-store-')),
  ];
  const logo = dataUrl(await readFile(LOGO));
  const tilePng = dataUrl(await readFile(TILE_ICON));

  await mkdir(ASSETS, { recursive: true });

  const page = await launch(profiles[0]!, SHOT, 1);
  // The popup is 340 px wide, so the browser draws it twice as large as a page
  // and the shot stays sharp in a store listing.
  const crisp = await launch(profiles[1]!, { width: POPUP_WIDTH, height: 200 }, 2);

  try {
    await Promise.all([ready(page), ready(crisp)]);

    const blocked = await page.newPage();

    await blocked.goto(BLOCK_URL).catch((error: unknown) => {
      if (!(error instanceof Error) || !ABORTED.test(error.message)) {
        throw error;
      }
    });
    await blocked.waitForURL(BLOCK_PAGE, { timeout: 15_000 });
    await blocked.locator('[data-role="alternatives"][data-state="results"]').waitFor({
      timeout: 20_000,
    });
    await blocked
      .waitForFunction(
        () => [...document.images].every((image) => image.complete && image.naturalWidth > 0),
        undefined,
        { timeout: 10_000 },
      )
      .catch(() => undefined);

    await writeFile(
      join(ASSETS, 'screenshot-block.png'),
      await blocked.screenshot({ fullPage: false }),
    );
    await blocked.close();

    const settings = await page.newPage();

    await settings.setViewportSize(SHOT);
    await settings.goto(`chrome-extension://${ITEM_ID}/options.html`);
    await settings.locator('[data-role="clear-cache"]').waitFor();
    await writeFile(
      join(ASSETS, 'screenshot-options.png'),
      await settings.screenshot({ fullPage: false }),
    );
    await settings.close();

    const popup = await crisp.newPage();

    await popup.setViewportSize({ width: POPUP_WIDTH, height: 620 });
    await popup.goto(`chrome-extension://${ITEM_ID}/popup.html`);
    await popup.locator('[data-role="how-it-works"]').waitFor();

    // The browser sizes a popup to its content, so the shot follows the last
    // child and not the height of the test window.
    const height = await popup.evaluate(() => {
      const edges = [...document.body.children].map(
        (child) => child.getBoundingClientRect().bottom,
      );

      return Math.ceil(Math.max(...edges));
    });

    await popup.setViewportSize({ width: POPUP_WIDTH, height });
    await settle(popup);

    const popupShot = dataUrl(await popup.screenshot({ fullPage: false }));

    await popup.close();

    const stage = await page.newPage();

    await stage.setViewportSize(SHOT);
    await stage.setContent(stagePage(popupShot));
    await settle(stage);
    await writeFile(
      join(ASSETS, 'screenshot-popup.png'),
      await stage.screenshot({ fullPage: false }),
    );
    await stage.close();

    const tile = await page.newPage();

    await tile.setViewportSize(TILE);
    await tile.setContent(tilePage(logo));
    await settle(tile);
    await writeFile(join(ASSETS, 'tile-440x280.png'), await tile.screenshot({ fullPage: false }));
    await tile.close();

    const marquee = await page.newPage();

    await marquee.setViewportSize(MARQUEE);
    await marquee.setContent(marqueePage(logo));
    await settle(marquee);
    await writeFile(
      join(ASSETS, 'marquee-1400x560.png'),
      await marquee.screenshot({ fullPage: false }),
    );
    await marquee.close();

    const storeIcon = await page.newPage();

    await storeIcon.setViewportSize({ width: STORE_ICON.size, height: STORE_ICON.size });
    await storeIcon.setContent(storeIconPage(tilePng));
    await settle(storeIcon);

    // The margin stays transparent, so the dashboard does not add a frame of
    // its own around the tile.
    await writeFile(
      join(ASSETS, 'icon-128.png'),
      await storeIcon.screenshot({ fullPage: false, omitBackground: true }),
    );
    await storeIcon.close();

    process.stdout.write(
      `${ASSETS}\nicon-128.png, screenshot-block.png, screenshot-options.png, screenshot-popup.png, tile-440x280.png, marquee-1400x560.png\n`,
    );
  } finally {
    await Promise.all([page.close(), crisp.close()]);

    for (const profile of profiles) {
      await rm(profile, { recursive: true, force: true });
    }

    await server.close();
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
