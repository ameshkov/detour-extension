import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type Manifest = {
  key?: string;
  host_permissions?: string[];
  permissions?: string[];
  background?: { service_worker?: string };
  content_scripts?: Array<{
    matches?: string[];
    js?: string[];
    run_at?: string;
    all_frames?: boolean;
  }>;
  web_accessible_resources?: Array<{ resources?: string[]; matches?: string[] }>;
  action?: { default_popup?: string; default_title?: string };
  options_ui?: { page?: string; open_in_tab?: boolean };
  [index: string]: unknown;
};

const DIR = resolve(import.meta.dirname, '..');
const PINNED_ID = 'jcncblagncbpbamfnekhdkomffdpehpk';
const ID_ALPHABET = 'abcdefghijklmnop';

function readManifest(): Manifest {
  return JSON.parse(readFileSync(resolve(DIR, 'manifest.json'), 'utf8')) as Manifest;
}

/**
 * The store derives the extension id from the public key: the first sixteen
 * bytes of the key digest, each nibble written as a letter from `a` to `p`.
 */
function extensionId(key: string): string {
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest();
  let id = '';

  for (const byte of digest.subarray(0, 16)) {
    id += ID_ALPHABET.charAt(byte >> 4) + ID_ALPHABET.charAt(byte & 0x0f);
  }

  return id;
}

function collectStrings(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, found);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) {
      collectStrings(item, found);
    }
  }

  return found;
}

const manifest = readManifest();

describe('the extension manifest', () => {
  it('derives the pinned extension id from the public key', () => {
    expect(manifest.key).toBeTruthy();
    expect(extensionId(manifest.key ?? '')).toBe(PINNED_ID);
  });

  it('grants the one broad page permission', () => {
    expect(manifest.host_permissions).toEqual(['*://*/*']);
  });

  it('carries no local address', () => {
    const strings = collectStrings(manifest);

    expect(strings.length).toBeGreaterThan(0);
    expect(strings.filter((value) => value.includes('127.0.0.1'))).toEqual([]);
    expect(strings.filter((value) => value.includes('localhost'))).toEqual([]);
  });

  it('injects the guard at document start in the top frame only', () => {
    const scripts = manifest.content_scripts ?? [];

    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.matches).toEqual(['*://*/*']);
    expect(scripts[0]?.js).toEqual(['guard.js']);
    expect(scripts[0]?.run_at).toBe('document_start');
    expect(scripts[0]?.all_frames).toBe(false);
  });

  it('declares the two permissions the extension needs', () => {
    expect(manifest.permissions).toEqual(['alarms', 'storage']);
    expect(manifest.permissions).not.toContain('tabs');
  });

  it('serves the block page as a web accessible resource', () => {
    const resources = manifest.web_accessible_resources ?? [];

    expect(resources).toHaveLength(1);
    expect(resources[0]?.resources).toContain('block.html');
    expect(resources[0]?.matches).toEqual(['*://*/*']);
  });

  it('runs the service worker from the bundle', () => {
    expect(manifest.background?.service_worker).toBe('background.js');
  });

  it('names the popup and the options page', () => {
    expect(manifest.action?.default_popup).toBe('popup.html');
    expect(manifest.action?.default_title).toBe('Detour');
    expect(manifest.options_ui?.page).toBe('options.html');
    expect(manifest.options_ui?.open_in_tab).toBe(true);
  });
});
