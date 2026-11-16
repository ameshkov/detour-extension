import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { buildSitesJson } from './list-pipeline';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = join(ROOT, 'sites', 'sites.yaml');
const DEV_SOURCE = join(ROOT, 'sites', 'sites.dev.yaml');
const OUTPUTS = [join(ROOT, 'packages', 'extension', 'src', 'sites.json')];

function readEvidence(path: string): string | null {
  const file = join(ROOT, path);

  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

const source = existsSync(SOURCE) ? readFileSync(SOURCE, 'utf8') : null;

if (source === null) {
  process.stderr.write('sites.yaml: the source file is missing\n');
  process.exit(1);
}

const withDev = process.argv.includes('--dev');
const devSource = withDev && existsSync(DEV_SOURCE) ? readFileSync(DEV_SOURCE, 'utf8') : undefined;

if (withDev && devSource === undefined) {
  process.stderr.write('sites.dev.yaml: the source file is missing\n');
  process.exit(1);
}

const result = buildSitesJson(source, readEvidence, devSource);

if (!result.ok) {
  for (const problem of result.problems) {
    process.stderr.write(`${problem}\n`);
  }

  process.exit(1);
}

for (const output of OUTPUTS) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result.json, null, 2)}\n`);
}

process.stdout.write(
  `${result.list.sites.length} sites, version ${result.list.version}, wrote ${OUTPUTS.length} file\n`,
);
