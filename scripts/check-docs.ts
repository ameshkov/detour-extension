import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkCommands } from './docs/commands';
import { LIST_FORMAT_DOC, checkGeneratedDoc } from './docs/generated-doc';
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

function readGeneratedDoc(): string | null {
  const path = join(root, LIST_FORMAT_DOC);

  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

const docs = await loadDocs(root);
const problems = [
  ...checkLinks(docs, (path) => existsSync(join(root, path))),
  ...checkCommands(docs, readScriptNames()),
  ...checkGeneratedDoc(readGeneratedDoc()),
];

for (const problem of problems) {
  process.stdout.write(`${problem.path}:${problem.line}: ${problem.message}\n`);
}

if (problems.length > 0) {
  process.stdout.write(`documents: ${problems.length} problems\n`);
  process.exit(1);
}

process.stdout.write(`documents: ${docs.length} files, no problems\n`);
