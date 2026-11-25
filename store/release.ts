import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import chromeWebstoreUpload from 'chrome-webstore-upload';

import { RELEASE_API_BASE } from './listing';
import { DIST, OUT } from './pack';
import { compareVersions, versionProblem } from './version';

/** How long the upload may stay IN_PROGRESS before the run gives up. */
export const UPLOAD_WAIT_SECONDS = 120;

export type Mode = 'none' | 'staged' | 'live';

export type Args = {
  status: boolean;
  dryRun: boolean;
  mode: Mode;
};

export function parseArgs(argv: readonly string[]): Args {
  let status = false;
  let dryRun = false;
  let mode: Mode = 'staged';

  for (const arg of argv) {
    if (arg === '--status') {
      status = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length);

      if (value !== 'none' && value !== 'staged' && value !== 'live') {
        throw new Error(`--mode takes none, staged, or live, not "${value}"`);
      }

      mode = value;
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }

  return { status, dryRun, mode };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function versionOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** One revision of the item: what the store published, and what it holds now. */
export type Revision = {
  state: string;
  versions: string[];
};

export type StatusView = {
  itemId: string;
  published: Revision | null;
  submitted: Revision | null;
  upload: string;
  takenDown: boolean;
  warned: boolean;
};

function revisionOf(value: unknown): Revision | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const revision = record(value);
  const channels = Array.isArray(revision.distributionChannels)
    ? revision.distributionChannels.map(record)
    : [];
  const versions = channels
    .map((channel) => versionOf(channel.crxVersion))
    .filter((version): version is string => version !== null);

  return {
    state: typeof revision.state === 'string' ? revision.state : 'ITEM_STATE_UNSPECIFIED',
    versions,
  };
}

/** The answers of `fetchStatus` that decide whether a release may run. */
export function statusView(value: unknown): StatusView {
  const status = record(value);

  return {
    itemId: typeof status.itemId === 'string' ? status.itemId : '',
    published: revisionOf(status.publishedItemRevisionStatus),
    submitted: revisionOf(status.submittedItemRevisionStatus),
    upload:
      typeof status.lastAsyncUploadState === 'string' ? status.lastAsyncUploadState : 'unknown',
    takenDown: status.takenDown === true,
    warned: status.warned === true,
  };
}

/** The highest version of a list, by the store's own order. */
export function highest(versions: readonly string[]): string | null {
  let top: string | null = null;

  for (const version of versions) {
    if (top === null || compareVersions(version, top) > 0) {
      top = version;
    }
  }

  return top;
}

/**
 * Why the store would refuse this release, or null when it can run. The store
 * keeps one revision at a time, so a run stops before a request that would
 * replace a review or repeat a version.
 */
export function refusal(input: {
  local: string;
  status: StatusView;
  tag: string | null;
}): string | null {
  const { local, status, tag } = input;

  if (status.takenDown) {
    return 'the item is taken down; resolve it in the dashboard before a release';
  }

  if (status.warned) {
    return 'the item carries a policy warning; resolve it in the dashboard before a release';
  }

  if (tag !== null && tag.startsWith('v') && tag !== `v${local}`) {
    return `the tag says ${tag} and the manifest says ${local}; tag the commit of this version`;
  }

  const submitted = status.submitted;

  if (submitted !== null && submitted.state === 'PENDING_REVIEW') {
    const version = highest(submitted.versions);

    return version === local
      ? `version ${local} is already under review; wait for the answer in the dashboard`
      : `version ${version ?? 'unknown'} is under review; wait for it or cancel it in the dashboard`;
  }

  if (submitted !== null && submitted.state === 'STAGED') {
    return `version ${highest(submitted.versions) ?? 'unknown'} is staged; press publish in the dashboard before a new release`;
  }

  if (submitted !== null && submitted.state === 'REJECTED') {
    return 'the last submission was rejected; read the reason in the dashboard';
  }

  if (submitted !== null && submitted.state === 'CANCELLED') {
    return 'the last submission was cancelled; start the next release from the dashboard';
  }

  const published = status.published === null ? null : highest(status.published.versions);

  return versionProblem(published, local);
}

/** The three calls of the store API that this run makes. */
export type StoreClient = {
  get(token: string): Promise<unknown>;
  uploadExisting(
    path: string,
    token: string,
    waitSeconds?: number,
  ): Promise<{ uploadState?: string; crxVersion?: string }>;
  publish(type: 'DEFAULT_PUBLISH' | 'STAGED_PUBLISH', token: string): Promise<{ state?: string }>;
};

