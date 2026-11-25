import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { ZipFile } from 'yazl';

/**
 * One timestamp for every entry. The store only needs a valid package, and a
 * fixed date makes two runs of one commit produce the same bytes.
 */
export const ZIP_MTIME = new Date('1980-01-01T00:00:00Z');

/** Every file under a directory, in a fixed order, so two runs agree. */
export async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries.slice().sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      paths.push(...(await filesUnder(path)));
    } else if (entry.isFile()) {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * The zip of one directory. The manifest sits at the root of the archive, as the
 * store requires, and no entry carries the directory's own name.
 */
export async function zipDirectory(root: string): Promise<Buffer> {
  const zip = new ZipFile();
  const chunks: Buffer[] = [];

  const finished = new Promise<void>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('end', resolve);
    zip.outputStream.on('error', reject);
  });

  for (const path of await filesUnder(root)) {
    zip.addFile(path, relative(root, path).split(sep).join('/'), { mtime: ZIP_MTIME });
  }

  zip.end();

  await finished;

  return Buffer.concat(chunks);
}
