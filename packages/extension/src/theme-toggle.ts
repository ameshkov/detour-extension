import { MESSAGE } from './constants';
import { THEME_SWITCH_DARK, THEME_SWITCH_LIGHT } from './copy';
import { roleElement } from './dom';
import type { PageScope, PageSender } from './page-send';
import { createPageSender } from './page-send';
import type { Settings } from './storage';
import { applyTheme, currentTheme } from './theme';

const senders = new Map<PageScope, PageSender>();

function senderFor(scope: PageScope): PageSender {
  const found = senders.get(scope);

  if (found !== undefined) {
    return found;
  }

  const sender = createPageSender(scope);

  senders.set(scope, sender);

  return sender;
}

/**
 * The control moves the surface to the other theme and stores that choice. The
 * button states the theme it moves to, so it never promises the system choice;
 * the settings page offers all three choices.
 */
export function renderThemeToggle(settings: Settings, scope: PageScope = 'block'): void {
  const button = roleElement('theme');

  if (button === null) {
    return;
  }

  button.hidden = false;

  const dark = currentTheme() === 'dark';
  const label = dark ? THEME_SWITCH_LIGHT : THEME_SWITCH_DARK;

  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.onclick = (): void => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    const updated: Settings = { ...settings, theme: next };

    settings.theme = next;
    applyTheme(next);
    renderThemeToggle(settings, scope);
    senderFor(scope).guard(() =>
      chrome.runtime.sendMessage({ type: MESSAGE.setSettings, settings: updated }),
    );
  };
}
