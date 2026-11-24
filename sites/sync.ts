import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SitesJsonSchema } from '@detour/shared';

const ROOT = resolve(import.meta.dirname, '..');
const LIST_REPOSITORY = 'detour-list';
const TARGET = join(ROOT, 'sites', 'sites.release.json');

/**
 * The checkout of detour-list, which holds the artifact that this extension
 * bundles. `DETOUR_LIST_PATH` names another checkout, such as a release tag.
 */
const source = resolve(process.env.DETOUR_LIST_PATH ?? join(ROOT, '..', LIST_REPOSITORY));
const artifact = join(source, 'dist', 'sites.json');

if (!existsSync(artifact)) {
  process.stderr.write(`${artifact}: the artifact is missing; run pnpm list:build in ${source}\n`);
  process.exit(1);
}

const result = SitesJsonSchema.safeParse(JSON.parse(readFileSync(artifact, 'utf8')));

if (!result.success) {
  for (const issue of result.error.issues) {
    const path = issue.path.map((part) => String(part)).join('.');
    process.stderr.write(`${path === '' ? '' : `${path}: `}${issue.message}\n`);
  }

  process.exit(1);
}

writeFileSync(TARGET, `${JSON.stringify(result.data, null, 2)}\n`);

process.stdout.write(`${result.data.sites.length} sites from ${artifact}\n`);

try {
  const commit = execFileSync('git', ['-C', source, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim();

  process.stdout.write(`detour-list at ${commit}\n`);
} catch {
  // A copy without git history is still a valid artifact.
}
