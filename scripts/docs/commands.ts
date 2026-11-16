import type { DocFile, DocProblem } from './markdown';
import { codesIn } from './markdown';

export const PNPM_BUILT_INS: readonly string[] = [
  'add',
  'audit',
  'config',
  'create',
  'dedupe',
  'deploy',
  'dlx',
  'env',
  'exec',
  'fetch',
  'i',
  'import',
  'init',
  'install',
  'licenses',
  'link',
  'list',
  'ls',
  'outdated',
  'pack',
  'patch',
  'patch-commit',
  'prune',
  'publish',
  'rb',
  'rebuild',
  'recursive',
  'remove',
  'rm',
  'root',
  'run',
  'server',
  'setup',
  'store',
  'un',
  'uninstall',
  'unlink',
  'up',
  'update',
  'why',
];

const PNPM_COMMAND = /\bpnpm\s+(?:run\s+)?([a-z][\w:.-]*)/gi;

export function checkCommands(
  docs: readonly DocFile[],
  scriptNames: readonly string[],
): DocProblem[] {
  const known = new Set([...scriptNames, ...PNPM_BUILT_INS]);
  const problems: DocProblem[] = [];

  for (const doc of docs) {
    for (const chunk of codesIn(doc.text)) {
      for (const line of chunk.text.split('\n')) {
        for (const match of line.matchAll(PNPM_COMMAND)) {
          const name = match[1];

          if (name !== undefined && !known.has(name)) {
            problems.push({
              path: doc.path,
              line: chunk.line,
              message: `missing script: ${name}`,
            });
          }
        }
      }
    }
  }

  return problems;
}
