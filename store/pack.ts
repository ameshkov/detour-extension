import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RELEASE_API_BASE } from './listing';
import { filesUnder, zipDirectory } from './zip';

export const ROOT = resolve(import.meta.dirname, '..');
export const DIST = join(ROOT, 'packages', 'extension', 'dist');
export const OUT = join(ROOT, 'store', 'dist');

/** The names of the files that the release build writes, and no other file. */
export const REQUIRED_FILES = [
  'background.js',
  'block.html',
  'block.js',
  'guard.js',
  'icon-128.png',
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-off-128.png',
  'icon-off-16.png',
  'icon-off-32.png',
  'icon-off-48.png',
  'icon-plain-128.png',
  'icon-plain-16.png',
  'icon-plain-32.png',
  'icon-plain-48.png',
  'inter-OFL.txt',
  'inter.woff2',
  'logo-mark.png',
  'manifest.json',
  'options.html',
  'options.js',
  'popup.html',
  'popup.js',
  'ui.css',
] as const;

const ICONS: ReadonlyArray<readonly [string, number]> = [
  ['icon-16.png', 16],
  ['icon-off-16.png', 16],
  ['icon-plain-16.png', 16],
  ['icon-32.png', 32],
  ['icon-off-32.png', 32],
  ['icon-plain-32.png', 32],
  ['icon-48.png', 48],
  ['icon-off-48.png', 48],
  ['icon-plain-48.png', 48],
  ['icon-128.png', 128],
  ['icon-off-128.png', 128],
  ['icon-plain-128.png', 128],
];

const VERSION = /^\d{1,5}(\.\d{1,5}){0,3}$/;

export type ManifestShape = {
  key?: string;
  name?: string;
  version?: string;
  description?: string;
  permissions?: string[];
  host_permissions?: string[];
};

/** A PNG carries its size in the IHDR chunk, which comes first. */
export function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function parseManifest(manifestText: string): ManifestShape {
  const manifest: unknown = JSON.parse(manifestText);

  return typeof manifest === 'object' && manifest !== null ? (manifest as ManifestShape) : {};
}

/**
 * Every reason that this directory would fail at the store, or that it is not
 * the production build. A run prints all of them, so one fix does not hide the
 * next failure.
 */
export function problemsOf(
  names: readonly string[],
  manifestText: string,
  pngOf: (name: string) => Buffer,
): string[] {
  const problems: string[] = [];
  let manifest: ManifestShape;

  try {
    manifest = parseManifest(manifestText);
  } catch {
    return ['manifest.json is not valid JSON'];
  }

  // The store grants an item its public key and refuses a package that carries
  // one, so a key here means that the release build did not drop it.
  if (manifest.key !== undefined) {
    problems.push('manifest.json: the key field is not allowed in a store upload');
  }

  if (manifest.version === undefined || !VERSION.test(manifest.version)) {
    problems.push(`manifest.json: version "${manifest.version ?? ''}" is not 1 to 4 numbers`);
  }

  if ((manifest.name ?? '').trim() === '') {
    problems.push('manifest.json: name is missing');
  }

  if ((manifest.description ?? '').trim() === '') {
    problems.push('manifest.json: description is missing');
  }

  const hosts = manifest.host_permissions ?? [];

  if (!hosts.includes('*://*/*')) {
    problems.push('manifest.json: the page permission *://*/* is missing');
  }

  if (!hosts.includes(`${RELEASE_API_BASE}/*`)) {
    problems.push(
      `manifest.json: the backend permission ${RELEASE_API_BASE}/* is missing, so this is not a release build`,
    );
  }

  for (const name of REQUIRED_FILES) {
    if (!names.includes(name)) {
      problems.push(`${name}: the build did not write it`);
    }
  }

  for (const name of names) {
    if (!(REQUIRED_FILES as readonly string[]).includes(name)) {
      problems.push(`${name}: it is not part of the release`);
    }
  }

  for (const [name, size] of ICONS) {
    if (!names.includes(name)) {
      continue;
    }

    const actual = pngSize(pngOf(name));

    if (actual.width !== size || actual.height !== size) {
      problems.push(
        `${name}: ${actual.width} by ${actual.height} px, and the manifest says ${size}`,
      );
    }
  }

  return problems;
}

export type PackedRelease = {
  zipPath: string;
  version: string;
  files: number;
  bytes: number;
};

/**
 * The store package of the release build. The build runs before this step, and
 * the check reads what the build wrote, so the archive cannot carry a file that
 * the build does not own.
 */
export async function packRelease(): Promise<PackedRelease> {
  const paths = await filesUnder(DIST);
  const names = paths.map((path) => relative(DIST, path).split(sep).join('/'));
  const problems = problemsOf(names, await readFile(join(DIST, 'manifest.json'), 'utf8'), (name) =>
    readFileSync(join(DIST, name)),
  );

  if (problems.length > 0) {
    throw new Error(`the release build is not ready:\n- ${problems.join('\n- ')}`);
  }

  const version = parseManifest(await readFile(join(DIST, 'manifest.json'), 'utf8')).version ?? '';
  const zip = await zipDirectory(DIST);
  const zipPath = join(OUT, `detour-${version}.zip`);

  await mkdir(OUT, { recursive: true });
  await writeFile(zipPath, zip);

  return { zipPath, version, files: names.length, bytes: (await stat(zipPath)).size };
}

async function main(): Promise<void> {
  try {
    const packed = await packRelease();

    process.stdout.write(
      `${packed.zipPath}\nversion ${packed.version}, ${packed.files} files, ${Math.round(packed.bytes / 1024)} KB\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const invoked = process.argv[1];

if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  await main();
}
