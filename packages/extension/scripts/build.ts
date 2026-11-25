import { existsSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, context } from 'esbuild';
import type { BuildOptions as EsbuildOptions } from 'esbuild';

/**
 * The environment value a build reads for the backend origin. The release build
 * has a default, and a local build points at the dummy server.
 */
export const API_BASE_ENV = 'DETOUR_API_BASE';
export const DEFAULT_DEV_API_BASE = 'http://127.0.0.1:8787';
export const DEFAULT_RELEASE_API_BASE = 'https://detour-api.meshkov.info';

export type BuildResult = {
  outDir: string;
  files: string[];
  apiBase: string;
  stop?: () => Promise<void>;
};

export type BuildOptions = {
  dev: boolean;
  root?: string;
  outDir?: string;
  watch?: boolean;
  apiBase?: string;
};

const ROOT = resolve(import.meta.dirname, '..');

const ENTRIES = [
  { in: 'src/background.ts', out: 'background' },
  { in: 'src/guard-entry.ts', out: 'guard' },
  { in: 'src/block-entry.ts', out: 'block' },
  { in: 'src/popup-entry.ts', out: 'popup' },
  { in: 'src/options-entry.ts', out: 'options' },
];

const COPIED_FILES = [
  'block.html',
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-128.png',
  'logo-mark.png',
  'options.html',
  'popup.html',
  'ui.css',
];

const MANIFEST_FILE = 'manifest.json';

/**
 * One origin and nothing after it: the extension builds every request from this
 * value, so a path, a query, or a fragment would produce another endpoint.
 */
export function parseApiBase(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${API_BASE_ENV}: "${value}" is not a URL`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${API_BASE_ENV}: "${value}" is not an http or https URL`);
  }

  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(`${API_BASE_ENV}: "${value}" must name an origin without a path`);
  }

  if (url.username !== '' || url.password !== '') {
    throw new Error(`${API_BASE_ENV}: "${value}" must not carry credentials`);
  }

  return url.origin;
}

/** The build's backend origin: the environment value, or the build's default. */
export function apiBaseFor(dev: boolean, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[API_BASE_ENV]?.trim();

  if (configured !== undefined && configured !== '') {
    return parseApiBase(configured);
  }

  return dev ? DEFAULT_DEV_API_BASE : DEFAULT_RELEASE_API_BASE;
}

export function definesFor(dev: boolean, apiBase: string): Record<string, string> {
  return {
    API_BASE: JSON.stringify(apiBase),
    DEV: dev ? 'true' : 'false',
  };
}

function esbuildOptions(
  root: string,
  outDir: string,
  dev: boolean,
  apiBase: string,
): EsbuildOptions {
  return {
    entryPoints: ENTRIES.map((entry) => ({ in: join(root, entry.in), out: entry.out })),
    outdir: outDir,
    format: 'iife',
    target: 'chrome120',
    platform: 'browser',
    bundle: true,
    minify: false,
    minifySyntax: true,
    sourcemap: dev ? 'inline' : false,
    define: definesFor(dev, apiBase),
    logLevel: 'warning',
  };
}

function outputFiles(): string[] {
  return [...ENTRIES.map((entry) => `${entry.out}.js`), ...COPIED_FILES, MANIFEST_FILE].sort();
}

/**
 * The manifest that a build writes. The manifest grants access to the backend
 * that this build uses: the broad page permission already covers it, and the
 * explicit entry records the one server the extension is built against.
 *
 * The store grants an item its public key and refuses a package that carries
 * one, so the release build drops the field. A development build keeps it,
 * because the key fixes the id that the tests and the end-to-end run name.
 */
