import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkCommands } from './docs/commands';
import { checkLinks } from './docs/links';
import { loadDocs } from './docs/load-docs';

const root = process.cwd();

function readScriptNames(): string[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch {
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) {
    return [];
  }

  const scripts = parsed.scripts;

  return typeof scripts === 'object' && scripts !== null ? Object.keys(scripts) : [];
}

const docs = await loadDocs(root);
const problems = [
  ...checkLinks(docs, (path) => existsSync(join(root, path))),
  ...checkCommands(docs, readScriptNames()),
];

for (const problem of problems) {
  process.stdout.write(`${problem.path}:${problem.line}: ${problem.message}\n`);
}

if (problems.length > 0) {
  process.stdout.write(`documents: ${problems.length} problems\n`);
  process.exit(1);
}

process.stdout.write(`documents: ${docs.length} files, no problems\n`);
