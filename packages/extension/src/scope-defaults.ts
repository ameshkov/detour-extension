import type { AllowanceScope } from './allowances';
import { SCOPE_DEFAULTS_MAX, STORAGE } from './constants';

/** The four choices of the scope selector, in the order that the menu shows them. */
export type ScopeChoice = AllowanceScope | 'once';

export const SCOPE_CHOICES: readonly ScopeChoice[] = ['once', 'tab', 'session', 'always'];

/**
 * The choice that each domain starts on. `tab` is the default, so a domain that
 * chose it has no entry, and the map stays small.
 */
export type ScopeDefaults = Record<string, ScopeChoice>;

export function isScopeChoice(value: unknown): value is ScopeChoice {
  return typeof value === 'string' && SCOPE_CHOICES.includes(value as ScopeChoice);
}

/** The choice that the scope selector starts on for one domain. */
export function defaultScopeFor(defaults: ScopeDefaults, domain: string): ScopeChoice {
  const stored = domain === '' ? undefined : defaults[domain];

  return stored !== undefined && isScopeChoice(stored) ? stored : 'tab';
}

/**
 * The map after one choice. `tab` is the default, so it clears the entry of the
 * domain, and any other choice moves the domain to the end. Past the bound, the
 * oldest domains go first.
 */
export function rememberScope(
  defaults: ScopeDefaults,
  domain: string,
  scope: ScopeChoice,
): ScopeDefaults {
  const next = { ...defaults };

  if (domain !== '') {
    delete next[domain];

    if (scope !== 'tab') {
      next[domain] = scope;
    }
  }

  const keys = Object.keys(next);
  const oldest = Math.max(keys.length - SCOPE_DEFAULTS_MAX, 0);

  for (const key of keys.slice(0, oldest)) {
    delete next[key];
  }

  return next;
}

function toDefaults(value: unknown): ScopeDefaults {
  const defaults: ScopeDefaults = {};

  if (typeof value !== 'object' || value === null) {
    return defaults;
  }

  for (const [domain, scope] of Object.entries(value)) {
    if (domain !== '' && isScopeChoice(scope)) {
      defaults[domain] = scope;
    }
  }

  return defaults;
}

/** The stored choices, or an empty map when the store is unreadable. */
export async function readScopeDefaults(): Promise<ScopeDefaults> {
  try {
    const stored = await chrome.storage.local.get(STORAGE.scopeDefaults);

    return toDefaults(stored[STORAGE.scopeDefaults]);
  } catch {
    return {};
  }
}

/** The worker writes the map, so a page never changes it on its own. */
export async function writeScopeDefaults(defaults: ScopeDefaults): Promise<void> {
  await chrome.storage.local.set({ [STORAGE.scopeDefaults]: defaults });
}
