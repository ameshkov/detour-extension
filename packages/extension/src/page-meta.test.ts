// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readPageMeta } from './page-meta';

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, `../../../sites/fixtures/pages/${name}`),
    'utf8',
  );
}

/**
 * The parser hands the reader the same DOM that the guard reads after a stop.
 * A saved page's stylesheets and frames are dropped: the reader never reads them
 * and the test environment cannot load them.
 */
function domOf(html: string): Document {
  const head = html
    .replace(/<link\b[^>]*\.css[^>]*>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');

  return new DOMParser().parseFromString(head, 'text/html');
}

function head(content: string): Document {
  return domOf(`<!doctype html><html><head>${content}</head><body><p>Story</p></body></html>`);
}

const CNET = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';
const EXPRESS = 'https://www.express.co.uk/comment/expresscomment/1/meghan-markle';
const NEWSWEEK = 'https://www.newsweek.com/nvidia-jensen-huang-chips-spies';
const BASE_URL = 'https://example.com/news/article';

describe('the page metadata reader', () => {
  it('reads the title and the description of a saved page', () => {
    const meta = readPageMeta(domOf(fixture('cnet-best-ai-image-generators.html')), CNET);

    expect(meta.title).toBe(
      'Best AI Image Generators of 2026: We Tested All the Biggest Creative AI Tools - CNET',
    );
    expect(meta.description).toBe(
      'This is everything you need to know to pick the right AI for your project and budget.',
    );
  });

  it('keeps an apostrophe inside a quoted value', () => {
    const meta = readPageMeta(domOf(fixture('express-meghan-markle-comment.html')), EXPRESS);

    expect(meta.title).toBe(
      "'I don’t buy Meghan’s emotional breakdown for a minute - there’s 1 big problem'",
    );
    expect(meta.description).toBe(
      "OPINION - CAROLE MALONE: Forgive me but I can't shake the feeling everything this pair are currently doing is just one big PR exercise",
    );
  });

  it('answers no description when the page declares none', () => {
    const meta = readPageMeta(domOf(fixture('newsweek-nvidia-chips-spies.html')), NEWSWEEK);

    expect(meta.title).toBe(
      'Nvidia’s Jensen Huang Scandal: Chips, Spies and Strategic Overreaction',
    );
    expect(meta.description).toBeNull();
  });

  it('resolves the icon of a saved page against its address', () => {
    expect(readPageMeta(domOf(fixture('newsweek-nvidia-chips-spies.html')), NEWSWEEK).icon).toBe(
      'https://www.newsweek.com/favicon.svg',
    );
    // The page offers a shortcut icon first, so the apple touch icon never wins.
    expect(readPageMeta(domOf(fixture('express-meghan-markle-comment.html')), EXPRESS).icon).toBe(
      'https://cdn.images.express.co.uk/favicon.ico',
    );
  });

  it('prefers the social fields over the plain ones', () => {
    const document = head(
      '<meta property="og:title" content="Social title">' +
        '<title>Plain title</title>' +
        '<meta property="og:description" content="Social description">' +
        '<meta name="description" content="Plain description">',
    );

    expect(readPageMeta(document, BASE_URL)).toEqual({
      title: 'Social title',
      description: 'Social description',
      icon: 'https://example.com/favicon.ico',
    });
  });

  it('falls back to the plain fields', () => {
    const document = head('<title>Plain title</title><meta name="description" content="Plain">');

    expect(readPageMeta(document, BASE_URL).title).toBe('Plain title');
    expect(readPageMeta(document, BASE_URL).description).toBe('Plain');
  });

  it('reads an icon link, a shortcut icon, and an apple touch icon', () => {
    expect(readPageMeta(head('<link rel="icon" href="/assets/icon.png">'), BASE_URL).icon).toBe(
      'https://example.com/assets/icon.png',
    );
    expect(readPageMeta(head('<link rel="shortcut icon" href="favicon.svg">'), BASE_URL).icon).toBe(
      'https://example.com/news/favicon.svg',
    );
    expect(
      readPageMeta(head('<link rel="apple-touch-icon" href="touch.png">'), BASE_URL).icon,
    ).toBe('https://example.com/news/touch.png');
  });

  it('asks for the usual icon file when the head names none', () => {
    expect(readPageMeta(head(''), BASE_URL).icon).toBe('https://example.com/favicon.ico');
  });

  it('falls back to the usual file when the icon is not an http address', () => {
    expect(
      readPageMeta(head('<link rel="icon" href="data:image/png;base64,AAAA">'), BASE_URL).icon,
    ).toBe('https://example.com/favicon.ico');
  });

  it('collapses the whitespace of a title', () => {
    expect(readPageMeta(head('<title>  A story\n   of the day </title>'), BASE_URL).title).toBe(
      'A story of the day',
    );
  });

  it('caps a value at two thousand characters', () => {
    const long = 'b'.repeat(4096);

    expect(readPageMeta(head(`<title>${long}</title>`), BASE_URL).title).toHaveLength(2048);
  });

  it('answers a page with no head fields', () => {
    expect(readPageMeta(head(''), BASE_URL)).toEqual({
      title: null,
      description: null,
      icon: 'https://example.com/favicon.ico',
    });
    expect(readPageMeta(domOf('<html><head></head><body></body></html>'), BASE_URL)).toEqual({
      title: null,
      description: null,
      icon: 'https://example.com/favicon.ico',
    });
  });

  it('ignores a tag inside a comment or a script', () => {
    const document = head(
      '<!-- <meta property="og:title" content="Commented"> -->' +
        '<script>var t = \'<meta property="og:title" content="Scripted">\';</script>' +
        '<title>Real</title>',
    );

    expect(readPageMeta(document, BASE_URL).title).toBe('Real');
  });

  it('decodes the entities of the document', () => {
    const document = head('<title>A &amp; B &quot;C&quot; &#39;D&#39; &lt;E&gt;</title>');

    expect(readPageMeta(document, BASE_URL).title).toBe('A & B "C" \'D\' <E>');
  });

  it('prefers an empty social title over nothing', () => {
    const document = head('<meta property="og:title" content=""><title>The document title</title>');

    expect(readPageMeta(document, BASE_URL).title).toBe('The document title');
  });
});
