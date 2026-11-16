import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadDocs } from './load-docs';

describe('document loader', () => {
  it('finds Markdown files and skips the tool folders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'detour-docs-'));

    try {
      await mkdir(join(root, '.sdd'), { recursive: true });
      await mkdir(join(root, 'node_modules'), { recursive: true });
      await writeFile(join(root, 'README.md'), '# Readme\n');
      await writeFile(join(root, '.sdd', 'spec.md'), '# Spec\n');
      await writeFile(join(root, 'node_modules', 'a.md'), '# A\n');

      expect((await loadDocs(root)).map((doc) => doc.path)).toEqual(['README.md']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
