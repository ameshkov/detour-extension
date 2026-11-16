import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { METADATA_MAX_BYTES } from './constants';
import type { FetchLike } from './net';
import type { PageMeta } from './metadata';
import { fetchPageMeta, readPageMeta } from './metadata';

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, `../../../sites/fixtures/pages/${name}`),
    'utf8',
  );
}

const CNET_PAGE = fixture('cnet-best-ai-image-generators.html');
const EXPRESS_PAGE = fixture('express-meghan-markle-comment.html');
const NEWSWEEK_PAGE = fixture('newsweek-nvidia-chips-spies.html');

const SAVED_PAGES = [
  { file: 'cnet-best-ai-image-generators.html', bytes: 524_288 },
  { file: 'express-meghan-markle-comment.html', bytes: 81_246 },
  { file: 'newsweek-nvidia-chips-spies.html', bytes: 431_685 },
];

// A head of tags that never close. A scan that backtracks to the end of the
// string for every `<meta` takes tens of seconds; the case timeout is the bound.
const UNCLOSED_TAGS = `<html><head>${'<meta '.repeat(Math.ceil(524_288 / 6))}`;

const EMPTY_META: PageMeta = {
  title: null,
  description: null,
};

const BASE_URL = 'https://example.com/news/article';

function head(content: string): string {
  return `<!doctype html><html><head>${content}</head><body><p>Story</p></body></html>`;
}

function serving(response: () => Response): FetchLike {
  return async () => response();
}

describe('the metadata reader', () => {
  it('reads every field of the cnet page', () => {
    expect(readPageMeta(CNET_PAGE)).toEqual({
      title: 'Best AI Image Generators of 2026: We Tested All the Biggest Creative AI Tools - CNET',
      description:
        'This is everything you need to know to pick the right AI for your project and budget.',
    });
  });

  it('reads the express page with an apostrophe inside a quoted value', () => {
    const meta = readPageMeta(EXPRESS_PAGE);

    expect(meta.title).toBe(
      "'I don’t buy Meghan’s emotional breakdown for a minute - there’s 1 big problem'",
    );
    expect(meta.description).toBe(
      "OPINION - CAROLE MALONE: Forgive me but I can't shake the feeling everything this pair are currently doing is just one big PR exercise",
    );
  });

  it('prefers the social title over the title tag', () => {
    expect(readPageMeta(EXPRESS_PAGE).title).toBe(
      "'I don’t buy Meghan’s emotional breakdown for a minute - there’s 1 big problem'",
    );
    expect(readPageMeta(NEWSWEEK_PAGE).title).toBe(
      'Nvidia’s Jensen Huang Scandal: Chips, Spies and Strategic Overreaction',
    );
  });

  it('reads the newsweek page without a description', () => {
    const meta = readPageMeta(NEWSWEEK_PAGE);

    expect(meta.description).toBeNull();
  });

  it('prefers the social description over the meta description', () => {
    const html = head(
      '<meta name="description" content="Plain description">' +
        '<meta property="og:description" content="Social description">',
    );

    expect(readPageMeta(html).description).toBe('Social description');
  });

  it('reads a meta tag in either attribute order', () => {
    const propertyFirst = head('<meta property="og:title" content="Property first">');
    const contentFirst = head("<META CONTENT='Content first' PROPERTY='og:title'>");
    const unquoted = head('<meta property=og:title content=Unquoted>');

    expect(readPageMeta(propertyFirst).title).toBe('Property first');
    expect(readPageMeta(contentFirst).title).toBe('Content first');
    expect(readPageMeta(unquoted).title).toBe('Unquoted');
  });

  it('ignores a social title inside a comment', () => {
    const html = head(
      '<!-- <meta property="og:title" content="Commented"> -->' +
        '<meta property="og:title" content="Real">',
    );

    expect(readPageMeta(html).title).toBe('Real');
  });

  it('ignores a tag inside a script body', () => {
    const html = head(
      '<script>document.write(\'<meta property="og:title" content="Scripted">\')</script>' +
        '<meta property="og:title" content="Real">',
    );

    expect(readPageMeta(html).title).toBe('Real');
  });

  it('reads a head of tags that never close without stalling', () => {
    expect(readPageMeta(UNCLOSED_TAGS)).toEqual(EMPTY_META);
  });

  it('pins the size of every saved page', () => {
    const sizes = SAVED_PAGES.map((page) => ({
      file: page.file,
      bytes: readFileSync(
        resolve(import.meta.dirname, `../../../sites/fixtures/pages/${page.file}`),
      ).byteLength,
    }));

    expect(sizes).toEqual(SAVED_PAGES);
  });

  it('decodes the common entities', () => {
    const html = head(
      '<meta property="og:description" ' +
        'content="A &amp; B &quot;C&quot; &#39;D&#x27; &lt;E&gt; F&nbsp;G &unknown; &copy;">',
    );

    expect(readPageMeta(html).description).toBe('A & B "C" \'D\' <E> F\u00a0G &unknown; &copy;');
  });

  it('collapses whitespace in the title', () => {
    const html = head('<title>  A   story\n of\t\nthe day  </title>');

    expect(readPageMeta(html).title).toBe('A story of the day');
  });

  it('answers a page with no metadata', () => {
    expect(readPageMeta(head(''))).toEqual(EMPTY_META);
    expect(
      readPageMeta(
        head(
          '<meta property="og:title" content="">' + '<meta property="og:description" content="">',
        ),
      ),
    ).toEqual(EMPTY_META);
  });

  it('reads the head of the cnet page from its saved first 512 kb', () => {
    const saved = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../sites/fixtures/pages/cnet-best-ai-image-generators.html',
      ),
    );
    const meta = readPageMeta(saved.toString('utf8'));

    expect(saved.byteLength).toBe(METADATA_MAX_BYTES);
    expect(meta.title).toBe(
      'Best AI Image Generators of 2026: We Tested All the Biggest Creative AI Tools - CNET',
    );
  });
});

