import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { BrowserContext, Page, Worker } from '@playwright/test';
import { chromium, expect, test as base } from '@playwright/test';

export { expect };

/** The id that the fixed manifest key gives the unpacked build. */
export const extensionId = 'jcncblagncbpbamfnekhdkomffdpehpk';

const DIST = resolve(import.meta.dirname, '..', 'packages', 'extension', 'dist');

/** The dummy server origin, moved by `E2E_PORT` together with the build. */
export const SITE_ORIGIN =
  process.env.E2E_ORIGIN ?? `http://127.0.0.1:${process.env.E2E_PORT ?? '8787'}`;

/** The unlisted fixture page that the readiness navigation loads. */
const READY_URL = `${SITE_ORIGIN}/open/article`;
const READY_TIMEOUT_MS = 10_000;

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
    storage: {
      session: {
        get(key: 'allowTabs'): Promise<{ allowTabs?: Allowance[] }>;
      };
    };
  };
}

/**
 * The first guarded navigation after a browser start can outrun the worker's
 * wake-up by more than `GUARD_TIMEOUT_MS`, and that first navigation is the one
 * that fails open. This throwaway page on the unlisted fixture URL takes that
 * navigation: the content script runs, the message reaches the worker, and the
 * worker reads the list, so every case meets a worker that has already answered.
 * The page is unlisted, so it writes no allowance and no cached answer, and it
 * asks no provider.
 */
async function warmGuard(context: BrowserContext): Promise<void> {
  const page = await context.newPage();

  try {
    await page.goto(READY_URL, { timeout: READY_TIMEOUT_MS });
    await page.locator('h1').waitFor({ timeout: READY_TIMEOUT_MS });
  } finally {
    await page.close();
  }
}

type Fixtures = {
  context: BrowserContext;
  worker: Worker;
};

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

    try {
      const context = await chromium.launchPersistentContext(profile, {
        headless: true,
        channel: 'chromium',
        viewport: { width: 1280, height: 900 },
        args: [
          `--disable-extensions-except=${DIST}`,
          `--load-extension=${DIST}`,
          '--host-resolver-rules=MAP forbes.test 127.0.0.1',
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
