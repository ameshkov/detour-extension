import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SitesJson } from '@detour/shared';
import { findListedSite } from '@detour/shared';
import type { BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';

import { startDummyServer } from '../dev/dummy-server';
import { RELEASE_API_BASE } from './listing';

export const ROOT = resolve(import.meta.dirname, '..');
export const ASSETS = join(ROOT, 'store', 'assets');
const DIST = join(ROOT, 'packages', 'extension', 'dist');
const LOGO = join(ROOT, 'packages', 'extension', 'src', 'logo-mark.png');
const TILE_ICON = join(ROOT, 'packages', 'extension', 'src', 'icon-128.png');
const FONT = join(ROOT, 'packages', 'extension', 'src', 'inter.woff2');

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

const FAMILY = "'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif";

type Promo = {
  width: number;
  height: number;
  mark: number;
  word: number;
  gap: number;
};

const SMALL: Promo = { ...TILE, mark: 84, word: 42, gap: 18 };
const MARQUEE_PROMO: Promo = { ...MARQUEE, mark: 168, word: 96, gap: 36 };

/** One promo image: the mark tile and the wordmark on the accent colour. */
function promoPage(logo: string, promo: Promo, font = ''): string {
  const face =
    font === ''
      ? ''
      : `@font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900;
          font-display: swap; src: url(${font}) format('woff2'); }`;
  const tile = Math.round(promo.mark / 4);

  return `<!doctype html>
<style>
  ${face}
  html, body { margin: 0; background: #2563EB; }
  .promo { width: ${promo.width}px; height: ${promo.height}px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: ${promo.gap}px; }
  .tile { width: ${promo.mark}px; height: ${promo.mark}px; display: grid; place-items: center;
    border-radius: ${tile}px; background: #0F172A; }
  .mark { width: ${Math.round((promo.mark * 2) / 3)}px; height: ${Math.round((promo.mark * 2) / 3)}px;
    display: block; }
  .word { font: 600 ${promo.word}px/1.15 ${FAMILY}; letter-spacing: -0.025em; color: #FFFFFF; }
</style>
<div class="promo">
  <span class="tile"><img class="mark" src="${logo}" alt=""></span>
  <div class="word">Detour</div>
</div>`;
}

/** The small promo tile, 440 by 280 px. */
export function tilePage(logo: string, font = ''): string {
  return promoPage(logo, SMALL, font);
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
export function marqueePage(logo: string, font = ''): string {
  return promoPage(logo, MARQUEE_PROMO, font);
}

/** A page shot placed on the paper colour, so a 340 px popup fills 1280 by 800. */
export function stagePage(image: string): string {
  return `<!doctype html>
<style>
  html, body { margin: 0; background: #F8FAFC; }
  .stage { width: ${SHOT.width}px; height: ${SHOT.height}px; display: flex;
    align-items: center; justify-content: center; }
  .shot { display: block; max-height: 720px; width: auto; border-radius: 12px;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.14); }
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

/**
 * The address of a real article that the list walls. The run builds the release
 * extension, so the block page asks the production backend for the answers.
 */
export function liveUrl(argv: readonly string[]): string | null {
  const flag = argv.find((arg) => arg.startsWith('--live='));

  if (flag === undefined) {
    return null;
  }

  const value = flag.slice('--live='.length).trim();

  if (!value.startsWith('https://')) {
    throw new Error('--live takes the https address of an article that the list walls');
  }

  return value;
}

/** The dist directory must be the release build, which names the backend. */
async function requireReleaseBuild(): Promise<void> {
  const manifest = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8')) as {
    host_permissions?: string[];
  };

  if (!(manifest.host_permissions ?? []).includes(`${RELEASE_API_BASE}/*`)) {
    throw new Error('this build does not name the release backend; run pnpm store:shot');
  }
}

async function ready(context: BrowserContext): Promise<void> {
  await (context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker'));
}

/** The block page of one guarded address, after the answers arrive. */
async function shootBlocked(context: BrowserContext, url: string): Promise<Buffer> {
  const page = await context.newPage();

  try {
    await page.setViewportSize(SHOT);
    await page.goto(url).catch((error: unknown) => {
      if (!(error instanceof Error) || !ABORTED.test(error.message)) {
        throw error;
      }
    });
    await page.waitForURL(BLOCK_PAGE, { timeout: 20_000 });

    const answers = page.locator('[data-role="alternatives"]');

    try {
      await answers.and(page.locator('[data-state="results"]')).waitFor({ timeout: 30_000 });
    } catch {
      const state = await answers.getAttribute('data-state');

      throw new Error(`the block page ended as "${state ?? 'unknown'}" and not "results"`);
    }
    await page
      .waitForFunction(
        () => [...document.images].every((image) => image.complete && image.naturalWidth > 0),
        undefined,
        { timeout: 15_000 },
      )
      .catch(() => undefined);

    return await page.screenshot({ fullPage: false });
  } finally {
    await page.close();
  }
}

/**
 * The domain that the list names for the article. The guard grants an allowance
 * on the entry's domain, so the popup shot must store the same value.
 */
export async function listedDomain(url: string): Promise<string> {
  const list = JSON.parse(
    await readFile(join(ROOT, 'packages', 'extension', 'src', 'sites.json'), 'utf8'),
  ) as SitesJson;
  const site = findListedSite(list, url);

  if (site === null) {
    throw new Error(`${url} is not in the list, so the popup would name no site`);
  }

  return site.domain;
}

/**
 * The popup over the page in front of the reader. The worker grants the
 * allowance first, so the guard lets the article load; the popup then answers
 * for that tab, and the routes are the ones that the backend returned.
 */
async function shootPopup(context: BrowserContext, url: string, host: string): Promise<Buffer> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const listed = await context.newPage();
  let popup: Page | null = null;

  try {
    await worker.evaluate(async (allowed: string): Promise<void> => {
      const api = globalThis as unknown as {
        chrome: { storage: { local: { set(values: unknown): Promise<void> } } };
      };

      await api.chrome.storage.local.set({
        allowAlways: [{ host: allowed, addedAt: Date.now() }],
      });
    }, host);

    await listed.goto(url, { waitUntil: 'domcontentloaded' });

    const opening = context.waitForEvent('page');

    await worker.evaluate(async (pageUrl: string): Promise<void> => {
      const api = globalThis as unknown as {
        chrome: {
          tabs: { create(props: { url: string; active: boolean }): Promise<unknown> };
        };
      };

      await api.chrome.tabs.create({ url: pageUrl, active: false });
    }, `chrome-extension://${ITEM_ID}/popup.html`);

    popup = await opening;

    // The list head arrives with the state, so the height below is the height
    // of the state and not of the shell.
    await popup.locator('[data-role="list-head"]').waitFor({ timeout: 30_000 });
    await popup.setViewportSize({ width: POPUP_WIDTH, height: 620 });

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

    return await popup.screenshot({ fullPage: false });
  } finally {
    await popup?.close().catch(() => undefined);
    await listed.close();
  }
}

/** The popup image at 1280 by 800, staged on the paper colour. */
async function stagePopup(context: BrowserContext, image: Buffer): Promise<Buffer> {
  const stage = await context.newPage();

  try {
    await stage.setViewportSize(SHOT);
    await stage.setContent(stagePage(dataUrl(image)));
    await settle(stage);

    return await stage.screenshot({ fullPage: false });
  } finally {
    await stage.close();
  }
}

/**
 * The two images of one real article: the block page of the stopped article,
 * and the popup over the same article once the reader has allowed it. Both name
 * the real site, and the routes are the ones that the live backend returned, so
 * the listing shows no fixture text.
 */
async function captureLive(url: string): Promise<void> {
  await requireReleaseBuild();

  const host = await listedDomain(url);
  const blockProfile = await mkdtemp(join(tmpdir(), 'detour-store-'));
  const popupProfile = await mkdtemp(join(tmpdir(), 'detour-store-'));
  const page = await launch(blockProfile, SHOT, 1);
  // The popup is 340 px wide, so the browser draws it twice as large as a page
  // and the shot stays sharp in a store listing.
  const crisp = await launch(popupProfile, { width: POPUP_WIDTH, height: 200 }, 2);

  try {
    await Promise.all([ready(page), ready(crisp)]);
    await mkdir(ASSETS, { recursive: true });

    await writeFile(join(ASSETS, 'screenshot-block.png'), await shootBlocked(page, url));

    const popup = await shootPopup(crisp, url, host);

    await writeFile(join(ASSETS, 'screenshot-popup.png'), await stagePopup(page, popup));

    process.stdout.write(`${ASSETS}\nscreenshot-block.png, screenshot-popup.png\n`);
  } finally {
    await Promise.all([page.close(), crisp.close()]);

    for (const profile of [blockProfile, popupProfile]) {
      await rm(profile, { recursive: true, force: true });
    }
  }
}

/**
 * The images of the store listing, drawn from the real pages and the local
 * fixtures. A page redesign is one command away from new images, so the listing
 * cannot show a page that no longer exists.
 */
async function main(): Promise<void> {
  const live = liveUrl(process.argv.slice(2));

  if (live !== null) {
    await captureLive(live);

    return;
  }

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
  const font = dataUrl(await readFile(FONT));

  await mkdir(ASSETS, { recursive: true });

  const page = await launch(profiles[0]!, SHOT, 1);
  // The popup is 340 px wide, so the browser draws it twice as large as a page
  // and the shot stays sharp in a store listing.
  const crisp = await launch(profiles[1]!, { width: POPUP_WIDTH, height: 200 }, 2);

  try {
    await Promise.all([ready(page), ready(crisp)]);

    await writeFile(join(ASSETS, 'screenshot-block.png'), await shootBlocked(page, BLOCK_URL));

    const settings = await page.newPage();

    await settings.setViewportSize(SHOT);
    await settings.goto(`chrome-extension://${ITEM_ID}/options.html`);
    await settings.locator('[data-role="clear-cache"]').waitFor();
    await writeFile(
      join(ASSETS, 'screenshot-options.png'),
      await settings.screenshot({ fullPage: false }),
    );
    await settings.close();

    // The popup names the page in the active tab, so the fixture page must be
    // the active tab and the popup opens in a background tab of the same
    // window, the way the action opens it over the page. The page loads because
    // the profile grants its host an allowance first, and the shot then shows a
    // listed site with the routes of the local backend.
    const popupShot = await shootPopup(crisp, BLOCK_URL, await listedDomain(BLOCK_URL));

    await writeFile(join(ASSETS, 'screenshot-popup.png'), await stagePopup(page, popupShot));

    const tile = await page.newPage();

    await tile.setViewportSize(TILE);
    await tile.setContent(tilePage(logo, font));
    await settle(tile);
    await writeFile(join(ASSETS, 'tile-440x280.png'), await tile.screenshot({ fullPage: false }));
    await tile.close();

    const marquee = await page.newPage();

    await marquee.setViewportSize(MARQUEE);
    await marquee.setContent(marqueePage(logo, font));
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
