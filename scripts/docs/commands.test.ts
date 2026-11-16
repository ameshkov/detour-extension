import { describe, expect, it } from 'vitest';

import { checkCommands } from './commands';
import type { DocFile } from './markdown';

function docsWith(text: string): DocFile[] {
  return [{ path: 'README.md', text }];
}

describe('document commands', () => {
  it('accepts a script that package.json carries', () => {
    expect(checkCommands(docsWith('Run `pnpm test`.\n'), ['test'])).toEqual([]);
  });

  it('rejects a script that package.json does not carry', () => {
    const problems = checkCommands(docsWith('Run `pnpm nope`.\n'), ['test']);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toBe('missing script: nope');
  });

  it('ignores a pnpm built-in', () => {
    expect(checkCommands(docsWith('Run `pnpm install`.\n'), [])).toEqual([]);
  });

  it('ignores a flag before the script name', () => {
    expect(checkCommands(docsWith('Run `pnpm --filter ./packages/worker deploy`.\n'), [])).toEqual(
      [],
    );
  });

  it('ignores prose outside a code span', () => {
    expect(checkCommands(docsWith('We run pnpm deploy by hand.\n'), [])).toEqual([]);
  });

  it('reads a script name from a fenced block', () => {
    const problems = checkCommands(docsWith('# Title\n\n```bash\npnpm missing\n```\n'), []);

    expect(problems).toEqual([{ path: 'README.md', line: 3, message: 'missing script: missing' }]);
  });

  it('accepts a command with an argument', () => {
    expect(checkCommands(docsWith('Run `pnpm smoke <url>`.\n'), ['smoke'])).toEqual([]);
  });
});
