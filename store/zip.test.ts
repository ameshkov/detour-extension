import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { filesUnder, zipDirectory } from './zip';

/** The names in the central directory, which is what a store reads first. */
function entryNames(zip: Buffer): string[] {
  const end = zip.lastIndexOf(Buffer.from('PK\x05\x06'));
  const count = zip.readUInt16LE(end + 10);
  const names: string[] = [];
  let offset = zip.readUInt32LE(end + 16);

  for (let index = 0; index < count; index += 1) {
    expect(zip.toString('latin1', offset, offset + 4)).toBe('PK\x01\x02');

    const length = zip.readUInt16LE(offset + 28);
    const extra = zip.readUInt16LE(offset + 30);
    const comment = zip.readUInt16LE(offset + 32);

    names.push(zip.toString('utf8', offset + 46, offset + 46 + length));
    offset += 46 + length + extra + comment;
  }

  return names;
}

let directory: string | null = null;

afterEach(async () => {
  if (directory !== null) {
    await rm(directory, { recursive: true, force: true });
    directory = null;
  }
});

async function sample(): Promise<string> {
  directory = await mkdtemp(join(tmpdir(), 'detour-zip-'));
  await mkdir(join(directory, 'nested'));
  await writeFile(join(directory, 'manifest.json'), '{"manifest_version":3}');
  await writeFile(join(directory, 'nested', 'page.html'), '<p>a page</p>');
  await writeFile(join(directory, 'notes.txt'), 'the last file');

  return directory;
}

describe('the release zip', () => {
  it('names every file from the root of the archive', async () => {
    const zip = await zipDirectory(await sample());

    expect(entryNames(zip)).toEqual(['manifest.json', 'nested/page.html', 'notes.txt']);
  });

  it('lists the files in one order, whatever the file system returns', async () => {
    const root = await sample();

    expect(await filesUnder(root)).toEqual([
      join(root, 'manifest.json'),
      join(root, 'nested', 'page.html'),
      join(root, 'notes.txt'),
    ]);
  });

  it('gives the same bytes for the same input', async () => {
    const root = await sample();

    expect(await zipDirectory(root)).toEqual(await zipDirectory(root));
  });

  it('writes a zip that ends with its central directory', async () => {
    const zip = await zipDirectory(await sample());

    expect(zip.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04');
    expect(zip.subarray(zip.length - 22, zip.length - 18).toString('latin1')).toBe('PK\x05\x06');
  });
});
