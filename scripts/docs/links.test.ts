import { describe, expect, it } from 'vitest';

import { checkLinks } from './links';
import type { DocFile } from './markdown';

const FILES = new Set([
  'README.md',
  'DEVELOPMENT.md',
  'docs/architecture.md',
  'sites/schema.md',
  'docs/',
]);

function exists(path: string): boolean {
  return FILES.has(path);
}

function docsWith(readme: string): DocFile[] {
  return [
    { path: 'README.md', text: readme },
    { path: 'DEVELOPMENT.md', text: '# Development\n\n## Install\n' },
    { path: 'docs/architecture.md', text: '# Architecture\n\n## Flow\n' },
  ];
}

describe('document links', () => {
  it('accepts a link to an existing file', () => {
    expect(checkLinks(docsWith('[Dev](DEVELOPMENT.md)\n'), exists)).toEqual([]);
  });

  it('rejects a link to a missing file', () => {
    const problems = checkLinks(docsWith('[Gone](GONE.md)\n'), exists);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.message.startsWith('dead link: ')).toBe(true);
  });

  it('resolves a link from the folder of its document', () => {
    const docs: DocFile[] = [
      { path: 'docs/architecture.md', text: '# Architecture\n\n[Schema](../sites/schema.md)\n' },
    ];

    expect(checkLinks(docs, exists)).toEqual([]);
  });

  it('accepts a bare anchor that matches a heading', () => {
    expect(checkLinks(docsWith('[Install](DEVELOPMENT.md#install)\n'), exists)).toEqual([]);
  });

  it('rejects an anchor with no heading', () => {
    const problems = checkLinks(docsWith('[Nope](#nope)\n'), exists);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.message.startsWith('dead anchor: ')).toBe(true);
  });

  it('rejects a missing anchor in another document', () => {
    const problems = checkLinks(docsWith('[Setup](DEVELOPMENT.md#setup)\n'), exists);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.message.startsWith('dead anchor: ')).toBe(true);
  });

  it('accepts a folder link', () => {
    expect(checkLinks(docsWith('[Docs](docs/)\n'), exists)).toEqual([]);
  });

  it('ignores an external link', () => {
    expect(checkLinks(docsWith('[Web](https://example.com/a)\n'), exists)).toEqual([]);
  });
});