describe('the page fetch', () => {
  it('fetches one page and asks for no cookies', async () => {
    const calls: { input: string; init?: RequestInit }[] = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ input, init });

      return new Response(head('<meta property="og:title" content="Fetched">'));
    };

    const meta = await fetchPageMeta(BASE_URL, fetchImpl);

    expect(meta?.title).toBe('Fetched');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(BASE_URL);
    expect(calls[0]?.init?.credentials).toBe('omit');
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('answers null for a failed fetch', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('network down');
    };

    await expect(fetchPageMeta(BASE_URL, fetchImpl)).resolves.toBeNull();
  });

  it('answers null for a page that is not ok', async () => {
    const fetchImpl = serving(() => new Response('missing', { status: 404 }));

    await expect(fetchPageMeta(BASE_URL, fetchImpl)).resolves.toBeNull();
  });

  it('reads the head through a redirected response', async () => {
    const html = head('<meta property="og:title" content="Redirected">');
    const redirected = new Response(html);

    Object.defineProperty(redirected, 'url', { value: 'https://cdn.example.com/pages/story' });

    await expect(
      fetchPageMeta(
        BASE_URL,
        serving(() => redirected),
      ),
    ).resolves.toEqual({
      title: 'Redirected',
      description: null,
    });
  });

  it('stops reading a page at the cap', async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(new Uint8Array(300_000));
        },
        cancel() {
          cancelled = true;
        },
      },
      // No prefetch: one pull per chunk the reader asks for, so the count shows
      // whether the reader asked past the cap.
      { highWaterMark: 0 },
    );

    const meta = await fetchPageMeta(
      BASE_URL,
      serving(() => new Response(stream)),
    );

    expect(meta).toEqual(EMPTY_META);
    expect(pulls).toBe(2);
    expect(cancelled).toBe(true);
  });

  it('cancels the body when a chunk is not bytes', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue({ byteLength: 8 } as unknown as Uint8Array);
      },
      cancel() {
        cancelled = true;
      },
    });

    const meta = await fetchPageMeta(
      BASE_URL,
      serving(() => new Response(stream)),
    );

    expect(meta).toBeNull();
    expect(cancelled).toBe(true);
  });

  it('answers null when the page body cannot be read', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('read failed');
      },
    });

    await expect(
      fetchPageMeta(
        BASE_URL,
        serving(() => new Response(stream)),
      ),
    ).resolves.toBeNull();
  });
});
