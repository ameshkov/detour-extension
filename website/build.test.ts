import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FILES, buildSite, indexBody, policyBody, policyMarkdown } from './build';
import { escapeHtml, page } from './layout';

let outDir: string | null = null;

afterEach(async () => {
  if (outDir !== null) {
    await rm(outDir, { recursive: true, force: true });
    outDir = null;
  }
});

async function built(): Promise<Map<string, string>> {
  outDir = await mkdtemp(join(tmpdir(), 'detour-site-'));
  await buildSite(outDir);

  const texts = new Map<string, string>();

  for (const file of FILES) {
    texts.set(file, await readFile(join(outDir, file)).then((bytes) => bytes.toString('latin1')));
  }

  return texts;
}

describe('the site shell', () => {
  it('escapes every value that it puts in the head', () => {
    expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
  });

  it('sets the language, the title, and one stylesheet', () => {
    const html = page({ title: 'A & B', description: 'd', body: '<p>body</p>' });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>A &amp; B</title>');
    expect(html).toContain('<link rel="stylesheet" href="styles.css" />');
    expect(html).toContain('<p>body</p>');
  });

  it('links the pages of the site and the repository', () => {
    const html = page({ title: 't', description: 'd', body: '' });

    expect(html).toContain('href="index.html"');
    expect(html).toContain('href="privacy.html"');
    expect(html).toContain('href="https://github.com/ameshkov/detour-extension"');
  });
});

describe('the policy page', () => {
  it('drops the front matter and the page title from the markdown', () => {
    const source = '---\ntitle: Privacy\n---\n\n# Privacy\n\nThe policy.\n';

    expect(policyMarkdown(source)).toBe('The policy.');
  });

  it('keeps the headings that the document uses', () => {
    const html = policyBody('# Privacy\n\nIntro.\n\n## What leaves your browser\n\nA page.\n');

    expect(html).toContain('<h2');
    expect(html).toContain('What leaves your browser');
  });
});

describe('the built site', () => {
  it('writes the two pages and the four files that they load', async () => {
    const texts = await built();

    expect([...texts.keys()].sort()).toEqual([...FILES].sort());
    expect(texts.get('favicon.png')?.slice(0, 8)).toBe(
      Buffer.from('89504e470d0a1a0a', 'hex').toString('latin1'),
    );
  });

  it('puts the screenshot and the mark on the home page', async () => {
    const texts = await built();

    expect(texts.get('index.html')).toContain('src="screenshot-block.png"');
    expect(texts.get('index.html')).toContain('src="logo-mark.png"');
    expect(indexBody()).toContain('href="privacy.html"');
  });

  it('serves the policy from docs/privacy.md, with one title', async () => {
    const texts = await built();
    const html = texts.get('privacy.html') ?? '';

    expect(html).toContain('What leaves your browser');
    expect(html).toContain('What the backend keeps');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).not.toContain('---');
  });
});
