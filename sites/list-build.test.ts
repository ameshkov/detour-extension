import { describe, expect, it } from 'vitest';

import { buildList } from './list-build';

const site = {
  domain: 'forbes.com',
  name: 'Forbes',
  walls: [{ category: 'adblock', type: 'hard' }],
  paths: [],
  note: 'Full-page wall for readers with an ad blocker.',
};

const release = { disabled: false, avoid: [], prefer: [], sites: [site] };

function overlay(yaml: string): string {
  return yaml;
}

describe('the list build', () => {
  it('accepts the release artifact as served', () => {
    const result = buildList(release);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.list.sites[0]).toMatchObject(site);
    }
  });

  it('rejects an artifact that the schema refuses', () => {
    const result = buildList({ ...release, sites: [{ ...site, walls: [] }] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContainEqual(expect.stringMatching(/^sites\.0\.walls: /));
    }
  });

  it('appends the overlay to the release list', () => {
    const result = buildList(
      release,
      overlay(`
sites:
  - domain: 127.0.0.1
    name: Local fixture
    walls:
      - category: adblock
        type: hard
      - category: paywall
        type: metered
    paths: ['/walled/*']
    note: Local fixture page for development; it is not a publisher.
`),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.list.sites.map((entry) => entry.domain)).toEqual(['forbes.com', '127.0.0.1']);
      expect(result.list.sites[1]?.walls).toHaveLength(2);
    }
  });

  it('rejects an overlay entry that repeats a release domain', () => {
    const result = buildList(
      release,
      overlay(`
sites:
  - domain: forbes.com
    name: Forbes again
    walls:
      - category: adblock
        type: hard
    note: A duplicate entry.
`),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContainEqual(expect.stringMatching(/^sites\.1\.domain: /));
    }
  });

  it('rejects an overlay entry with a metered wall outside the paywall category', () => {
    const result = buildList(
      release,
      overlay(`
sites:
  - domain: 127.0.0.1
    name: Local fixture
    walls:
      - category: region
        type: metered
    note: A bad overlay entry.
`),
    );

    expect(result.ok).toBe(false);
  });

  it('names the overlay file in a problem', () => {
    const result = buildList(release, overlay('sites: []'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContainEqual(expect.stringMatching(/^sites\.dev\.yaml: sites: /));
    }
  });
});
