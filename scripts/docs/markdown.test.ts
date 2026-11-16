import { describe, expect, it } from 'vitest';

import { codesIn, headingsOf, linksIn } from './markdown';

describe('markdown', () => {
  it('does not read a heading inside a fenced block', () => {
    expect(headingsOf('```\n## Not a heading\n```\n')).toEqual([]);
  });

  it('makes a heading slug from words', () => {
    expect(headingsOf('## Build And Test Commands\n')).toEqual([
      { slug: 'build-and-test-commands', line: 1 },
    ]);
  });

  it('keeps a double hyphen where a symbol was removed', () => {
    expect(headingsOf('## Configuration & Documentation\n').map((heading) => heading.slug)).toEqual(
      ['configuration--documentation'],
    );
  });

  it('numbers a repeated heading', () => {
    expect(
      headingsOf('## Notes\n\n## Notes\n\ntext\n\n## Notes\n').map((heading) => heading.slug),
    ).toEqual(['notes', 'notes-1', 'notes-2']);
  });

  it('finds a fenced block on its opening line', () => {
    expect(codesIn('# Title\n\n```bash\npnpm test\n```\n')).toEqual([
      { text: 'pnpm test', line: 3 },
    ]);
  });

  it('finds an inline code span', () => {
    expect(codesIn('Run `pnpm test` now.\n')).toEqual([{ text: 'pnpm test', line: 1 }]);
  });

  it('finds a link and its line', () => {
    expect(linksIn('Intro\n\nSee [the plan](plan.md).\n')).toEqual([
      { target: 'plan.md', line: 3 },
    ]);
  });

  it('finds no link inside a code block or a code span', () => {
    expect(linksIn('`[a](a.md)`\n\n```\n[b](b.md)\n```\n')).toEqual([]);
  });

  it('finds an image link', () => {
    expect(linksIn('![mark](docs/mark.png)\n')).toEqual([{ target: 'docs/mark.png', line: 1 }]);
  });
});
