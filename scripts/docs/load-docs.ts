import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { DocFile } from './markdown';

const SKIPPED_FOLDERS = new Set(['node_modules', '.git', '.sdd', 'dist']);

async function walk(root: string, folder: string): Promise<DocFile[]> {
  const entries = await readdir(join(root, folder), { withFileTypes: true });
  const docs: DocFile[] = [];

  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const path = folder === '' ? entry.name : `${folder}/${entry.name}`;

    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) {
        docs.push(...(await walk(root, path)));
      }

      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      docs.push({ path, text: await readFile(join(root, path), 'utf8') });
    }
  }

  return docs;
}

export async function loadDocs(root: string): Promise<DocFile[]> {
  return walk(root, '');
}
