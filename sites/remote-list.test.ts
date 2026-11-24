import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadRemoteList } from './remote-list';

const temps: string[] = [];

const SITE = {
  domain: 'forbes.com',
  name: 'Forbes',
  walls: [{ category: 'adblock', type: 'hard' }],
  paths: [],
  note: 'Full-page wall for readers with an ad blocker.',
};

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A local repository that stands in for the detour-list remote. */
function makeRemote(): string {
  const dir = mkdtempSync(join(tmpdir(), 'detour-remote-'));
  temps.push(dir);

  git(['init', '--quiet', '--initial-branch=master', dir]);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);

  return dir;
}

function commitList(dir: string, input: unknown, message: string): string {
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'sites.json'), `${JSON.stringify(input, null, 2)}\n`);
  git(['add', '.'], dir);
  git(['commit', '--quiet', '-m', message], dir);

  return git(['rev-parse', '--short', 'HEAD'], dir).trim();
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('the remote list', () => {
  it('reads the artifact at the named ref and names the commit', () => {
    const dir = makeRemote();
    const commit = commitList(
      dir,
      { disabled: false, avoid: [], prefer: [], sites: [SITE] },
      'List',
    );

    const result = loadRemoteList({ remote: dir, ref: 'master' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commit).toBe(commit);
      expect(result.list.sites[0]?.domain).toBe('forbes.com');
    }
  });

  it('reads the ref, not the branch that the remote checkout shows', () => {
    const dir = makeRemote();
    const masterCommit = commitList(
      dir,
      { disabled: false, avoid: [], prefer: [], sites: [SITE] },
      'List',
    );
    git(['checkout', '--quiet', '-b', 'site-check/other.com'], dir);
    commitList(
      dir,
      {
        disabled: false,
        avoid: [],
        prefer: [],
        sites: [{ ...SITE, domain: 'other.com', name: 'Other' }],
      },
      'A pending entry',
    );

    const result = loadRemoteList({ remote: dir, ref: 'master' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commit).toBe(masterCommit);
      expect(result.list.sites[0]?.domain).toBe('forbes.com');
    }
  });

  it('reports an artifact that the schema refuses', () => {
    const dir = makeRemote();
    commitList(dir, { sites: [{ ...SITE, walls: [] }] }, 'A bad list');

    const result = loadRemoteList({ remote: dir, ref: 'master' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContainEqual(expect.stringMatching(/^sites\.0\.walls: /));
    }
  });

  it('reports a ref that the remote does not carry', () => {
    const dir = makeRemote();
    commitList(dir, { sites: [SITE] }, 'List');

    const result = loadRemoteList({ remote: dir, ref: 'no-such-branch' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContainEqual(expect.stringMatching(/^git fetch /));
    }
  });

  it('reports a remote that cannot be read', () => {
    const result = loadRemoteList({ remote: '/nonexistent/detour-list', ref: 'master' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContainEqual(expect.stringMatching(/^git fetch /));
    }
  });
});
