import { describe, expect, it } from 'vitest';

import { compareVersions, parseVersion, versionProblem } from './version';

describe('a store version', () => {
  it('reads one to four numbers', () => {
    expect(parseVersion('1')).toEqual([1]);
    expect(parseVersion('0.1.0')).toEqual([0, 1, 0]);
    expect(parseVersion('1.2.3.4')).toEqual([1, 2, 3, 4]);
    expect(parseVersion('0.1.0-beta')).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('1.2.3.4.5')).toBeNull();
  });

  it('compares the numbers, not the text', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.2', '1.0')).toBe(-1);
  });

  it('takes a missing trailing number as zero', () => {
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
    expect(compareVersions('1', '1.0.0.0')).toBe(0);
  });

  it('accepts the first upload, when the store has no version', () => {
    expect(versionProblem(null, '0.1.0')).toBeNull();
  });

  it('accepts a version above the published one', () => {
    expect(versionProblem('0.1.0', '0.1.1')).toBeNull();
  });

  it('refuses the version that the store already has', () => {
    expect(versionProblem('0.1.0', '0.1.0')).toContain('increase the version');
  });

  it('refuses a version below the published one', () => {
    expect(versionProblem('0.2.0', '0.1.9')).toContain('0.1.9 and the store already has 0.2.0');
  });

  it('refuses a version that it cannot compare', () => {
    expect(versionProblem('draft', '0.1.0')).toContain('the run cannot compare');
    expect(versionProblem('0.1.0', 'draft')).toContain('not a version');
  });
});