export type ReleaseOptions = {
  client: StoreClient;
  token: string;
  itemId?: string;
  version: string;
  zipPath: string;
  mode: Mode;
  dryRun: boolean;
  tag: string | null;
  log: (line: string) => void;
};

/**
 * One release: read the status, refuse a version or a review that blocks it,
 * upload, and submit. A `staged` run waits in the dashboard for the press that
 * publishes it, and a `live` run submits at once.
 */
export async function runRelease(options: ReleaseOptions): Promise<void> {
  const status = statusView(await options.client.get(options.token));
  const published = status.published === null ? 'nothing yet' : highest(status.published.versions);

  options.log(`store: published ${published ?? 'nothing yet'}, upload ${status.upload}`);

  if (status.itemId !== '' && options.itemId !== undefined && status.itemId !== options.itemId) {
    throw new Error(`the store answered for item ${status.itemId}`);
  }

  const stop = refusal({ local: options.version, status, tag: options.tag });

  if (stop !== null) {
    throw new Error(stop);
  }

  if (options.dryRun) {
    options.log(`dry run: would upload ${options.zipPath} and then publish ${options.mode}`);

    return;
  }

  const uploaded = await options.client.uploadExisting(
    options.zipPath,
    options.token,
    UPLOAD_WAIT_SECONDS,
  );

  if (uploaded.uploadState !== 'SUCCEEDED') {
    throw new Error(`the upload ended as ${uploaded.uploadState ?? 'no state'}`);
  }

  if (uploaded.crxVersion !== undefined && uploaded.crxVersion !== options.version) {
    throw new Error(
      `the store uploaded ${uploaded.crxVersion} and the run packed ${options.version}`,
    );
  }

  options.log(`uploaded version ${options.version}`);

  if (options.mode === 'none') {
    options.log('no publish, as the mode asks; submit it in the dashboard');

    return;
  }

  const type = options.mode === 'live' ? 'DEFAULT_PUBLISH' : 'STAGED_PUBLISH';
  const publishedAnswer = await options.client.publish(type, options.token);

  options.log(`submitted with ${type}: ${publishedAnswer.state ?? 'no state'}`);
}

function readVersion(): string {
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')) as {
    version?: string;
  };

  if (typeof manifest.version !== 'string') {
    throw new Error('the build has no version; run pnpm store:pack first');
  }

  return manifest.version;
}

function zipPathFor(version: string): string {
  const path = join(OUT, `detour-${version}.zip`);

  try {
    statSync(path);
  } catch {
    throw new Error(`${path} is missing; run pnpm store:pack first`);
  }

  return path;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env;
  const publisherId = env.CWS_PUBLISHER_ID?.trim() ?? '';
  const itemId = env.CWS_ITEM_ID?.trim() ?? '';
  const clientId = env.CWS_CLIENT_ID?.trim() ?? '';
  const refreshToken = env.CWS_REFRESH_TOKEN?.trim() ?? '';

  if (publisherId === '') {
    throw new Error('CWS_PUBLISHER_ID is not set; it is the id of the Publisher, not of the item');
  }

  if (itemId === '') {
    throw new Error('CWS_ITEM_ID is not set; the dashboard shows it on the Package tab');
  }

  if (clientId === '' || refreshToken === '') {
    throw new Error('CWS_CLIENT_ID and CWS_REFRESH_TOKEN are not set; see store/README.md');
  }

  const client = chromeWebstoreUpload({
    extensionId: itemId,
    publisherId,
    clientId,
    clientSecret: env.CWS_CLIENT_SECRET?.trim(),
    refreshToken,
  });

  const log = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  const token = await client.fetchToken();

  if (args.status) {
    const status = statusView(await client.get(token));

    process.stdout.write(
      `${JSON.stringify({ item: itemId, backend: RELEASE_API_BASE, ...status }, null, 2)}\n`,
    );

    return;
  }

  const version = readVersion();

  await runRelease({
    client,
    token,
    itemId,
    version,
    zipPath: zipPathFor(version),
    mode: args.mode,
    dryRun: args.dryRun,
    tag: env.GITHUB_REF_NAME?.trim() ?? null,
    log,
  });
}

const invoked = process.argv[1];

if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
