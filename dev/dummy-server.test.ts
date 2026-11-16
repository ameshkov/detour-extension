import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SitesJsonSchema } from '@detour/shared';

import type { DummyServer } from './dummy-server';
import { startDummyServer } from './dummy-server';

const LIST = SitesJsonSchema.parse({
  version: 1,
  updated: '2026-11-16',
  disabled: false,
  avoid: [],
  prefer: [],
  sites: [
    {
      domain: '127.0.0.1',
      name: 'Local fixture',
      wall: 'hard',
      paths: ['/walled/*'],
      note: 'A local fixture host.',
      avoid: [],
      prefer: [],
    },
  ],
});

let server: DummyServer;

beforeAll(async () => {
  server = await startDummyServer({ port: 0, list: LIST });
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
  it('serves the list with a version tag', async () => {
    const response = await fetch(`${server.origin}/v1/list`);

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"v1"');
    expect(await response.json()).toEqual(LIST);
  });

  it('answers 304 for the current tag', async () => {
    const response = await fetch(`${server.origin}/v1/list`, {
      headers: { 'if-none-match': '"v1"' },
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
      }>;
    };

    expect(answer.provider).toBe('dummy');
    expect(answer.degraded).toBe(false);
    expect(answer.query).not.toBe('');
    expect(answer.alternatives).toHaveLength(4);
    expect(answer.alternatives[0]?.image).toContain('/v1/img?u=');
    expect(answer.alternatives[0]?.image).toMatch(/[?&]sig=[0-9a-f]{16}$/);
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
