import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(import.meta.dirname, '..');
export const LISTING_FILE = join(ROOT, 'store', 'meta', 'listing.json');
export const SHEET_FILE = join(ROOT, 'store', 'meta', 'listing.md');
export const MANIFEST_FILE = join(ROOT, 'packages', 'extension', 'manifest.json');

/**
 * The release backend origin. It must match `DEFAULT_RELEASE_API_BASE` in the
 * extension build, and a test reads both so the two cannot drift.
 */
export const RELEASE_API_BASE = 'https://detour-api.meshkov.info';

export const LIMITS = {
  name: 75,
  summary: 132,
  description: 16_000,
  singlePurpose: 1000,
} as const;

/** The categories that the dashboard offers. */
export const CATEGORIES = [
  'Accessibility',
  'Blogging',
  'Developer Tools',
  'Fun',
  'News & Weather',
  'Photos',
  'Productivity',
  'Search Tools',
  'Shopping',
  'Social & Communication',
  'Sports',
  'Travel',
  'Utilities',
] as const;

/** The data types of the privacy tab, in dashboard order. */
export const DATA_USES = [
  'personallyIdentifiable',
  'health',
  'financial',
  'authentication',
  'personalCommunications',
  'location',
  'webHistory',
  'userActivity',
  'websiteContent',
] as const;

export const CERTIFICATIONS = [
  'notSoldToThirdParties',
  'notUsedForUnrelatedPurposes',
  'notUsedForCreditworthiness',
] as const;

export type DataUse = (typeof DATA_USES)[number];
export type Certification = (typeof CERTIFICATIONS)[number];

export type Listing = {
  name: string;
  summary: string;
  description: string[];
  category: string;
  language: string;
  homepageUrl: string;
  supportUrl: string;
  privacyPolicyUrl: string;
  singlePurpose: string;
  remoteCode: { used: boolean; explanation: string };
  permissions: Record<string, string>;
  hostPermissions: Record<string, string>;
  dataUsage: Record<DataUse, boolean>;
  certifications: Record<Certification, boolean>;
  matureContent: boolean;
};

export type Manifest = {
  name?: string;
  description?: string;
  permissions?: string[];
  host_permissions?: string[];
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function blocks(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((block) => block !== '') : [];
}

/** A list keeps its items on consecutive lines, and every other block is a paragraph. */
export function prose(items: readonly string[]): string {
  let body = '';

  for (const item of items) {
    const previous = body.split('\n').at(-1) ?? '';
    const both = previous.startsWith('- ') && item.startsWith('- ');
    body += body === '' ? item : `${both ? '\n' : '\n\n'}${item}`;
  }

  return body;
}

function justificationProblems(
  field: string,
  given: Record<string, unknown>,
  expected: readonly string[],
): string[] {
  const problems: string[] = [];

  for (const name of expected) {
    if (text(given[name]) === '') {
      problems.push(`${field}: no justification for "${name}"`);
    }
  }

  for (const name of Object.keys(given)) {
    if (!expected.includes(name)) {
      problems.push(`${field}: "${name}" is not in the manifest`);
    }
  }

  return problems;
}

/**
 * Every reason that the dashboard would reject this sheet, or that would let the
 * sheet drift from the build. A run prints all of them instead of the first.
 */
export function problemsOf(
  listing: unknown,
  manifest: Manifest,
  backendOrigin = RELEASE_API_BASE,
): string[] {
  const value = record(listing);
  const problems: string[] = [];

  const name = text(value.name);

  if (name === '') {
    problems.push('name: missing');
  } else if (name.length > LIMITS.name) {
    problems.push(`name: ${name.length} characters, limit ${LIMITS.name}`);
  } else if (name !== text(manifest.name)) {
    problems.push(`name: "${name}" but the manifest says "${text(manifest.name)}"`);
  }

  const summary = text(value.summary);

  if (summary === '') {
    problems.push('summary: missing');
  } else if (summary.length > LIMITS.summary) {
    problems.push(`summary: ${summary.length} characters, limit ${LIMITS.summary}`);
  }

  if (text(manifest.description) !== summary) {
    problems.push('summary: it does not match the manifest description');
  }

  const description = prose(blocks(value.description));

  if (description === '') {
    problems.push('description: missing');
  } else if (description.length > LIMITS.description) {
    problems.push(`description: ${description.length} characters, limit ${LIMITS.description}`);
  }

  const category = text(value.category);

  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    problems.push(`category: "${category}" is not one of ${CATEGORIES.join(', ')}`);
  }

  if (text(value.language) !== 'en') {
    problems.push(`language: "${text(value.language)}" is not en`);
  }

  for (const field of ['homepageUrl', 'supportUrl', 'privacyPolicyUrl'] as const) {
    const url = text(value[field]);

    if (!url.startsWith('https://')) {
      problems.push(`${field}: "${url}" is not an https address`);
    }
  }

  const purpose = text(value.singlePurpose);

  if (purpose === '') {
    problems.push('singlePurpose: missing');
  } else if (purpose.length > LIMITS.singlePurpose) {
    problems.push(`singlePurpose: ${purpose.length} characters, limit ${LIMITS.singlePurpose}`);
  }

  const remote = record(value.remoteCode);

  if (typeof remote.used !== 'boolean') {
    problems.push('remoteCode: "used" is not a true or false value');
  }

  if (text(remote.explanation) === '') {
    problems.push('remoteCode: missing the explanation');
  }

  problems.push(
    ...justificationProblems(
      'permissions',
      record(value.permissions),
      (manifest.permissions ?? []).slice().sort(),
    ),
  );

  problems.push(
    ...justificationProblems(
      'hostPermissions',
      record(value.hostPermissions),
      [...(manifest.host_permissions ?? []), `${backendOrigin}/*`].sort(),
    ),
  );

  const usage = record(value.dataUsage);

  for (const field of DATA_USES) {
    if (typeof usage[field] !== 'boolean') {
      problems.push(`dataUsage: "${field}" is not a true or false value`);
    }
  }

  const certifications = record(value.certifications);

  for (const field of CERTIFICATIONS) {
    if (certifications[field] !== true) {
      problems.push(`certifications: "${field}" is not certified`);
    }
  }

  if (typeof value.matureContent !== 'boolean') {
    problems.push('matureContent: "matureContent" is not a true or false value');
  }

  return problems;
}

