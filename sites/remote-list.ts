import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SitesJsonSchema } from '@detour/shared';
import type { SitesJson } from '@detour/shared';

export type RemoteListResult =
  { ok: true; list: SitesJson; commit: string } | { ok: false; problems: string[] };

export type RemoteListOptions = {
  /** The git URL of detour-list. */
  remote: string;
  /** The branch or tag whose artifact this build reads. */
  ref: string;
};

const ARTIFACT_PATH = 'dist/sites.json';

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  });
}

/** The first line of a failed git command, so a build prints one reason. */
function reasonOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '');

    return stderr.split('\n').find((line) => line.trim() !== '') ?? 'the command failed';
  }

  return error instanceof Error ? error.message : String(error);
}

function problemsOf(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}) {
  return error.issues.map((issue) => {
    const path = issue.path.map((part) => String(part)).join('.');

    return path === '' ? issue.message : `${path}: ${issue.message}`;
  });
}

/**
 * Reads the artifact that detour-list serves at one ref. The clone is temporary
 * and shallow, so the shared checkout and its current branch play no part, and
 * the remote stays read-only.
 */
export function loadRemoteList(options: RemoteListOptions): RemoteListResult {
  const directory = mkdtempSync(join(tmpdir(), 'detour-list-'));

  try {
    git(['init', '--quiet', '--initial-branch=master', directory]);
    git(['remote', 'add', 'origin', options.remote], directory);

    try {
      git(['fetch', '--quiet', '--depth', '1', 'origin', options.ref], directory);
    } catch (error) {
      return {
        ok: false,
        problems: [`git fetch ${options.remote} ${options.ref} failed: ${reasonOf(error)}`],
      };
    }

    const commit = git(['rev-parse', '--short', 'FETCH_HEAD'], directory).trim();
    let text: string;

    try {
      text = git(['show', `FETCH_HEAD:${ARTIFACT_PATH}`], directory);
    } catch {
      return { ok: false, problems: [`${ARTIFACT_PATH} is missing at ${options.ref} (${commit})`] };
    }

    let input: unknown;

    try {
      input = JSON.parse(text);
    } catch {
      return {
        ok: false,
        problems: [`${ARTIFACT_PATH} at ${commit} is not JSON`],
      };
    }

    const parsed = SitesJsonSchema.safeParse(input);

    return parsed.success
      ? { ok: true, list: parsed.data, commit }
      : { ok: false, problems: problemsOf(parsed.error) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
