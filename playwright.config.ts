import { defineConfig } from '@playwright/test';

/**
 * The run drives the built extension and the local dummy server. Every browser
 * option lives in the context fixture, because the extension needs a persistent
 * profile with the unpacked build.
 *
 * The server is not reused: the run owns it, so a `pnpm dev` stack on the same
 * port cannot answer with its own state. `E2E_PORT` moves the run to a free
 * port; the extension build must then name the same origin.
 */
const PORT = process.env.E2E_PORT ?? '8787';
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  // The run starts a server and a browser, so a case gets more time than one
  // navigation needs. A missing block page still fails at its own wait.
  timeout: 60_000,
  reporter: 'list',
  webServer: {
    command: `pnpm exec tsx dev/dummy-server.ts --port ${PORT}`,
    url: `${ORIGIN}/open/article`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
