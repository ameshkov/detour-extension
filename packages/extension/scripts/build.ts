import { createHash } from 'node:crypto';
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

export type ExtensionId = {
  /** The 32 letters that chrome://extensions shows for the folder. */
  id: string;
  /** A manifest key decides the id, and an absolute folder path decides it. */
  source: 'key' | 'path';
};

export type BuildResult = {
  outDir: string;
  files: string[];
  apiBase: string;
  extensionId: ExtensionId;
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
  'icon-off-128.png',
  'icon-off-16.png',
  'icon-off-32.png',
  'icon-off-48.png',
  'icon-plain-128.png',
  'icon-plain-16.png',
  'icon-plain-32.png',
  'icon-plain-48.png',
  'icon-32.png',
  'icon-48.png',
  'icon-128.png',
  'inter-OFL.txt',
  'inter.woff2',
  'logo-mark.png',
  'options.html',
  'popup.html',
  'ui.css',
];

const MANIFEST_FILE = 'manifest.json';

const ID_ALPHABET = 'abcdefghijklmnop';

/** Chrome maps each hexadecimal digit of a SHA-256 to the letters a to p. */
function idOf(bytes: Buffer): string {
  let id = '';

  for (const byte of bytes.subarray(0, 16)) {
    id += ID_ALPHABET.charAt(byte >> 4) + ID_ALPHABET.charAt(byte & 0x0f);
  }

  return id;
}

/**
 * The id that Chrome gives an unpacked build. A manifest key fixes it, and the
 * absolute path of the folder fixes it when the key is absent, so the same
 * folder keeps an id between builds but changes it when the key comes or goes.
 */
export function extensionIdOf(manifestText: string, outDir: string): ExtensionId {
  let manifest: unknown;

  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error(`${MANIFEST_FILE} is not valid JSON`);
  }

  const key =
    typeof manifest === 'object' && manifest !== null
      ? (manifest as { key?: unknown }).key
      : undefined;

  if (typeof key === 'string' && key !== '') {
    const der = Buffer.from(key, 'base64');

    return { id: idOf(createHash('sha256').update(der).digest()), source: 'key' };
  }

  return { id: idOf(createHash('sha256').update(outDir).digest()), source: 'path' };
}

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
    // A linked map sits in its own file, so a page load reads the bundle alone
    // and DevTools reads the map only while it is open. An inline map makes
    // every popup open parse several megabytes.
    sourcemap: dev ? 'linked' : false,
    define: definesFor(dev, apiBase),
    logLevel: 'warning',
  };
}

function outputFiles(dev: boolean): string[] {
  const bundles = ENTRIES.map((entry) => `${entry.out}.js`);
  const maps = dev ? ENTRIES.map((entry) => `${entry.out}.js.map`) : [];

  return [...bundles, ...maps, ...COPIED_FILES, MANIFEST_FILE].sort();
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
      files: outputFiles(options.dev),
      apiBase,
      extensionId: extensionIdOf(await readFile(join(outDir, MANIFEST_FILE), 'utf8'), outDir),
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

  return {
    outDir,
    files: outputFiles(options.dev),
    apiBase,
    extensionId: extensionIdOf(await readFile(join(outDir, MANIFEST_FILE), 'utf8'), outDir),
  };
}

async function main(): Promise<void> {
  const dev = process.argv.includes('--dev');
  const watching = process.argv.includes('--watch');

  try {
    const result = await buildExtension({ dev, watch: watching });
    const { extensionId } = result;
    const source =
      extensionId.source === 'key' ? 'from the manifest key' : 'from the folder, which has no key';

    process.stdout.write(
      `${result.outDir}\nbackend: ${result.apiBase}\nextension id: ${extensionId.id} (${source})\n`,
    );

    if (!dev) {
      process.stdout.write('hint: pnpm build:dev keeps the key that fixes the id\n');
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const invoked = process.argv[1];

if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  await main();
}
