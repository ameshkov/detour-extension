import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SitesJsonSchema } from '@detour/shared';

import type { DummyServer } from './dummy-server';
import { startDummyServer } from './dummy-server';

const LIST = SitesJsonSchema.parse({
  disabled: false,
  avoid: [],
  prefer: [],
  sites: [
    {
      domain: '127.0.0.1',
      name: 'Local fixture',
      walls: [{ category: 'adblock', type: 'hard' }],
      paths: ['/walled/*'],
      note: 'A local fixture host.',
      avoid: [],
      prefer: [],
    },
  ],
});

/**
 * The scenario fixtures wait this long in the test run. The default is a few
 * seconds, which is what a reader needs to see the loading state, and a test
 * only needs the wait to be there.
 */
const TEST_SLOW_MS = 60;

let server: DummyServer;

beforeAll(async () => {
  server = await startDummyServer({ port: 0, list: LIST, slowDelayMs: TEST_SLOW_MS });
});

afterAll(async () => {
  await server.close();
});

function walledUrl(): string {
  return `${server.origin}/walled/nvidia-custom-silicon`;
}

async function alternativesFor(body: unknown): Promise<Response> {
  return fetch(`${server.origin}/v1/alternatives`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('the dummy server list route', () => {
  it('serves the list with an entity tag of the body', async () => {
    const response = await fetch(`${server.origin}/v1/list`);
    const tag = `"${createHash('sha256')
      .update(await response.clone().text())
      .digest('hex')}"`;

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(tag);
    expect(await response.json()).toEqual(LIST);
  });

  it('answers 304 for the current tag', async () => {
    const first = await fetch(`${server.origin}/v1/list`);
    const tag = first.headers.get('etag') ?? '';
    const response = await fetch(`${server.origin}/v1/list`, {
      headers: { 'if-none-match': tag },
    });

    expect(response.status).toBe(304);
  });

  it('refuses another method', async () => {
    const response = await fetch(`${server.origin}/v1/list`, { method: 'POST' });

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: 'method_not_allowed' });
  });

  it('allows the extension origin on an api answer', async () => {
    const response = await fetch(`${server.origin}/v1/list`);

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('the dummy server alternatives route', () => {
  it('answers the saved results for a listed article', async () => {
    const response = await alternativesFor({ url: walledUrl(), title: '', lang: 'en' });

    expect(response.status).toBe(200);

    const answer = (await response.json()) as {
      query: string;
      degraded: boolean;
      provider: string;
      alternatives: Array<{
        url: string;
        title: string;
        description: string;
        domain: string;
        image?: string;
        favicon?: string;
      }>;
    };

    expect(answer.provider).toBe('dummy');
    expect(answer.degraded).toBe(false);
    expect(answer.query).not.toBe('');
    expect(answer.alternatives).toHaveLength(4);
    expect(answer.alternatives[0]?.image).toContain('/v1/img?u=');
    expect(answer.alternatives[0]?.image).toMatch(/[?&]sig=[0-9a-f]{16}$/);
    expect(answer.alternatives[0]?.favicon).toContain('/v1/img?u=');
    expect(answer.alternatives[0]?.favicon).toMatch(/[?&]sig=[0-9a-f]{16}$/);
  });

  it('signs a favicon link for every row it answers', async () => {
    const answer = (await (
      await alternativesFor({ url: walledUrl(), title: '', lang: 'en' })
    ).json()) as { alternatives: Array<{ favicon?: string }> };

    expect(answer.alternatives.map((row) => row.favicon !== undefined)).toEqual([
      true,
      true,
      true,
      true,
    ]);

    const response = await fetch(answer.alternatives[1]?.favicon ?? '');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('answers an empty result for the empty fixture article', async () => {
    const response = await alternativesFor({
      url: `${server.origin}/walled/empty-state`,
      title: '',
      lang: 'en',
    });
    const answer = (await response.json()) as { alternatives: unknown[] };

    expect(response.status).toBe(200);
    expect(answer.alternatives).toEqual([]);
  });

  it('refuses a body that is not an article', async () => {
    const response = await alternativesFor({ url: 'not a url' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad_request' });
  });

  it('refuses a body that is not JSON', async () => {
    const response = await fetch(`${server.origin}/v1/alternatives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
  });

  it('refuses a get request', async () => {
    const response = await fetch(`${server.origin}/v1/alternatives`);

    expect(response.status).toBe(405);
  });
});

describe('the dummy server image route', () => {
  it('serves a signed image', async () => {
    const answer = (await (
      await alternativesFor({ url: walledUrl(), title: '', lang: 'en' })
    ).json()) as { alternatives: Array<{ image?: string }> };
    const image = answer.alternatives[0]?.image ?? '';

    const response = await fetch(image);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('refuses a wrong signature', async () => {
    const response = await fetch(
      `${server.origin}/v1/img?u=${encodeURIComponent(`${server.origin}/images/preview.png`)}&sig=0000000000000000`,
    );

    expect(response.status).toBe(403);
  });

  it('refuses a request without a source', async () => {
    const response = await fetch(`${server.origin}/v1/img`);

    expect(response.status).toBe(400);
  });
});

describe('the dummy server scenarios', () => {
  it('waits before it answers the slow fixture article', async () => {
    const started = Date.now();
    const response = await alternativesFor({
      url: `${server.origin}/walled/slow`,
      title: '',
      lang: 'en',
    });
    const elapsed = Date.now() - started;
    const answer = (await response.json()) as { alternatives: unknown[] };

    expect(response.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(TEST_SLOW_MS / 2);
    expect(answer.alternatives).toHaveLength(4);
  });

  it('fails the answer of the failing fixture article', async () => {
    const response = await alternativesFor({
      url: `${server.origin}/walled/fail`,
      title: '',
      lang: 'en',
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'search_failed' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('fails every answer of a run that says so', async () => {
    const failing = await startDummyServer({ port: 0, list: LIST, failAlternatives: true });

    try {
      const response = await fetch(`${failing.origin}/v1/alternatives`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: `${failing.origin}/walled/nvidia-custom-silicon`, lang: 'en' }),
      });

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'search_failed' });
    } finally {
      await failing.close();
    }
  });

  it('serves the two scenario pages', async () => {
    const slow = await fetch(`${server.origin}/walled/slow`);
    const failing = await fetch(`${server.origin}/walled/fail`);

    expect(slow.status).toBe(200);
    expect(await slow.text()).toContain('og:title');
    expect(failing.status).toBe(200);
    expect(await failing.text()).toContain('og:title');
  });
});

describe('the dummy server fixture pages', () => {
  it('serves the walled article with its metadata', async () => {
    const response = await fetch(walledUrl());
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(page).toContain('og:title');
    expect(page).toContain('Nvidia');
  });

  it('serves the article that the extension must leave alone', async () => {
    const response = await fetch(`${server.origin}/open/article`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('The fixture article that is not walled');
  });

  it('serves the two popup pages', async () => {
    expect((await fetch(`${server.origin}/`)).status).toBe(200);
    expect((await fetch(`${server.origin}/privacy`)).status).toBe(200);
  });
});
