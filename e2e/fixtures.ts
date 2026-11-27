import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { Browser, BrowserContext, Page, Worker } from '@playwright/test';
import { chromium, expect, test as base } from '@playwright/test';

export { expect };

/** The id that the fixed manifest key gives the unpacked build. */
export const extensionId = 'jcncblagncbpbamfnekhdkomffdpehpk';

const DIST = resolve(import.meta.dirname, '..', 'packages', 'extension', 'dist');

/** The dummy server origin, moved by `E2E_PORT` together with the build. */
export const SITE_ORIGIN =
  process.env.E2E_ORIGIN ?? `http://127.0.0.1:${process.env.E2E_PORT ?? '8787'}`;

/** The listed fixture page that the readiness navigation stops. */
const READY_LISTED_URL = `${SITE_ORIGIN}/walled/readiness`;

/** The tries that a readiness navigation gets before the case fails. */
const READY_ATTEMPTS = 3;

/**
 * The block page of this extension and no other: the guard hands the tab to a
 * `chrome-extension://` URL, so the origin is pinned to the id that the build
 * gets and a second extension cannot answer for it.
 */
export const BLOCK_PAGE = new RegExp(`^chrome-extension://${extensionId}/block\\.html\\?u=`);

/**
 * The two messages that mean the guard aborted the navigation on purpose. Any
 * other navigation error, such as a refused connection or a bad host name,
 * reaches the caller with its own cause instead of a missing block page.
 */
const ABORTED_NAVIGATION = /net::ERR_ABORTED|NS_ERROR_ABORT/;

/**
 * The messages that mean the browser ended the worker behind a handle. Manifest
 * V3 stops an idle worker, so these are raised for a handle that was live when
 * it was resolved and is detached by the time it is used.
 */
const DETACHED_WORKER =
  /Target page, context or browser has been closed|Worker was closed|Execution context was destroyed/;

type Allowance = { host: string };

declare global {
  // The run reads one extension call. @types/chrome belongs to the extension
  // package, so this declaration keeps the root program on the node types.
  var chrome: {
    action: { openPopup(): Promise<void> };
    tabs: { create(props: { url: string; active: boolean }): Promise<unknown> };
    storage: {
      session: {
        get(key: 'allowTabs'): Promise<{ allowTabs?: Allowance[] }>;
        get(keys: string[]): Promise<Record<string, Allowance[] | undefined>>;
      };
      local: {
        get(keys: string[]): Promise<Record<string, Allowance[] | undefined>>;
        set(values: Record<string, unknown>): Promise<void>;
      };
    };
  };
}

/**
 * The first guarded navigation after a browser start can meet a worker that is
 * still starting, and that navigation is the one that fails open. This page
 * loads a listed URL and waits for the block page, so the guard answered and
 * the worker is warm, and the case that follows meets the same path.
 *
 * A navigation that fails open closes its page and tries again, because the
 * worker is warmer on each try. A guard that never answers fails the case here,
 * before its own navigation, and not as a block page that never opens.
 */
async function warmGuard(context: BrowserContext): Promise<void> {
  let failure: unknown = null;

  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
    const page = await context.newPage();

    try {
      await waitForBlockPage(page, READY_LISTED_URL);

      return;
    } catch (error) {
      failure = error;
    } finally {
      await page.close();
    }
  }

  throw failure;
}

type Fixtures = {
  context: BrowserContext;
  worker: Worker;
};

/**
 * Chrome draws the toolbar popup as a window that Playwright's own context does
 * not list, so the run reads it through the browser's DevTools port: a second
 * client attached over CDP lists the popup as a page that locators and
 * screenshots reach. The port is chosen once per browser, and the client is
 * dropped before the browser closes.
 */
let debugPort: number | null = null;
let popupClient: Browser | null = null;

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();

    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;

      server.close(() => done(port));
    });
  });
}

