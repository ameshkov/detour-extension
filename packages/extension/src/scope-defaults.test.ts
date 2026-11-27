import { describe, expect, it } from 'vitest';

import { SCOPE_DEFAULTS_MAX, STORAGE } from './constants';
import type { ScopeDefaults } from './scope-defaults';
import {
  SCOPE_CHOICES,
  defaultScopeFor,
  isScopeChoice,
  readScopeDefaults,
  rememberScope,
  writeScopeDefaults,
} from './scope-defaults';
import { installFakeChrome } from './testing/fake-chrome';

describe('the remembered scope', () => {
  it('starts on the tab scope for a domain without an entry', () => {
    expect(defaultScopeFor({}, 'cnet.com')).toBe('tab');
    expect(defaultScopeFor({ 'cnet.com': 'always' }, 'cnet.com')).toBe('always');
    expect(defaultScopeFor({ 'cnet.com': 'always' }, 'forbes.com')).toBe('tab');
  });

  it('accepts only the four choices', () => {
    for (const choice of SCOPE_CHOICES) {
      expect(isScopeChoice(choice)).toBe(true);
    }

    expect(isScopeChoice('sometimes')).toBe(false);
    expect(isScopeChoice(null)).toBe(false);
  });

  it('keeps a choice and moves the domain to the end', () => {
    const defaults = rememberScope({ 'a.com': 'always', 'b.com': 'once' }, 'a.com', 'session');

    expect(defaults).toEqual({ 'b.com': 'once', 'a.com': 'session' });
    expect(Object.keys(defaults)).toEqual(['b.com', 'a.com']);
  });

  it('clears the entry when the reader chooses the tab scope', () => {
    expect(rememberScope({ 'cnet.com': 'always' }, 'cnet.com', 'tab')).toEqual({});
  });

  it('drops the oldest domains past the bound', () => {
    let defaults: ScopeDefaults = {};

    for (let index = 0; index < SCOPE_DEFAULTS_MAX + 1; index += 1) {
      defaults = rememberScope(defaults, `d${index}.com`, 'always');
    }

    expect(Object.keys(defaults)).toHaveLength(SCOPE_DEFAULTS_MAX);
    expect(defaults['d0.com']).toBeUndefined();
    expect(defaults[`d${SCOPE_DEFAULTS_MAX}.com`]).toBe('always');
  });
});

describe('the stored scope defaults', () => {
  it('reads the map and drops a value that is not a choice', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.scopeDefaults] = {
      'cnet.com': 'always',
      'bad.com': 'nope',
      '': 'once',
    };

    await expect(readScopeDefaults()).resolves.toEqual({ 'cnet.com': 'always' });
  });

  it('answers an empty map when the read fails', async () => {
    const fake = installFakeChrome();

    fake.storage.local.failReads = true;

    await expect(readScopeDefaults()).resolves.toEqual({});
  });

  it('answers an empty map for a value of the wrong shape', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.scopeDefaults] = 'nope';

    await expect(readScopeDefaults()).resolves.toEqual({});
  });

  it('writes the map under one key', async () => {
    const fake = installFakeChrome();

    await writeScopeDefaults({ 'cnet.com': 'once' });

    expect(fake.storage.local.values[STORAGE.scopeDefaults]).toEqual({ 'cnet.com': 'once' });
  });
});
