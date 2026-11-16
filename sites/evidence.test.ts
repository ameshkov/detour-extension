import { describe, expect, it } from 'vitest';

import { SiteEntrySchema } from '@detour/shared';

import { EVIDENCE_MIN_CHARS, checkEvidence } from './evidence';

const entry = SiteEntrySchema.parse({
  domain: 'forbes.com',
  name: 'Forbes',
  wall: 'hard',
  paths: [],
  note: 'Full-page wall for readers with an ad blocker.',
  verified: '2026-11-01',
  evidence: 'sites/evidence/forbes.com.md',
});

const BODY =
  'The article loaded with the extension off and showed a wall over the body. ' +
  'The wall asked the reader to turn off the ad blocker before it lifted. ' +
  'A future check records the exact wording and whether the body stayed reachable.';

const validEvidence = [
  '# Forbes',
  '',
  '- Domain: forbes.com',
  '- Checked: 2026-11-01',
  '- Wall: hard',
  '',
  BODY,
  '',
].join('\n');

describe('evidence check', () => {
  it('accepts evidence that matches the entry', () => {
    expect(checkEvidence(entry, validEvidence)).toEqual([]);
  });

  it('rejects a missing evidence file', () => {
    const problems = checkEvidence(entry, null);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/missing/);
  });

  it('rejects evidence without a checked line', () => {
    const text = validEvidence.replace('- Checked: 2026-11-01\n', '');

    const problems = checkEvidence(entry, text);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Checked/);
  });

  it('rejects evidence whose checked date differs from the verified date', () => {
    const text = validEvidence.replace('- Checked: 2026-11-01', '- Checked: 2026-10-31');

    const problems = checkEvidence(entry, text);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('2026-10-31');
    expect(problems[0]).toContain('2026-11-01');
  });

  it('rejects evidence shorter than two hundred characters', () => {
    const text = [
      '# Forbes',
      '',
      '- Checked: 2026-11-01',
      '',
      'Too short to record what the wall showed.',
      '',
    ].join('\n');

    expect(text.length).toBeLessThan(EVIDENCE_MIN_CHARS);

    const problems = checkEvidence(entry, text);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(String(EVIDENCE_MIN_CHARS));
  });
});
