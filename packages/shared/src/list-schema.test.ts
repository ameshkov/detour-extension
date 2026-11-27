import { describe, expect, it } from 'vitest';

import { SitesJsonSchema } from './list-schema';

const validSite = {
  domain: 'forbes.com',
  name: 'Forbes',
  walls: [{ category: 'adblock', type: 'hard' }],
  paths: [],
  note: 'Full-page wall for readers with an ad blocker.',
};

const validList = { sites: [validSite] };

function siteWithout(key: keyof typeof validSite): Record<string, unknown> {
  const site: Record<string, unknown> = { ...validSite };
  delete site[key];

  return site;
}

function issuesOf(input: unknown): string[] {
  const result = SitesJsonSchema.safeParse(input);

  if (result.success) {
    throw new Error('expected the list to fail validation');
  }

  return result.error.issues.map(
    (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
  );
}

describe('the served list schema', () => {
  it('accepts the artifact that a backend serves', () => {
    const list = SitesJsonSchema.parse({
      disabled: true,
      avoid: [{ domain: 'dailymail.co.uk' }],
      prefer: [{ domain: 'reuters.com' }],
      sites: [
        {
          ...validSite,
          paths: ['/walled/*'],
          alternatives: [{ domain: 'reuters.com', name: 'Reuters' }],
          avoid: [{ domain: 'yahoo.com' }],
          prefer: [{ domain: 'fortune.com' }],
        },
      ],
    });

    expect(list.disabled).toBe(true);
    expect(list.avoid).toEqual([{ domain: 'dailymail.co.uk' }]);
    expect(list.prefer).toEqual([{ domain: 'reuters.com' }]);
    expect(list.sites[0]).toEqual({
      ...validSite,
      paths: ['/walled/*'],
      avoid: [{ domain: 'yahoo.com' }],
      prefer: [{ domain: 'fortune.com' }],
    });
  });

  it('accepts a list with no version and no update date', () => {
    expect(() => SitesJsonSchema.parse(validList)).not.toThrow();
  });

  it('keeps the checked date and drops evidence and the alternatives', () => {
    const site = {
      ...validSite,
      verified: '2026-11-01',
      evidence: 'https://github.com/ameshkov/detour-list/issues/12#issuecomment-3456',
      alternatives: [{ domain: 'reuters.com', name: 'Reuters' }],
    };

    const list = SitesJsonSchema.parse({ sites: [site] });

    expect(list.sites[0]).toMatchObject({ verified: '2026-11-01' });
    expect(list.sites[0]).not.toHaveProperty('evidence');
    expect(list.sites[0]).not.toHaveProperty('alternatives');
  });

  it('defaults the optional keys', () => {
    const list = SitesJsonSchema.parse(validList);

    expect(list.disabled).toBe(false);
    expect(list.avoid).toEqual([]);
    expect(list.prefer).toEqual([]);
    expect(list.sites[0]?.paths).toEqual([]);
    expect(list.sites[0]?.avoid).toEqual([]);
    expect(list.sites[0]?.prefer).toEqual([]);
  });

  it('accepts an empty list, so an operator can empty it', () => {
    expect(SitesJsonSchema.parse({ sites: [] }).sites).toEqual([]);
  });

  it('accepts several walls on one entry', () => {
    const walls = [
      { category: 'adblock', type: 'soft' },
      { category: 'paywall', type: 'metered' },
    ];
    const list = SitesJsonSchema.parse({ sites: [{ ...validSite, walls }] });

    expect(list.sites[0]?.walls).toEqual(walls);
  });

  it('rejects a wall type outside the list', () => {
    const issues = issuesOf({
      sites: [{ ...validSite, walls: [{ category: 'adblock', type: 'subscription' }] }],
    });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.walls\.0\.type: /));
  });

  it('rejects a wall category outside the list', () => {
    const issues = issuesOf({
      sites: [{ ...validSite, walls: [{ category: 'ads', type: 'hard' }] }],
    });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.walls\.0\.category: /));
  });

  it('rejects an entry without a wall', () => {
    const issues = issuesOf({ sites: [{ ...validSite, walls: [] }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.walls: /));
  });

  it('rejects a category that appears twice', () => {
    const walls = [
      { category: 'adblock', type: 'soft' },
      { category: 'adblock', type: 'hard' },
    ];
    const issues = issuesOf({ sites: [{ ...validSite, walls }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.walls\.1\.category: /));
  });

  it('rejects a metered wall that is not a paywall', () => {
    const issues = issuesOf({
      sites: [{ ...validSite, walls: [{ category: 'region', type: 'metered' }] }],
    });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.walls\.0\.category: /));
  });

  it('accepts a metered paywall', () => {
    const walls = [{ category: 'paywall', type: 'metered' }];
    const list = SitesJsonSchema.parse({ sites: [{ ...validSite, walls }] });

    expect(list.sites[0]?.walls).toEqual(walls);
  });

  it('rejects an entry without a note', () => {
    const issues = issuesOf({ sites: [siteWithout('note')] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.note: /));
  });

  it('rejects a note longer than 200 characters', () => {
    const issues = issuesOf({ sites: [{ ...validSite, note: 'a'.repeat(201) }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.note: /));
  });

  it('rejects a domain with a scheme, a path, or a port', () => {
    for (const domain of ['https://forbes.com', 'forbes.com/news', 'forbes.com:8080']) {
      const issues = issuesOf({ sites: [{ ...validSite, domain }] });

      expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.domain: /));
    }
  });

  it('accepts a numeric or punycode host, which the local overlay names', () => {
    for (const domain of ['127.0.0.1', 'xn--e1afmkfd.xn--p1ai']) {
      expect(SitesJsonSchema.parse({ sites: [{ ...validSite, domain }] }).sites[0]?.domain).toBe(
        domain,
      );
    }
  });

  it('rejects a domain with a www prefix', () => {
    const issues = issuesOf({ sites: [{ ...validSite, domain: 'www.forbes.com' }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.domain: /));
  });

  it('rejects a path glob that does not start with a slash', () => {
    const issues = issuesOf({ sites: [{ ...validSite, paths: ['walled/*'] }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.paths\.0: /));
  });

  it('rejects a path glob with a query or a fragment', () => {
    for (const glob of ['/walled?x=1', '/walled#top']) {
      const issues = issuesOf({ sites: [{ ...validSite, paths: [glob] }] });

      expect(issues).toContainEqual(expect.stringMatching(/^sites\.0\.paths\.0: /));
    }
  });

  it('rejects two entries with the same domain', () => {
    const issues = issuesOf({ sites: [validSite, { ...validSite, name: 'Forbes Media' }] });

    expect(issues).toContainEqual(expect.stringMatching(/^sites\.1\.domain: /));
  });

  it('reports every issue with its dotted path', () => {
    const issues = issuesOf({
      sites: [{ ...siteWithout('name'), walls: [{ category: 'ads', type: 'hard' }] }],
    });

    expect(issues.some((issue) => issue.startsWith('sites.0.name: '))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('sites.0.walls.0.category: '))).toBe(true);
  });
});
