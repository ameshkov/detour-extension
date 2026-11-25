import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
  DATA_USES,
  LIMITS,
  RELEASE_API_BASE,
  ROOT,
  SHEET_FILE,
  problemsOf,
  prose,
  readListing,
  readManifest,
  renderSheet,
} from './listing';

const BUILD = join(ROOT, 'packages', 'extension', 'scripts', 'build.ts');

const listing = readListing();
const manifest = readManifest();

describe('the store listing', () => {
  it('passes every limit of the dashboard', () => {
    expect(problemsOf(listing, manifest)).toEqual([]);
  });

  it('keeps the short description inside the manifest limit', () => {
    expect(listing.summary.length).toBeLessThanOrEqual(LIMITS.summary);
  });

  it('justifies every permission that the manifest asks for', () => {
    expect(Object.keys(listing.permissions).sort()).toEqual(
      [...(manifest.permissions ?? [])].sort(),
    );
    expect(Object.keys(listing.hostPermissions).sort()).toEqual(
      [...(manifest.host_permissions ?? []), `${RELEASE_API_BASE}/*`].sort(),
    );
  });

  it('discloses the page address and the page title', () => {
    expect(listing.dataUsage.webHistory).toBe(true);
    expect(listing.dataUsage.websiteContent).toBe(true);
  });

  it('names no remote code', () => {
    expect(listing.remoteCode.used).toBe(false);
  });

  it('offers a category that the dashboard carries', () => {
    expect(CATEGORIES).toContain(listing.category);
  });

  it('reproduces the sheet that a person pastes into the dashboard', () => {
    expect(readFileSync(SHEET_FILE, 'utf8')).toBe(renderSheet(listing));
  });
});

describe('the store listing check', () => {
  it('names a summary above the limit', () => {
    const problems = problemsOf({ ...listing, summary: 'a'.repeat(LIMITS.summary + 1) }, manifest);

    expect(problems).toContain(`summary: ${LIMITS.summary + 1} characters, limit 132`);
  });

  it('names a summary that does not match the manifest', () => {
    expect(problemsOf({ ...listing, summary: 'Another sentence.' }, manifest)).toContain(
      'summary: it does not match the manifest description',
    );
  });

  it('names a name that the manifest does not carry', () => {
    expect(problemsOf({ ...listing, name: 'Shortcut' }, manifest)).toContain(
      'name: "Shortcut" but the manifest says "Detour"',
    );
  });

  it('names a permission without a justification', () => {
    const problems = problemsOf({ ...listing, permissions: { alarms: 'A timer.' } }, manifest);

    expect(problems).toContain('permissions: no justification for "storage"');
  });

  it('names a permission that the manifest does not ask for', () => {
    const problems = problemsOf(
      { ...listing, permissions: { ...listing.permissions, tabs: 'A tab.' } },
      manifest,
    );

    expect(problems).toContain('permissions: "tabs" is not in the manifest');
  });

  it('names a host permission without a justification', () => {
    const problems = problemsOf({ ...listing, hostPermissions: {} }, manifest);

    expect(problems).toContain('hostPermissions: no justification for "*://*/*"');
    expect(problems).toContain(`hostPermissions: no justification for "${RELEASE_API_BASE}/*"`);
  });

  it('refuses a category that the dashboard does not offer', () => {
    expect(problemsOf({ ...listing, category: 'Games' }, manifest)).toContain(
      `category: "Games" is not one of ${CATEGORIES.join(', ')}`,
    );
  });

  it('refuses a policy address that is not https', () => {
    expect(
      problemsOf({ ...listing, privacyPolicyUrl: 'http://example.com/privacy' }, manifest),
    ).toContain('privacyPolicyUrl: "http://example.com/privacy" is not an https address');
  });

  it('refuses an uncertified promise', () => {
    const problems = problemsOf(
      { ...listing, certifications: { ...listing.certifications, notSoldToThirdParties: false } },
      manifest,
    );

    expect(problems).toContain('certifications: "notSoldToThirdParties" is not certified');
  });

  it('refuses a sheet that names no purpose and no data type', () => {
    const problems = problemsOf({ ...listing, singlePurpose: '', dataUsage: {} }, manifest);

    expect(problems).toContain('singlePurpose: missing');

    for (const field of DATA_USES) {
      expect(problems).toContain(`dataUsage: "${field}" is not a true or false value`);
    }
  });

  it('copes with a sheet that is not an object', () => {
    expect(problemsOf(null, manifest)).toContain('name: missing');
  });
});

describe('the listing text', () => {
  it('keeps list items on consecutive lines', () => {
    expect(prose(['One.', '- a', '- b', 'Two.'])).toBe('One.\n\n- a\n- b\n\nTwo.');
  });

  it('names the release origin that the build uses', () => {
    expect(readFileSync(BUILD, 'utf8')).toContain(`'${RELEASE_API_BASE}'`);
  });
});
