import { describe, expect, it } from 'vitest';

import { renderListFormat } from '@detour/shared/list-format';

import { LIST_FORMAT_DOC, checkGeneratedDoc } from './generated-doc';

describe('generated document', () => {
  it('accepts the current generated document', () => {
    expect(checkGeneratedDoc(`${renderListFormat()}\n`)).toEqual([]);
  });

  it('rejects a stale generated document', () => {
    const problems = checkGeneratedDoc(`${renderListFormat()}\nolder\n`);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.path).toBe(LIST_FORMAT_DOC);
    expect(problems[0]?.line).toBe(1);
    expect(problems[0]?.message.startsWith('stale generated file: ')).toBe(true);
    expect(problems[0]?.message.endsWith('Run pnpm docs:generate.')).toBe(true);
  });

  it('rejects a missing generated document', () => {
    const problems = checkGeneratedDoc(null);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.path).toBe(LIST_FORMAT_DOC);
    expect(problems[0]?.line).toBe(1);
    expect(problems[0]?.message.startsWith('missing generated file: ')).toBe(true);
  });
});
