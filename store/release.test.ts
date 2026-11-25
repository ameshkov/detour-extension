import { describe, expect, it } from 'vitest';

import type { ReleaseOptions, StoreClient, StatusView } from './release';
import { highest, parseArgs, refusal, runRelease, statusView } from './release';

const ITEM = 'jcncblagncbpbamfnekhdkomffdpehpk';

function revision(state: string, version: string | null): Record<string, unknown> {
  return {
    state,
    distributionChannels: version === null ? [] : [{ deployPercentage: 100, crxVersion: version }],
  };
}

function status(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    itemId: ITEM,
    publishedItemRevisionStatus: revision('PUBLISHED', '0.1.0'),
    lastAsyncUploadState: 'SUCCEEDED',
    takenDown: false,
    warned: false,
    ...overrides,
  };
}

type Call = { name: string; args: unknown[] };

function fakeClient(
  answer: Record<string, unknown>,
  uploaded: { uploadState?: string; crxVersion?: string } = {
    uploadState: 'SUCCEEDED',
    crxVersion: '0.1.1',
  },
): { client: StoreClient; calls: Call[] } {
  const calls: Call[] = [];

  const client: StoreClient = {
    async get(token) {
      calls.push({ name: 'get', args: [token] });

      return answer;
    },
    async uploadExisting(path, token, waitSeconds) {
      calls.push({ name: 'upload', args: [path, token, waitSeconds] });

      return uploaded;
    },
    async publish(type, token) {
      calls.push({ name: 'publish', args: [type, token] });

      return { state: type === 'STAGED_PUBLISH' ? 'STAGED' : 'PENDING_REVIEW' };
    },
  };

  return { client, calls };
}

type RunOptions = Partial<Omit<ReleaseOptions, 'client'>> & { answer?: Record<string, unknown> };

function run(options: RunOptions = {}) {
  const { answer, ...rest } = options;
  const { client, calls } = fakeClient(answer ?? status());
  const lines: string[] = [];

  const running = runRelease({
    client,
    token: 'ya29.test',
    itemId: ITEM,
    version: '0.1.1',
    zipPath: '/repo/store/dist/detour-0.1.1.zip',
    mode: 'staged',
    dryRun: false,
    tag: null,
    log: (line) => lines.push(line),
    ...rest,
  });

  return { running, calls, lines };
}

describe('the release arguments', () => {
  it('defaults to a staged run', () => {
    expect(parseArgs([])).toEqual({ status: false, dryRun: false, mode: 'staged' });
  });

  it('reads the status, the dry run, and the mode', () => {
    expect(parseArgs(['--status', '--dry-run', '--mode=live'])).toEqual({
      status: true,
      dryRun: true,
      mode: 'live',
    });
  });

  it('refuses a mode that the store does not have', () => {
    expect(() => parseArgs(['--mode=instant'])).toThrow('none, staged, or live');
    expect(() => parseArgs(['--upload'])).toThrow('unknown argument');
  });
});

describe('the store status', () => {
  it('reads the published version and the revision under the store', () => {
    const view = statusView(
      status({
        submittedItemRevisionStatus: revision('PENDING_REVIEW', '0.1.1'),
      }),
    );

    expect(view).toEqual({
      itemId: ITEM,
      published: { state: 'PUBLISHED', versions: ['0.1.0'] },
      submitted: { state: 'PENDING_REVIEW', versions: ['0.1.1'] },
      upload: 'SUCCEEDED',
      takenDown: false,
      warned: false,
    });
  });

  it('copes with an answer that carries nothing', () => {
    expect(statusView({}).published).toBeNull();
    expect(statusView(null).warned).toBe(false);
  });

  it('takes the highest version of every channel', () => {
    expect(highest(['0.1.0', '0.2.0', '0.1.9'])).toBe('0.2.0');
    expect(highest([])).toBeNull();
  });
});

