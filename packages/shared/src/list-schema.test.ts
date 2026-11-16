import { describe, expect, it } from 'vitest';

import { ListValidationError, parseSiteList } from './list-schema';

const validEntry = {
  domain: 'forbes.com',
  name: 'Forbes',
  wall: 'hard',
  paths: [],
  note: 'Full-page wall for readers with an ad blocker.',
  verified: '2026-11-01',
  evidence: 'sites/evidence/forbes.com.md',
};

const validList = {
  version: 1,
  updated: '2026-11-12',
  sites: [validEntry],
};

function entryWithout(key: keyof typeof validEntry): Record<string, unknown> {
  const entry: Record<string, unknown> = { ...validEntry };
  delete entry[key];

  return entry;
}

function issuesOf(input: unknown): string[] {
  try {
    parseSiteList(input);
  } catch (error) {
    if (error instanceof ListValidationError) {
      return error.issues;
    }
    throw error;
  }
  throw new Error('expected the list to fail validation');
}

describe('site list schema', () => {
  it('accepts a complete list', () => {
    const list = parseSiteList({
      version: 2,
      updated: '2026-11-12',
      disabled: true,
      avoid: [{ domain: 'dailymail.co.uk' }],
      prefer: [{ domain: 'reuters.com' }],
      sites: [
        {
          ...validEntry,
          paths: ['/walled/*'],
          avoid: [{ domain: 'yahoo.com' }],
          prefer: [{ domain: 'fortune.com' }],
        },
      ],
    });

    expect(list.version).toBe(2);
    expect(list.updated).toBe('2026-11-12');
    expect(list.disabled).toBe(true);
    expect(list.avoid).toEqual([{ domain: 'dailymail.co.uk' }]);
    expect(list.prefer).toEqual([{ domain: 'reuters.com' }]);
    expect(list.sites[0]).toEqual({
      ...validEntry,
      paths: ['/walled/*'],
      avoid: [{ domain: 'yahoo.com' }],
      prefer: [{ domain: 'fortune.com' }],
    });
  });

  it('defaults the optional keys', () => {
    const list = parseSiteList(validList);

    expect(list.disabled).toBe(false);
    expect(list.avoid).toEqual([]);
    expect(list.prefer).toEqual([]);
    expect(list.sites[0]?.paths).toEqual([]);
    expect(list.sites[0]?.avoid).toEqual([]);
    expect(list.sites[0]?.prefer).toEqual([]);
  });

  it('rejects a version below one', () => {
    const issues = issuesOf({ ...validList, version: 0 });

    expect(issues).toContainEqual(expect.stringMatching(/^version: /));
  });

  it('rejects an unknown wall type', () => {
    const issues = issuesOf({ ...validList, sites: [{ ...validEntry, wall: 'paywall' }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.wall: /));
  });

  it('rejects an entry without a note', () => {
    const issues = issuesOf({ ...validList, sites: [entryWithout('note')] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.note: /));
  });

  it('rejects an entry without a verified date', () => {
    const issues = issuesOf({ ...validList, sites: [entryWithout('verified')] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.verified: /));
  });

  it('rejects a date that is not a calendar date', () => {
    const issues = issuesOf({ ...validList, sites: [{ ...validEntry, verified: '2026-02-30' }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.verified: /));
  });

  it('rejects a domain with a scheme, a path, or a port', () => {
    for (const domain of ['https://forbes.com', 'forbes.com/news', 'forbes.com:8080']) {
      const issues = issuesOf({ ...validList, sites: [{ ...validEntry, domain }] });

      expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.domain: /));
    }
  });

  it('accepts a numeric or punycode host', () => {
    for (const domain of ['127.0.0.1', 'xn--e1afmkfd.xn--p1ai']) {
      const list = { ...validList, sites: [{ ...validEntry, domain }] };

      expect(parseSiteList(list).sites[0]?.domain).toBe(domain);
    }
  });

  it('rejects a domain with a www prefix', () => {
    const issues = issuesOf({ ...validList, sites: [{ ...validEntry, domain: 'www.forbes.com' }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.domain: /));
  });

  it('rejects a path glob that does not start with a slash', () => {
    const issues = issuesOf({ ...validList, sites: [{ ...validEntry, paths: ['walled/*'] }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.paths\.0: /));
  });

  it('rejects a path glob with a query or a fragment', () => {
    for (const glob of ['/walled?x=1', '/walled#top']) {
      const issues = issuesOf({ ...validList, sites: [{ ...validEntry, paths: [glob] }] });

      expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.paths\.0: /));
    }
  });

  it('rejects an empty site list', () => {
    const issues = issuesOf({ ...validList, sites: [] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites: /));
  });

  it('rejects two entries with the same domain', () => {
    const issues = issuesOf({
      ...validList,
      sites: [validEntry, { ...validEntry, name: 'Forbes Media' }],
    });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.1\.domain: /));
  });

  it('rejects an entry whose domain is in the global avoid list', () => {
    const issues = issuesOf({ ...validList, avoid: [{ domain: 'forbes.com' }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.domain: /));
  });

  it('rejects an entry whose domain is in the global prefer list', () => {
    const issues = issuesOf({ ...validList, prefer: [{ domain: 'forbes.com' }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.domain: /));
  });

  it('rejects an evidence path outside the evidence folder', () => {
    for (const evidence of ['evidence/forbes.com.md', 'sites/evidence/forbes.txt']) {
      const issues = issuesOf({ ...validList, sites: [{ ...validEntry, evidence }] });

      expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.evidence: /));
    }
  });

  it('rejects an updated date before a verified date', () => {
    const issues = issuesOf({ ...validList, updated: '2026-10-31' });

    expect(issues).toContainEqual(expect.stringMatching(/^updated: /));
  });

  it('reports every issue with its dotted path', () => {
    const issues = issuesOf({
      ...validList,
      sites: [{ ...entryWithout('name'), wall: 'paywall' }],
    });

    expect(issues.some((issue) => issue.startsWith('sites.0.name: '))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('sites.0.wall: '))).toBe(true);
  });
});
