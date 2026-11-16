import { describe, expect, it } from 'vitest';

import { parseSiteList } from './list-schema';
import { toSitesJson } from './list-json';

const list = parseSiteList({
  version: 3,
  updated: '2026-11-12',
  disabled: true,
  avoid: [{ domain: 'dailymail.co.uk' }],
  prefer: [{ domain: 'reuters.com' }],
  sites: [
    {
      domain: 'forbes.com',
      name: 'Forbes',
      wall: 'hard',
      paths: ['/sites/**'],
      note: 'Full-page wall for readers with an ad blocker.',
      verified: '2026-11-01',
      evidence: 'sites/evidence/forbes.com.md',
      avoid: [{ domain: 'yahoo.com' }],
      prefer: [{ domain: 'fortune.com' }],
    },
  ],
});

describe('list projection', () => {
  it('drops the editorial fields', () => {
    const json = toSitesJson(list);

    expect(Object.keys(json.sites[0] ?? {}).sort()).toEqual([
      'avoid',
      'domain',
      'name',
      'note',
      'paths',
      'prefer',
      'wall',
    ]);
    expect(json.sites[0]).not.toHaveProperty('verified');
    expect(json.sites[0]).not.toHaveProperty('evidence');
  });

  it('keeps the ranking fields', () => {
    const json = toSitesJson(list);

    expect(json.avoid).toEqual([{ domain: 'dailymail.co.uk' }]);
    expect(json.prefer).toEqual([{ domain: 'reuters.com' }]);
    expect(json.sites[0]?.avoid).toEqual([{ domain: 'yahoo.com' }]);
    expect(json.sites[0]?.prefer).toEqual([{ domain: 'fortune.com' }]);
  });

  it('keeps the list version and the disabled flag', () => {
    const json = toSitesJson(list);

    expect(json.version).toBe(3);
    expect(json.updated).toBe('2026-11-12');
    expect(json.disabled).toBe(true);
  });
});
