import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadRemoteList } from './remote-list';

const ROOT = resolve(import.meta.dirname, '..');
const TARGET = join(ROOT, 'sites', 'sites.release.json');

/**
 * The remote of detour-list, and the ref whose artifact this build reads.
 * `DETOUR_LIST_REMOTE` names another URL, such as a fork, and `DETOUR_LIST_REF`
 * names a release tag instead of the default branch.
 */
const remote = process.env.DETOUR_LIST_REMOTE ?? 'https://github.com/ameshkov/detour-list.git';
const ref = process.env.DETOUR_LIST_REF ?? 'master';

const result = loadRemoteList({ remote, ref });

if (!result.ok) {
  for (const problem of result.problems) {
    process.stderr.write(`${problem}\n`);
  }

  process.exit(1);
}

writeFileSync(TARGET, `${JSON.stringify(result.list, null, 2)}\n`);

process.stdout.write(
  `${result.list.sites.length} sites from ${remote} (${ref} at ${result.commit})\n`,
);
