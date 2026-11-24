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
    storage: {
      session: {
        get(key: 'allowTabs'): Promise<{ allowTabs?: Allowance[] }>;
        get(keys: string[]): Promise<Record<string, Allowance[] | undefined>>;
      };
      local: {
        get(keys: string[]): Promise<Record<string, Allowance[] | undefined>>;
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
