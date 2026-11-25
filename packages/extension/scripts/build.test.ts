import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  API_BASE_ENV,
  DEFAULT_DEV_API_BASE,
  DEFAULT_RELEASE_API_BASE,
  apiBaseFor,
  buildExtension,
  definesFor,
  builtManifest,
  parseApiBase,
} from './build';

const ENTRY_FILES = [
  'background.ts',
  'guard-entry.ts',
  'block-entry.ts',
  'popup-entry.ts',
  'options-entry.ts',
];

const PAGE_FILES = [
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

const OUTPUT_FILES = [
  'background.js',
  'block.html',
  'block.js',
  'guard.js',
  'icon-128.png',
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'logo-mark.png',
  'manifest.json',
  'options.html',
  'options.js',
  'popup.html',
  'popup.js',
  'ui.css',
];

const outputDirs: string[] = [];

async function temporaryOutDir(): Promise<string> {
  const outDir = await mkdtemp(join(tmpdir(), 'detour-extension-'));

  outputDirs.push(outDir);

  return outDir;
}

async function readManifest(outDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

/**
 * A minimal package, so a watch case writes a page that is not a source file
 * of this repository.
 */
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'detour-extension-root-'));

  outputDirs.push(root);
  await mkdir(join(root, 'src'), { recursive: true });

  for (const file of ENTRY_FILES) {
    await writeFile(join(root, 'src', file), 'export const marker = 1;\n');
  }

  for (const file of PAGE_FILES) {
    await writeFile(
      join(root, 'src', file),
      '<!doctype html>\n<link rel="stylesheet" href="ui.css" />\n',
    );
  }

  await writeFile(join(root, 'manifest.json'), '{ "manifest_version": 3 }\n');

  return root;
}

const CHANGED_PAGE = '<!doctype html>\n<p>the page changed in watch mode</p>\n';

/**
 * Waits for the watcher to copy the changed page. Every poll writes the page
 * again, so a late file event cannot lose the run, and the deadline is patient
 * because a loaded machine can delay the event by seconds.
 */
async function waitForCopiedPage(root: string, outDir: string): Promise<void> {
  const source = join(root, 'src', 'popup.html');
  const copied = join(outDir, 'popup.html');
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    if (
      existsSync(copied) &&
      (await readFile(copied, 'utf8')).includes('the page changed in watch mode')
    ) {
      return;
    }

    await writeFile(source, CHANGED_PAGE);
    await new Promise((done) => setTimeout(done, 25));
  }

  throw new Error('the watcher did not write the changed page');
}

afterEach(async () => {
  await Promise.all(
    outputDirs.splice(0).map((outDir) => rm(outDir, { recursive: true, force: true })),
  );
});

describe('the api base', () => {
  it('defaults to the dummy server and the release backend', () => {
    expect(apiBaseFor(true, {})).toBe(DEFAULT_DEV_API_BASE);
    expect(apiBaseFor(false, {})).toBe(DEFAULT_RELEASE_API_BASE);
  });

  it('reads the build environment value', () => {
    const env = { [API_BASE_ENV]: 'https://api.example.test' };

    expect(apiBaseFor(true, env)).toBe('https://api.example.test');
    expect(apiBaseFor(false, env)).toBe('https://api.example.test');
  });

  it('ignores an empty environment value', () => {
    expect(apiBaseFor(true, { [API_BASE_ENV]: '  ' })).toBe(DEFAULT_DEV_API_BASE);
  });

  it('keeps the origin alone', () => {
    expect(parseApiBase('https://api.example.test/')).toBe('https://api.example.test');
    expect(parseApiBase('http://127.0.0.1:9000')).toBe('http://127.0.0.1:9000');
  });

  it('rejects a value that is not an http origin', () => {
    expect(() => parseApiBase('api.example.test')).toThrow(/not a URL/);
    expect(() => parseApiBase('ftp://api.example.test')).toThrow(/not an http or https URL/);
    expect(() => parseApiBase('https://api.example.test/v1')).toThrow(/without a path/);
    expect(() => parseApiBase('https://api.example.test/?a=1')).toThrow(/without a path/);
    expect(() => parseApiBase('https://user:pass@api.example.test')).toThrow(/credentials/);
  });

  it('defines the base and the development flag', () => {
    expect(definesFor(true, 'http://127.0.0.1:8787')).toEqual({
      API_BASE: JSON.stringify('http://127.0.0.1:8787'),
      DEV: 'true',
    });
    expect(definesFor(false, 'https://api.example.test')).toEqual({
      API_BASE: JSON.stringify('https://api.example.test'),
      DEV: 'false',
    });
  });

  it('adds the backend origin to the manifest host permissions', () => {
    const manifest = JSON.parse(
      builtManifest('{"host_permissions":["*://*/*"]}', 'https://api.example.test', false),
    ) as { host_permissions: string[] };

    expect(manifest.host_permissions).toEqual(['*://*/*', 'https://api.example.test/*']);
  });

  it('drops the public key from the release manifest and keeps it in development', () => {
    const source = '{"key":"abc","host_permissions":["*://*/*"]}';

    expect(JSON.parse(builtManifest(source, 'https://api.example.test', false))).not.toHaveProperty(
      'key',
    );
    expect(JSON.parse(builtManifest(source, 'https://api.example.test', true))).toHaveProperty(
      'key',
      'abc',
    );
  });

  it('does not repeat a host permission', () => {
    const source = JSON.stringify({
      host_permissions: ['*://*/*', 'https://api.example.test/*'],
    });
    const manifest = JSON.parse(builtManifest(source, 'https://api.example.test', false)) as {
      host_permissions: string[];
    };

    expect(manifest.host_permissions).toEqual(['*://*/*', 'https://api.example.test/*']);
  });
});