function counts(value: string, limit: number): string {
  return `${value.length} of ${limit} characters`;
}

/** The sheet that a person pastes into the dashboard, in dashboard order. */
export function renderSheet(listing: Listing): string {
  const lines: string[] = [
    '# Store listing',
    '',
    'The dashboard takes these values once per item. This file is generated from',
    '`store/meta/listing.json` by `pnpm store:sheet`, so edit the JSON and run',
    'that command again. The `Assets` section of `store/README.md` names the images',
    'that go with it.',
    '',
    '## Store listing',
    '',
    `- Name: \`${listing.name}\`, ${counts(listing.name, LIMITS.name)}`,
    `- Summary: \`${listing.summary}\`, ${counts(listing.summary, LIMITS.summary)}`,
    `- Category: \`${listing.category}\``,
    `- Language: \`${listing.language}\``,
    `- Homepage: ${listing.homepageUrl}`,
    `- Support: ${listing.supportUrl}`,
    '',
    '## Detailed description',
    '',
    '```text',
    prose(listing.description),
    '```',
    '',
    '## Privacy practices',
    '',
    '### Single purpose',
    '',
    '```text',
    listing.singlePurpose,
    '```',
    '',
    '### Remote code',
    '',
    '```text',
    `${listing.remoteCode.used ? 'Yes' : 'No'}. ${listing.remoteCode.explanation}`,
    '```',
    '',
    '### Privacy policy',
    '',
    listing.privacyPolicyUrl,
    '',
    '### Data usage',
    '',
    'Tick these data types:',
    '',
  ];

  for (const field of DATA_USES) {
    lines.push(`- \`${field}\`: ${listing.dataUsage[field] ? 'ticked' : 'clear'}`);
  }

  lines.push('', '### Certifications', '');

  for (const field of CERTIFICATIONS) {
    lines.push(`- \`${field}\`: ${listing.certifications[field] ? 'ticked' : 'clear'}`);
  }

  lines.push('', '### Mature content', '', listing.matureContent ? 'Yes' : 'No', '');

  lines.push('## Permission justifications', '');

  for (const [name, justification] of Object.entries(listing.permissions)) {
    lines.push(`### \`${name}\``, '', justification, '');
  }

  lines.push('## Host permission justifications', '');

  for (const [pattern, justification] of Object.entries(listing.hostPermissions)) {
    lines.push(`### \`${pattern}\``, '', justification, '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as Manifest;
}

export function readListing(): Listing {
  return JSON.parse(readFileSync(LISTING_FILE, 'utf8')) as Listing;
}

async function main(): Promise<void> {
  const problems = problemsOf(readListing(), readManifest());

  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`${problem}\n`);
    }

    process.exit(1);
  }

  writeFileSync(SHEET_FILE, renderSheet(readListing()));
  process.stdout.write(`${SHEET_FILE}\n`);
}

const invoked = process.argv[1];

if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  await main();
}
