import { MESSAGE, PRIVACY_URL, SITE_URL } from './constants';
import {
  ALTERNATIVES_LOADING,
  ENABLED_SWITCH_LABEL,
  HOW_IT_WORKS_LABEL,
  POPUP_OFF,
  POPUP_ON,
  POPUP_UNAVAILABLE,
  PRIVACY_LABEL,
  SETTINGS_LABEL,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import type { PopupDeps } from './popup';
import { clearMain } from './popup-sections';
import type { PopupState } from './state-view';
import type { Settings } from './storage';
import { renderThemeToggle } from './theme-toggle';

/** The header state: the list is off, or on. The sheet tones each one. */
export function renderState(settings: Settings): void {
  const element = roleElement('state');

  if (element === null) {
    return;
  }

  element.textContent = settings.enabled ? POPUP_ON : POPUP_OFF;
  element.dataset.state = settings.enabled ? 'on' : 'off';
}

/**
 * One press writes all the settings, so the reading settings keep the values the
 * reader left. The worker stores them, and the reload renders what it stored.
 */
export function renderSwitch(state: PopupState, deps: PopupDeps): void {
  const element = roleElement('enabled');

  if (!(element instanceof HTMLInputElement)) {
    return;
  }

  element.checked = state.settings.enabled;
  element.setAttribute('aria-label', ENABLED_SWITCH_LABEL);
  element.onchange = (event: Event): void => {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    const settings: Settings = { ...state.settings, enabled: checked };

    deps.guard(() => deps.send({ type: MESSAGE.setSettings, settings }), deps.reload);
  };
}

function setLink(role: string, href: string, text: string): void {
  const element = roleElement(role);

  if (!(element instanceof HTMLAnchorElement)) {
    return;
  }

  element.textContent = text;
  element.setAttribute('href', href);
}

/** The two links leave the extension for the public site. */
function renderLinks(): void {
  setLink('how-it-works', SITE_URL, HOW_IT_WORKS_LABEL);
  setLink('privacy', PRIVACY_URL, PRIVACY_LABEL);
}

/** The gear needs nothing from the worker, so it works from the first frame. */
function renderGear(deps: PopupDeps): void {
  const settings = roleElement('settings');

  if (settings !== null) {
    settings.setAttribute('aria-label', SETTINGS_LABEL);
    settings.title = SETTINGS_LABEL;
    settings.onclick = (): void => deps.openOptions();
  }
}

/**
 * The controls that a state fills wait for it. A switch that is merely unchecked
 * says that Detour is off while the answer is still coming, and the theme
 * control writes the settings it was given, so neither can be painted early.
 */
function hideControls(): void {
  setText('state', '');
  setHidden('state', true);
  setHidden('enabled', true);
  setHidden('theme', true);
}

/** Everything the popup can say before the worker answers. */
export function renderShell(deps: PopupDeps): void {
  clearMain();
  hideControls();
  setText('status', ALTERNATIVES_LOADING);
  setHidden('status', false);
  renderLinks();
  renderGear(deps);
}

/** The state request failed, so the popup says so rather than paint half a page. */
export function renderUnavailable(deps: PopupDeps): void {
  clearMain();
  hideControls();
  setText('status', POPUP_UNAVAILABLE);
  setHidden('status', false);
  renderLinks();
  renderGear(deps);
}

/** The controls that only a state can fill are back once it has arrived. */
export function showControls(): void {
  setHidden('state', false);
  setHidden('enabled', false);
  setHidden('theme', false);
}

/** The footer: the two links on the left, the theme and the gear on the right. */
export function renderFooter(state: PopupState, deps: PopupDeps): void {
  renderLinks();
  renderThemeToggle(state.settings, 'popup');
  renderGear(deps);
}