describe('the extension build', () => {
  it('writes the five scripts and the copied files', async () => {
    const outDir = await temporaryOutDir();
    const result = await buildExtension({ dev: false, outDir });

    expect(result.outDir).toBe(outDir);
    expect([...result.files].sort()).toEqual(OUTPUT_FILES);

    for (const file of OUTPUT_FILES) {
      expect(existsSync(join(outDir, file)), file).toBe(true);
    }

    const page = await readFile(join(outDir, 'block.html'), 'utf8');

    expect(page).toContain('<link rel="stylesheet" href="ui.css" />');
  });

  it('writes the page mark and the options page', async () => {
    const outDir = await temporaryOutDir();

    await buildExtension({ dev: false, outDir });

    expect(existsSync(join(outDir, 'logo-mark.png'))).toBe(true);
    expect(await readFile(join(outDir, 'options.html'), 'utf8')).toContain('src="logo-mark.png"');
    expect(existsSync(join(outDir, 'options.js'))).toBe(true);
  });

  it('grants the backend of the development build', async () => {
    const outDir = await temporaryOutDir();

    await buildExtension({ dev: true, outDir });

    expect((await readManifest(outDir)).host_permissions).toEqual([
      '*://*/*',
      DEFAULT_DEV_API_BASE + '/*',
    ]);
  });

  it('grants the backend of the release build', async () => {
    const outDir = await temporaryOutDir();

    await buildExtension({ dev: false, outDir });

    const manifest = await readManifest(outDir);

    expect(manifest.host_permissions).toEqual(['*://*/*', DEFAULT_RELEASE_API_BASE + '/*']);
    expect(JSON.stringify(manifest)).not.toContain('127.0.0.1');
  });

  it('grants a backend that the build names', async () => {
    const outDir = await temporaryOutDir();

    await buildExtension({ dev: false, outDir, apiBase: 'https://api.example.test' });

    expect((await readManifest(outDir)).host_permissions).toEqual([
      '*://*/*',
      'https://api.example.test/*',
    ]);
  });

  it('drops the development log from the release bundle', async () => {
    const developmentDir = await temporaryOutDir();
    const releaseDir = await temporaryOutDir();

    await buildExtension({ dev: true, outDir: developmentDir });
    await buildExtension({ dev: false, outDir: releaseDir });

    expect(await readFile(join(developmentDir, 'guard.js'), 'utf8')).toContain('[detour]');
    expect(await readFile(join(releaseDir, 'guard.js'), 'utf8')).not.toContain('[detour]');
  });

  it('writes the named backend into the bundle', async () => {
    const outDir = await temporaryOutDir();

    await buildExtension({ dev: false, outDir, apiBase: 'https://api.example.test' });

    expect(await readFile(join(outDir, 'background.js'), 'utf8')).toContain(
      'https://api.example.test',
    );
  });

  it('removes the output of an earlier build', async () => {
    const outDir = await temporaryOutDir();

    await writeFile(join(outDir, 'stale.js'), 'an earlier build\n');
    await buildExtension({ dev: false, outDir });

    expect(existsSync(join(outDir, 'stale.js'))).toBe(false);
  });

  it('writes the manifest and the copied files in watch mode', async () => {
    const outDir = await temporaryOutDir();
    const result = await buildExtension({ dev: true, outDir, watch: true });

    try {
      expect((await readManifest(outDir)).host_permissions).toEqual([
        '*://*/*',
        DEFAULT_DEV_API_BASE + '/*',
      ]);

      for (const file of ['manifest.json', 'block.html', 'ui.css']) {
        expect(existsSync(join(outDir, file)), file).toBe(true);
      }

      expect(typeof result.stop).toBe('function');
    } finally {
      await result.stop?.();
    }
  });

  it('copies a changed page again in watch mode', async () => {
    const root = await temporaryRoot();
    const outDir = await temporaryOutDir();
    const result = await buildExtension({ dev: true, root, outDir, watch: true });

    try {
      await waitForCopiedPage(root, outDir);
    } finally {
      await result.stop?.();
    }
  });
});
