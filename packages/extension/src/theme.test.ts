// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, isThemeChoice, readThemeChoice, resolvedTheme } from './theme';

function systemDark(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeChoice;
  vi.unstubAllGlobals();
});

describe('the theme choice', () => {
  it('accepts only the three choices', () => {
    expect(isThemeChoice('system')).toBe(true);
    expect(isThemeChoice('light')).toBe(true);
    expect(isThemeChoice('dark')).toBe(true);
    expect(isThemeChoice('sepia')).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });

  it('falls back to the system for a value it does not know', () => {
    expect(readThemeChoice('dark')).toBe('dark');
    expect(readThemeChoice('sepia')).toBe('system');
    expect(readThemeChoice(null)).toBe('system');
  });
});

describe('the applied theme', () => {
  it('resolves the system choice from the prefers-color-scheme query', () => {
    expect(resolvedTheme('system')).toBe('light');
    systemDark(true);
    expect(resolvedTheme('system')).toBe('dark');
    expect(resolvedTheme('light')).toBe('light');
  });

  it('writes the painted theme and the choice it came from', () => {
    systemDark(true);
    applyTheme('system');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themeChoice).toBe('system');

    applyTheme('light');

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themeChoice).toBe('light');
  });
});
