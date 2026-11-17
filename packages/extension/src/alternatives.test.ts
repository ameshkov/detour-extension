import { describe, expect, it } from 'vitest';

import type { Alternative, AlternativesAnswer } from './alternatives';
import { parseAlternativesAnswer, requestAlternatives } from './alternatives';
import type { PageMeta } from './metadata';
import type { FetchLike } from './net';

const API_BASE = 'https://api.test';
const URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';

const META: PageMeta = {
  title: "Nvidia's Next Move: Inside the $50 Billion Bet on Custom Silicon",
  description: 'The chipmaker is designing silicon for its largest customers.',
};

type RequestInitRecord = { input: string; init?: RequestInit };

function jsonFetch(calls: RequestInitRecord[], body: unknown, status = 200): FetchLike {
  return async (input, init) => {
    calls.push({ input, init });

    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function bodyOf(call: RequestInitRecord | undefined): unknown {
  return JSON.parse(String(call?.init?.body));
}

function titlesOf(answer: AlternativesAnswer | null): string[] {
  return (answer?.alternatives ?? []).map((row: Alternative) => row.title);
}

describe('the alternatives answer', () => {
  it('keeps the good alternatives when one is malformed', () => {
    const answer = parseAlternativesAnswer({
      query: 'Nvidia Next Move custom silicon',
      degraded: false,
      provider: 'ceramic',
      alternatives: [
        { url: 'https://a.test/one', title: 'One', description: 'First', domain: 'a.test' },
        { url: 'https://b.test/two', description: 'Second', domain: 'b.test' },
        { url: 'https://c.test/three', title: 'Three', description: 'Third', domain: 'c.test' },
      ],
    });

    expect(answer).not.toBeNull();
    expect(titlesOf(answer)).toEqual(['One', 'Three']);
    expect(answer?.query).toBe('Nvidia Next Move custom silicon');
    expect(answer?.degraded).toBe(false);
    expect(answer?.provider).toBe('ceramic');
  });

  it('drops a non-http url', () => {
    const answer = parseAlternativesAnswer({
      query: 'a query',
      degraded: false,
      provider: 'ceramic',
      alternatives: [
        { url: 'javascript:alert(1)', title: 'Script', description: 'No', domain: 'a.test' },
        { url: 'data:text/html,hi', title: 'Data', description: 'No', domain: 'b.test' },
        { url: 'https://c.test/three', title: 'Three', description: 'Yes', domain: 'c.test' },
      ],
    });

    expect(titlesOf(answer)).toEqual(['Three']);
  });

  it('keeps the favicon and the image the service sends', () => {
    const answer = parseAlternativesAnswer({
      query: 'a query',
      degraded: false,
      provider: 'ceramic',
      alternatives: [
        {
          url: 'https://a.test/one',
          title: 'One',
          description: 'First',
          domain: 'a.test',
          image: 'https://api.test/v1/img?u=x&sig=y',
          favicon: 'https://api.test/v1/img?u=fav&sig=z',
        },
      ],
    });

    expect(answer?.alternatives[0]).toEqual({
      url: 'https://a.test/one',
      title: 'One',
      description: 'First',
      domain: 'a.test',
      image: 'https://api.test/v1/img?u=x&sig=y',
      favicon: 'https://api.test/v1/img?u=fav&sig=z',
    });
  });

  it('drops a favicon that is not an http url and keeps the row', () => {
    const answer = parseAlternativesAnswer({
      query: 'a query',
      degraded: false,
      provider: 'ceramic',
      alternatives: [
        {
          url: 'https://a.test/one',
          title: 'One',
          description: 'First',
          domain: 'a.test',
          favicon: 'javascript:alert(1)',
        },
      ],
    });

    expect(titlesOf(answer)).toEqual(['One']);
    expect(answer?.alternatives[0]).not.toHaveProperty('favicon');
  });

  it('posts the url, the title, and the language without the description', async () => {
    const calls: RequestInitRecord[] = [];
    const body = { query: 'q', degraded: false, provider: 'ceramic', alternatives: [] };

    const answer = await requestAlternatives({
      apiBase: API_BASE,
      url: URL,
      title: META.title ?? '',
      fetchImpl: jsonFetch(calls, body),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(`${API_BASE}/v1/alternatives`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe('application/json');
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(bodyOf(calls[0])).toEqual({
      url: URL,
      title: META.title,
      lang: 'en',
    });
    expect(JSON.stringify(bodyOf(calls[0]))).not.toContain('description');
    expect(answer).toEqual(body);

    const withoutMeta: RequestInitRecord[] = [];

    await requestAlternatives({
      apiBase: API_BASE,
      url: URL,
      title: '',
      fetchImpl: jsonFetch(withoutMeta, body),
    });

    expect(bodyOf(withoutMeta[0])).toEqual({ url: URL, title: '', lang: 'en' });

    const absentTitle: RequestInitRecord[] = [];

    await requestAlternatives({
      apiBase: API_BASE,
      url: URL,
      title: '',
      fetchImpl: jsonFetch(absentTitle, body),
    });

    expect(bodyOf(absentTitle[0])).toEqual({ url: URL, title: '', lang: 'en' });
  });
});
