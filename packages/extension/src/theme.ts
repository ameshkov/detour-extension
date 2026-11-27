/**
 * The theme is one stored choice with three values. `system` follows the
 * browser, and the two other values are explicit. A page applies the choice to
 * the root element, so the sheet has one selector for the dark tokens.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** A stored value outside the three choices falls back to the system. */
export function readThemeChoice(value: unknown): ThemeChoice {
  return isThemeChoice(value) ? value : 'system';
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** The theme that the page paints now, after the system choice is resolved. */
export function resolvedTheme(theme: ThemeChoice): 'light' | 'dark' {
  if (theme === 'system') {
    return systemPrefersDark() ? 'dark' : 'light';
  }

  return theme;
}

/** Both values are on the root, so the sheet and the theme button read one place. */
export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;

  root.dataset.theme = resolvedTheme(theme);
  root.dataset.themeChoice = theme;
}

/** The page that is painted now, for a control that moves to the other one. */
export function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