export const test = base.extend<Fixtures>({
  /**
   * One profile per case, so a tab allowance and the stored answers end with the
   * case. The extension only loads from a persistent profile, and the teardown
   * after `use` is what ends the browser and removes the profile again. Both
   * happen in a `finally`: a case that fails, and a launch that throws, leave no
   * browser and no directory behind.
   */
  context: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'detour-e2e-'));

    debugPort = await freePort();

    try {
      const context = await chromium.launchPersistentContext(profile, {
        headless: true,
        channel: 'chromium',
        viewport: { width: 1280, height: 900 },
        args: [
          `--disable-extensions-except=${DIST}`,
          `--load-extension=${DIST}`,
          '--host-resolver-rules=MAP forbes.test 127.0.0.1',
          `--remote-debugging-port=${debugPort}`,
        ],
      });

      try {
        // The extension answers a message once its service worker is up, so no
        // case navigates before this resolves, and the readiness navigation
        // warms the guard path once before the first case uses it.
        await (context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker'));

        await warmGuard(context);

        await use(context);
      } finally {
        await popupClient?.close().catch(() => undefined);
        popupClient = null;
        await context.close();
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  },

  /**
   * The extension's service worker, for the storage read of a case. The handle
   * is resolved as the case uses it, because an idle worker that the browser
   * stopped is gone from the context by then. The resolve also happens again
   * when a call finds the handle detached, so a slow run retries once instead
   * of evaluating on a target that no longer exists.
   */
  worker: async ({ context }, use) => {
    const live = async (): Promise<Worker> =>
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

    const handle = await live();

    // The fixture keeps the Worker type, so the one call that is overridden is
    // typed through the shape that every evaluate call shares.
    const evaluate = (target: Worker, args: unknown[]): Promise<unknown> =>
      (target.evaluate as (...rest: unknown[]) => Promise<unknown>)(...args);

    const retrying = new Proxy(handle, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property);

        if (property !== 'evaluate') {
          return typeof value === 'function' ? value.bind(target) : value;
        }

        return async (...args: unknown[]): Promise<unknown> => {
          try {
            return await evaluate(target, args);
          } catch (error) {
            if (!(error instanceof Error) || !DETACHED_WORKER.test(error.message)) {
              throw error;
            }

            return await evaluate(await live(), args);
          }
        };
      },
    });

    await use(retrying);
  },
});

/**
 * Opens one URL and waits for the block page that the guard hands the tab to.
 * The guard stops the listed document, so the navigation ends with an abort that
 * is not a failure. The wait is one wait: a page that never reaches the block
 * page fails here at the URL wait, and not at the test deadline.
 */
export async function waitForBlockPage(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url);
  } catch (error) {
    if (!(error instanceof Error) || !ABORTED_NAVIGATION.test(error.message)) {
      throw error;
    }
  }

  await page.waitForURL(BLOCK_PAGE, { timeout: 10_000 });
}

/** The document that the action declares, and the one the popup renders. */
export const POPUP_URL = `chrome-extension://${extensionId}/popup.html`;

/**
 * The popup, opened over the page it answers for.
 *
 * Playwright cannot attach to Chrome's native toolbar popup — the target is a
 * `POPUP` context that no page handle reaches — so the document is opened in a
 * background tab of the page's own window instead. The worker resolves the
 * active tab the same way a reader's press does, so the popup paints the state
 * the reader meets, and the tab keeps its own viewport for the frame checks.
 */
export async function openPopupOver(
  context: BrowserContext,
  worker: Worker,
  page: Page,
): Promise<Page> {
  await page.bringToFront();

  const before = new Set(context.pages());

  await worker.evaluate(async (url: string) => {
    await chrome.tabs.create({ url, active: false });
  }, POPUP_URL);

  let popup: Page | null = null;

  for (let tick = 0; tick < 50 && popup === null; tick += 1) {
    popup = context.pages().find((one) => !before.has(one) && one.url() === POPUP_URL) ?? null;

    if (popup === null) {
      await page.waitForTimeout(100);
    }
  }

  if (popup === null) {
    throw new Error('the popup document never opened');
  }

  await popup.waitForLoadState('domcontentloaded');
  await popup.setViewportSize({ width: 340, height: 620 });

  return popup;
}

/**
 * The toolbar popup itself, opened where the reader opens it: the worker asks
 * Chrome for the action popup, and the DevTools port lists the window it opens.
 * The popup answers for the tab in front of the reader, because it has no tab of
 * its own, so a case over a page sees that page's state.
 */
export async function openNativePopup(worker: Worker, page: Page): Promise<Page> {
  if (debugPort === null) {
    throw new Error('the context fixture did not name a DevTools port');
  }

  await page.bringToFront();
  await worker.evaluate(async () => {
    await chrome.action.openPopup();
  });

  popupClient ??= await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);

  const live = popupClient;

  for (let tick = 0; tick < 50; tick += 1) {
    const popup = live
      .contexts()
      .flatMap((one) => one.pages())
      .find((one) => one.url() === POPUP_URL);

    if (popup !== undefined) {
      await popup.waitForLoadState('domcontentloaded');

      return popup;
    }

    await page.waitForTimeout(100);
  }

  throw new Error('the toolbar popup never opened');
}
