import { describe, expect, it } from 'vitest';

import { REQUIRED_FILES, problemsOf } from './pack';

const MANIFEST = {
  name: 'Detour',
  version: '0.1.0',
  description: 'Stops a visit to a publisher that walls a reader.',
  permissions: ['alarms', 'storage'],
  host_permissions: ['*://*/*', 'https://detour-api.meshkov.info/*'],
};

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...MANIFEST, ...overrides });
}

/** The first 24 bytes of a PNG: the signature, the chunk length, and the size. */
function png(size: number): Buffer {
  const bytes = Buffer.alloc(24);

  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'latin1');
  bytes.writeUInt32BE(size, 16);
  bytes.writeUInt32BE(size, 20);

  return bytes;
}

function pngOf(name: string): Buffer {
  const size = Number(/icon-(\d+)\.png/.exec(name)?.[1] ?? 16);

  return png(name === 'logo-mark.png' ? 96 : size);
}

const names = [...REQUIRED_FILES];

describe('the release build check', () => {
  it('accepts the files and the manifest of a release build', () => {
    expect(problemsOf(names, manifest(), pngOf)).toEqual([]);
  });

  it('refuses the public key that the store grants the item', () => {
    expect(problemsOf(names, manifest({ key: 'MIIBIjANBgkq' }), pngOf)).toEqual([
      'manifest.json: the key field is not allowed in a store upload',
    ]);
  });

  it('refuses a development build, which names the dummy server', () => {
    const problems = problemsOf(
      names,
      manifest({ host_permissions: ['*://*/*', 'http://127.0.0.1:8787/*'] }),
      pngOf,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('not a release build');
  });

  it('names a file that the build did not write', () => {
    const problems = problemsOf(
      names.filter((name) => name !== 'guard.js'),
      manifest(),
      pngOf,
    );

    expect(problems).toEqual(['guard.js: the build did not write it']);
  });

  it('names a file that is not part of the release', () => {
    expect(problemsOf([...names, 'guard.js.map'], manifest(), pngOf)).toEqual([
      'guard.js.map: it is not part of the release',
    ]);
  });

  it('checks the size of every icon against the manifest', () => {
    const problems = problemsOf(names, manifest(), (name) =>
      name === 'icon-48.png' ? png(32) : pngOf(name),
    );

    expect(problems).toEqual(['icon-48.png: 32 by 32 px, and the manifest says 48']);
  });

  it('refuses a version that the store cannot read', () => {
    expect(problemsOf(names, manifest({ version: '0.1.0-beta' }), pngOf)).toEqual([
      'manifest.json: version "0.1.0-beta" is not 1 to 4 numbers',
    ]);
  });

  it('stops at a manifest that does not parse', () => {
    expect(problemsOf(names, '{', pngOf)).toEqual(['manifest.json is not valid JSON']);
  });

  it('needs the broad page permission', () => {
    const problems = problemsOf(
      names,
      manifest({ host_permissions: ['https://detour-api.meshkov.info/*'] }),
      pngOf,
    );

    expect(problems).toEqual(['manifest.json: the page permission *://*/* is missing']);
  });
});