export function builtManifest(text: string, apiBase: string, dev: boolean): string {
  let manifest: unknown;

  try {
    manifest = JSON.parse(text);
  } catch {
    throw new Error(`${MANIFEST_FILE} is not valid JSON`);
  }

  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error(`${MANIFEST_FILE} is not an object`);
  }

  const record = manifest as Record<string, unknown>;
  const existing = record.host_permissions;
  const hosts = Array.isArray(existing)
    ? existing.filter((value): value is string => typeof value === 'string')
    : [];
  const origin = `${new URL(apiBase).origin}/*`;

  record.host_permissions = hosts.includes(origin) ? hosts : [...hosts, origin];

  if (!dev) {
    delete record.key;
  }

  return `${JSON.stringify(record, null, 2)}\n`;
}

/**
 * The copied pages and assets ship beside the bundles, so an unpacked
 * load of the output directory needs nothing from this package.
 */
async function writeCopiedFiles(
  root: string,
  outDir: string,
  manifestPath: string,
  apiBase: string,
  dev: boolean,
): Promise<void> {
  for (const file of COPIED_FILES) {
    await copyFile(join(root, 'src', file), join(outDir, file));
  }

  await writeFile(
    join(outDir, MANIFEST_FILE),
    builtManifest(await readFile(manifestPath, 'utf8'), apiBase, dev),
  );
}

/**
 * esbuild follows the entry graph alone. The pages, the stylesheet, the mark,
 * and the manifest sit outside it, so a second watch writes them again and an
 * edit to one of them is never left unbuilt.
 */
function watchStaticFiles(
  root: string,
  manifestFile: string,
  copy: () => Promise<void>,
): FSWatcher[] {
  const refresh = (): void => {
    copy().catch((error: unknown) => {
      process.stderr.write(`the copied files did not update: ${String(error)}\n`);
    });
  };

  const manifestWatch = watch(root, (_event, filename) => {
    if (filename === manifestFile) {
      refresh();
    }
  });

  return [watch(join(root, 'src'), refresh), manifestWatch];
}

export async function buildExtension(options: BuildOptions): Promise<BuildResult> {
  const root = options.root ?? ROOT;
  const outDir = options.outDir ?? join(root, 'dist');
  const manifestPath = join(root, MANIFEST_FILE);
  const apiBase = options.apiBase ?? apiBaseFor(options.dev);

  if (!existsSync(manifestPath)) {
    throw new Error(`${MANIFEST_FILE} is missing`);
  }

  for (const entry of ENTRIES) {
    if (!existsSync(join(root, entry.in))) {
      throw new Error(`${entry.in} is missing`);
    }
  }

  // An earlier build must not leave a file that this one no longer writes.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const copy = (): Promise<void> =>
    writeCopiedFiles(root, outDir, manifestPath, apiBase, options.dev);

  // One save can raise two events, and a copy that starts before the previous
  // one ends truncates a page that copy is still writing. One chain keeps the
  // copies in order, and it survives a failed copy.
  let pending: Promise<void> = Promise.resolve();

  const copyInOrder = (): Promise<void> => {
    const next = pending.then(copy, copy);

    pending = next.then(
      () => undefined,
      () => undefined,
    );

    return next;
  };

  if (options.watch === true) {
    // The watchers start before the first copy, so a page edited while that
    // copy or the first build runs is copied again instead of waiting for the
    // next edit.
    const watchers = watchStaticFiles(root, MANIFEST_FILE, copyInOrder);

    await copyInOrder();

    const buildContext = await context(esbuildOptions(root, outDir, options.dev, apiBase));

    await buildContext.rebuild();
    await buildContext.watch();

    return {
      outDir,
      files: outputFiles(),
      apiBase,
      stop: async () => {
        for (const watcher of watchers) {
          watcher.close();
        }

        // A reload after a save must not read a half-written page or manifest.
        await pending;
        await buildContext.dispose();
      },
    };
  }

  await build(esbuildOptions(root, outDir, options.dev, apiBase));
  await copy();

  return { outDir, files: outputFiles(), apiBase };
}

async function main(): Promise<void> {
  const dev = process.argv.includes('--dev');
  const watching = process.argv.includes('--watch');

  try {
    const result = await buildExtension({ dev, watch: watching });

    process.stdout.write(`${result.outDir}\nbackend: ${result.apiBase}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const invoked = process.argv[1];

if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  await main();
}