describe('the release guard', () => {
  const clean: StatusView = {
    itemId: ITEM,
    published: { state: 'PUBLISHED', versions: ['0.1.0'] },
    submitted: null,
    upload: 'SUCCEEDED',
    takenDown: false,
    warned: false,
  };

  it('lets a newer version through', () => {
    expect(refusal({ local: '0.1.1', status: clean, tag: 'v0.1.1' })).toBeNull();
  });

  it('stops a version that the store already has', () => {
    expect(refusal({ local: '0.1.0', status: clean, tag: null })).toContain('increase the version');
  });

  it('stops on a tag that names another version', () => {
    expect(refusal({ local: '0.1.1', status: clean, tag: 'v0.1.0' })).toContain('tag the commit');
  });

  it('ignores a branch name in place of a tag', () => {
    expect(refusal({ local: '0.1.1', status: clean, tag: 'master' })).toBeNull();
  });

  it('stops on a taken-down item and on a warned item', () => {
    expect(refusal({ local: '0.1.1', status: { ...clean, takenDown: true }, tag: null })).toContain(
      'taken down',
    );
    expect(refusal({ local: '0.1.1', status: { ...clean, warned: true }, tag: null })).toContain(
      'policy warning',
    );
  });

  it('names the review that holds the item', () => {
    const review = (state: string, version: string | null): StatusView => ({
      ...clean,
      submitted: { state, versions: version === null ? [] : [version] },
    });

    expect(
      refusal({ local: '0.1.1', status: review('PENDING_REVIEW', '0.1.1'), tag: null }),
    ).toContain('already under review');
    expect(
      refusal({ local: '0.1.2', status: review('PENDING_REVIEW', '0.1.1'), tag: null }),
    ).toContain('0.1.1 is under review');
    expect(refusal({ local: '0.1.1', status: review('STAGED', '0.1.1'), tag: null })).toContain(
      'is staged',
    );
    expect(refusal({ local: '0.1.2', status: review('REJECTED', '0.1.1'), tag: null })).toContain(
      'was rejected',
    );
    expect(refusal({ local: '0.1.2', status: review('CANCELLED', '0.1.1'), tag: null })).toContain(
      'was cancelled',
    );
  });
});

describe('the release run', () => {
  it('uploads the zip and stages it', async () => {
    const { running, calls, lines } = run();

    await running;

    expect(calls.map((call) => call.name)).toEqual(['get', 'upload', 'publish']);
    expect(calls[2]?.args[0]).toBe('STAGED_PUBLISH');
    expect(lines).toContain('uploaded version 0.1.1');
    expect(lines.at(-1)).toContain('STAGED');
  });

  it('submits at once for a live run', async () => {
    const { running, calls } = run({ mode: 'live' });

    await running;

    expect(calls[2]?.args[0]).toBe('DEFAULT_PUBLISH');
  });

  it('uploads alone when the mode asks for no publish', async () => {
    const { running, calls } = run({ mode: 'none' });

    await running;

    expect(calls.map((call) => call.name)).toEqual(['get', 'upload']);
  });

  it('sends nothing on a dry run', async () => {
    const { running, calls, lines } = run({ dryRun: true });

    await running;

    expect(calls.map((call) => call.name)).toEqual(['get']);
    expect(lines.at(-1)).toContain('dry run');
  });

  it('sends nothing when the guard stops the run', async () => {
    const { running, calls } = run({ answer: status({ takenDown: true }) });

    await expect(running).rejects.toThrow('taken down');
    expect(calls.map((call) => call.name)).toEqual(['get']);
  });

  it('stops an upload that the store did not finish', async () => {
    const { client } = fakeClient(status(), { uploadState: 'FAILED' });

    await expect(
      runRelease({
        client,
        token: 'ya29.test',
        version: '0.1.1',
        zipPath: '/zip',
        mode: 'staged',
        dryRun: false,
        tag: null,
        log: () => undefined,
      }),
    ).rejects.toThrow('the upload ended as FAILED');
  });

  it('stops when the store packed another version', async () => {
    const { client } = fakeClient(status(), { uploadState: 'SUCCEEDED', crxVersion: '0.1.0' });

    await expect(
      runRelease({
        client,
        token: 'ya29.test',
        version: '0.1.1',
        zipPath: '/zip',
        mode: 'staged',
        dryRun: false,
        tag: null,
        log: () => undefined,
      }),
    ).rejects.toThrow('the store uploaded 0.1.0');
  });

  it('stops when the answer names another item', async () => {
    const { running } = run({ answer: status({ itemId: 'someoneelse' }) });

    await expect(running).rejects.toThrow('the store answered for item someoneelse');
  });
});
