import { describe, expect, it } from 'vitest';

import type { SiteList } from './list-schema';
import { parseSiteList } from './list-schema';
import { findListedSite, hostMatches, pathMatches } from './match';

const baseEntry = {
  domain: 'forbes.com',
  name: 'Forbes',
  wall: 'hard',
  note: 'Full-page wall for readers with an ad blocker.',
  verified: '2026-11-01',
  evidence: 'sites/evidence/forbes.com.md',
};

type SiteInput = Omit<typeof baseEntry, 'domain'> & { domain: string; paths?: string[] };

function listOf(sites: SiteInput[]): SiteList {
  return parseSiteList({ version: 1, updated: '2026-11-12', sites });
}

describe('host matching', () => {
  it('matches the exact host', () => {
    expect(hostMatches('forbes.com', 'forbes.com')).toBe(true);
  });

  it('matches a subdomain of a listed domain', () => {
    expect(hostMatches('www.forbes.com', 'forbes.com')).toBe(true);
    expect(hostMatches('a.b.forbes.com', 'forbes.com')).toBe(true);
  });

  it('does not match a domain that only ends with the same text', () => {
    expect(hostMatches('notforbes.com', 'forbes.com')).toBe(false);
  });

  it('ignores letter case and a trailing dot in the host', () => {
    expect(hostMatches('WWW.Forbes.COM.', 'forbes.com')).toBe(true);
    expect(hostMatches('www.forbes.com', 'Forbes.com')).toBe(true);
  });
});

describe('path matching', () => {
  it('matches any path when the glob list is empty', () => {
    expect(pathMatches('/anything/at/all', [])).toBe(true);
  });

  it('matches a single-segment glob', () => {
    expect(pathMatches('/walled/a', ['/walled/*'])).toBe(true);
    expect(pathMatches('/walled/a/b', ['/walled/*'])).toBe(false);
  });

  it('matches a cross-segment glob', () => {
    expect(pathMatches('/sites/a/b', ['/sites/**'])).toBe(true);
  });

  it('keeps a glob star inside one segment', () => {
    expect(pathMatches('/a/b/c', ['/a/*/c'])).toBe(true);
    expect(pathMatches('/a/b/d/c', ['/a/*/c'])).toBe(false);
  });

  it('treats every other character as literal', () => {
    expect(pathMatches('/aab', ['/a+b'])).toBe(false);
    expect(pathMatches('/a+b', ['/a+b'])).toBe(true);
    expect(pathMatches('/v1x0', ['/v1.0'])).toBe(false);
    expect(pathMatches('/v1.0', ['/v1.0'])).toBe(true);
  });

  it('matches the whole path only', () => {
    expect(pathMatches('/x/sites/a', ['/sites/*'])).toBe(false);
  });

  it('matches the root path', () => {
    expect(pathMatches('/', ['/'])).toBe(true);
  });

  it('is case sensitive on the path', () => {
    expect(pathMatches('/Walled/a', ['/walled/*'])).toBe(false);
  });
});

describe('finding a listed site', () => {
  it('returns the entry for a listed url', () => {
    const list = listOf([baseEntry]);
    const site = findListedSite(list, 'https://www.forbes.com/business/a');

    expect(site).toEqual(list.sites[0]);
    expect(site?.name).toBe('Forbes');
  });

  it('returns the first matching entry', () => {
    const parent = { ...baseEntry, domain: 'forbes.com', name: 'Forbes' };
    const child = { ...baseEntry, domain: 'business.forbes.com', name: 'Forbes Business' };
    const list = listOf([parent, child]);

    expect(findListedSite(list, 'https://business.forbes.com/a')?.name).toBe('Forbes');
  });

  it('returns null for an unlisted host', () => {
    const list = listOf([baseEntry]);

    expect(findListedSite(list, 'https://example.com/business/a')).toBeNull();
  });

  it('returns null for a listed host on an unlisted path', () => {
    const list = listOf([{ ...baseEntry, paths: ['/walled/*'] }]);

    expect(findListedSite(list, 'https://forbes.com/other')).toBeNull();
  });

  it('ignores the query and the fragment of the url', () => {
    const list = listOf([{ ...baseEntry, paths: ['/walled/*'] }]);
    const site = findListedSite(list, 'https://forbes.com/walled/a?x=1#top');

    expect(site?.domain).toBe('forbes.com');
  });

  it('returns null for a url that is not http or https', () => {
    const list = listOf([baseEntry]);

    expect(findListedSite(list, 'ftp://forbes.com/business/a')).toBeNull();
  });

  it('returns null for a url that does not parse', () => {
    const list = listOf([baseEntry]);

    expect(findListedSite(list, 'not a url')).toBeNull();
  });
});
