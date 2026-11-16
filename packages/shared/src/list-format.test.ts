import { describe, expect, it } from 'vitest';

import { renderListFormat } from './list-format';

function rowOf(text: string, field: string): string {
  const line = text.split('\n').find((candidate) => candidate.startsWith(`| ${field} |`));

  if (line === undefined) {
    throw new Error(`no table row for ${field}`);
  }

  return line;
}

function cellsOf(row: string): string[] {
  return row.split('|').map((cell) => cell.trim());
}

describe('list format reference', () => {
  it('lists every field of the three objects', () => {
    const text = renderListFormat();

    for (const field of [
      'version',
      'updated',
      'disabled',
      'avoid',
      'prefer',
      'sites',
      'domain',
      'name',
      'wall',
      'paths',
      'note',
      'verified',
      'evidence',
    ]) {
      expect(rowOf(text, field)).toBeTypeOf('string');
    }
  });

  it('marks a defaulted field as not required', () => {
    const cells = cellsOf(rowOf(renderListFormat(), 'disabled'));

    expect(cells[3]).toBe('no');
  });

  it('prints the wall values from the schema', () => {
    const row = rowOf(renderListFormat(), 'wall');

    expect(row).toContain('hard');
    expect(row).toContain('soft');
    expect(row).toContain('metered');
  });

  it('names the regenerate command in the header', () => {
    const text = renderListFormat();
    const header = text.split('\n').find((line) => line.includes('pnpm docs:generate'));

    expect(header).toBeDefined();
    expect(header).toContain('Generated from the schema.');
  });

  it('is stable across two calls', () => {
    expect(renderListFormat()).toBe(renderListFormat());
  });
});
