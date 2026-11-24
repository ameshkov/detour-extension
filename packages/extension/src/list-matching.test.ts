import { describe, expect, it } from 'vitest';

import type { SitesJson } from '@detour/shared';

import { findSite } from './list-matching';

describe('list matching', () => {
  it('finds a site by its host', () => {
    const list = {
      disabled: false,
      avoid: [],
      prefer: [],
      sites: [
        {
          domain: 'forbes.com',
          name: 'Forbes',
          walls: [{ category: 'adblock', type: 'hard' }],
          paths: [],
          note: 'A wall.',
          avoid: [],
          prefer: [],
        },
      ],
    } satisfies SitesJson;

    expect(findSite(list, 'https://forbes.com/sites/a/')?.domain).toBe('forbes.com');
  });

  it('finds a site on a subdomain', () => {
    const list = {
      disabled: false,
      avoid: [],
      prefer: [],
      sites: [
        {
          domain: 'forbes.com',
          name: 'Forbes',
          walls: [{ category: 'adblock', type: 'hard' }],
          paths: [],
          note: 'A wall.',
          avoid: [],
          prefer: [],
        },
      ],
    } satisfies SitesJson;

    expect(findSite(list, 'https://www.forbes.com/sites/a/')?.name).toBe('Forbes');
  });

  it('leaves a lookalike host alone', () => {
    const list = {
      disabled: false,
      avoid: [],
      prefer: [],
      sites: [
        {
          domain: 'forbes.com',
          name: 'Forbes',
          walls: [{ category: 'adblock', type: 'hard' }],
          paths: [],
          note: 'A wall.',
          avoid: [],
          prefer: [],
        },
      ],
    } satisfies SitesJson;

    expect(findSite(list, 'https://notforbes.com/sites/a/')).toBeNull();
  });

  it('matches only the listed path', () => {
    const list = {
      disabled: false,
      avoid: [],
      prefer: [],
      sites: [
        {
          domain: 'example.com',
          name: 'Example',
          walls: [{ category: 'adblock', type: 'soft' }],
          paths: ['/walled/*'],
          note: 'A wall on one path.',
          avoid: [],
          prefer: [],
        },
      ],
    } satisfies SitesJson;

    expect(findSite(list, 'https://example.com/walled/a')?.domain).toBe('example.com');
    expect(findSite(list, 'https://example.com/open/a')).toBeNull();
  });

  it('matches the whole site with no paths', () => {
    const list = {
      disabled: false,
      avoid: [],
      prefer: [],
      sites: [
        {
          domain: 'example.com',
          name: 'Example',
          walls: [{ category: 'paywall', type: 'metered' }],
          paths: [],
          note: 'A wall on the whole site.',
          avoid: [],
          prefer: [],
        },
      ],
    } satisfies SitesJson;

    expect(findSite(list, 'https://example.com/one/two/three')?.domain).toBe('example.com');
  });

  it('answers null for a value that is not a url', () => {
    const list = {
      disabled: false,
      avoid: [],
      prefer: [],
      sites: [
        {
          domain: 'forbes.com',
          name: 'Forbes',
          walls: [{ category: 'adblock', type: 'hard' }],
          paths: [],
          note: 'A wall.',
          avoid: [],
          prefer: [],
        },
      ],
    } satisfies SitesJson;

    expect(findSite(list, 'not a url')).toBeNull();
  });

  it('answers null for a site that is not listed', () => {
    const list = {
      disabled: false,
      avoid: [],
      prefer: [],
      sites: [
        {
          domain: 'forbes.com',
          name: 'Forbes',
          walls: [{ category: 'adblock', type: 'hard' }],
          paths: [],
          note: 'A wall.',
          avoid: [],
          prefer: [],
        },
      ],
    } satisfies SitesJson;

    expect(findSite(list, 'https://example.com/story')).toBeNull();
  });
});
