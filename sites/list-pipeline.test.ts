import { describe, expect, it } from 'vitest';

import { buildSitesJson } from './list-pipeline';

const NOTE = 'Shows a wall to readers who use an ad blocker.';

const BODY =
  'The article loaded with the extension off and showed a wall over the body. ' +
  'The wall asked the reader to turn off the ad blocker before it lifted. ' +
  'A future check records the exact wording and whether the body stayed reachable.';

function evidenceText(checked: string): string {
  return ['# Publisher', '', `- Checked: ${checked}`, '- Wall: hard', '', BODY, ''].join('\n');
}

function entryYaml(domain: string, name: string, verified = '2026-11-12'): string {
  return [
    `  - domain: ${domain}`,
    `    name: ${name}`,
    '    wall: hard',
    '    paths: []',
    `    note: ${NOTE}`,
    `    verified: ${verified}`,
    `    evidence: sites/evidence/${domain}.md`,
  ].join('\n');
}

function listYaml(...entries: string[]): string {
  return ['version: 1', 'updated: 2026-11-12', 'sites:', ...entries].join('\n');
}

const DEV_NOTE = 'Local fixture page for development; it is not a publisher.';

function devEntryYaml(domain = '127.0.0.1', verified = '2026-11-14'): string {
  return [
    `  - domain: ${domain}`,
    '    name: Local fixture',
    '    wall: hard',
    '    paths: ["/walled/*"]',
    `    note: ${DEV_NOTE}`,
    `    verified: ${verified}`,
    `    evidence: sites/evidence/${domain}.md`,
  ].join('\n');
}

function devYaml(...entries: string[]): string {
  return ['sites:', ...entries].join('\n');
}

function readBothEvidence(path: string): string | null {
  if (path === 'sites/evidence/forbes.com.md') {
    return evidenceText('2026-11-12');
  }

  return path === 'sites/evidence/127.0.0.1.md' ? evidenceText('2026-11-14') : null;
}

describe('list build pipeline', () => {
  it('returns the projection for a valid pair', () => {
    const result = buildSitesJson(listYaml(entryYaml('forbes.com', 'Forbes')), (path) =>
      path === 'sites/evidence/forbes.com.md' ? evidenceText('2026-11-12') : null,
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.problems.join('\n'));
    }

    expect(result.json).toEqual({
      version: 1,
      updated: '2026-11-12',
      disabled: false,
      avoid: [],
      prefer: [],
      sites: [
        {
          domain: 'forbes.com',
          name: 'Forbes',
          wall: 'hard',
          paths: [],
          note: NOTE,
          avoid: [],
          prefer: [],
        },
      ],
    });
  });

  it('reports a schema problem with its dotted path', () => {
    const entry = [
      '  - domain: forbes.com',
      '    wall: hard',
      '    paths: []',
      `    note: ${NOTE}`,
      '    verified: 2026-11-12',
      '    evidence: sites/evidence/forbes.com.md',
    ].join('\n');

    const result = buildSitesJson(listYaml(entry), () => evidenceText('2026-11-12'));

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('expected the list to fail');
    }

    expect(result.problems.some((problem) => problem.startsWith('sites.0.name: '))).toBe(true);
  });

  it('reports the evidence problem of the entry', () => {
    const result = buildSitesJson(listYaml(entryYaml('forbes.com', 'Forbes')), () => null);

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('expected the list to fail');
    }

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/^sites\/evidence\/forbes\.com\.md: /);
  });

  it('keeps one problem list, in entry order', () => {
    const yaml = listYaml(entryYaml('cnet.com', 'CNET'), entryYaml('newsweek.com', 'Newsweek'));
    const short = ['# CNET', '', '- Checked: 2026-11-11', '- Wall: soft', ''].join('\n');

    const result = buildSitesJson(yaml, (path) =>
      path === 'sites/evidence/cnet.com.md' ? short : null,
    );

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('expected the list to fail');
    }

    expect(result.problems).toHaveLength(3);
    expect(result.problems[0]).toMatch(/^sites\/evidence\/cnet\.com\.md: /);
    expect(result.problems[1]).toMatch(/^sites\/evidence\/cnet\.com\.md: /);
    expect(result.problems[2]).toMatch(/^sites\/evidence\/newsweek\.com\.md: /);
  });

  it('reports a YAML syntax error as a sites.yaml problem', () => {
    const result = buildSitesJson('version: [1\n', () => null);

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('expected the list to fail');
    }

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/^sites\.yaml: /);
  });

  it('appends the overlay entries to the release entries', () => {
    const base = [
      'version: 7',
      'updated: 2026-11-12',
      'disabled: true',
      'avoid:',
      '  - domain: dailymail.co.uk',
      'prefer:',
      '  - domain: reuters.com',
      'sites:',
      entryYaml('forbes.com', 'Forbes'),
    ].join('\n');

    const result = buildSitesJson(base, readBothEvidence, devYaml(devEntryYaml()));

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.problems.join('\n'));
    }

    expect(result.json.sites.map((site) => site.domain)).toEqual(['forbes.com', '127.0.0.1']);
    expect(result.json.version).toBe(7);
    expect(result.json.disabled).toBe(true);
    expect(result.json.avoid).toEqual([{ domain: 'dailymail.co.uk' }]);
    expect(result.json.prefer).toEqual([{ domain: 'reuters.com' }]);
  });

  it('moves the updated date to the latest overlay check', () => {
    const result = buildSitesJson(
      listYaml(entryYaml('forbes.com', 'Forbes')),
      readBothEvidence,
      devYaml(devEntryYaml()),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.problems.join('\n'));
    }

    expect(result.json.updated).toBe('2026-11-14');
  });

  it('rejects an overlay entry without its evidence', () => {
    const result = buildSitesJson(
      listYaml(entryYaml('forbes.com', 'Forbes')),
      (path) => (path === 'sites/evidence/forbes.com.md' ? evidenceText('2026-11-12') : null),
      devYaml(devEntryYaml()),
    );

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('expected the list to fail');
    }

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/^sites\/evidence\/127\.0\.0\.1\.md: /);
  });

  it('reports a malformed overlay under its own file name', () => {
    const result = buildSitesJson(
      listYaml(entryYaml('forbes.com', 'Forbes')),
      readBothEvidence,
      'sites: [\n',
    );

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('expected the list to fail');
    }

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/^sites\.dev\.yaml: /);
  });

  it('refuses an overlay domain that repeats a release domain', () => {
    const result = buildSitesJson(
      listYaml(entryYaml('forbes.com', 'Forbes')),
      readBothEvidence,
      devYaml(devEntryYaml('forbes.com')),
    );

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('expected the list to fail');
    }

    expect(
      result.problems.some((problem) => problem.includes('duplicate site domain forbes.com')),
    ).toBe(true);
  });
});
