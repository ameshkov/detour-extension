import { MESSAGE, PAUSE_DURATION_MS } from './constants';
import {
  ALLOWED_SITES,
  ENABLED_SWITCH_LABEL,
  HOW_IT_WORKS_LABEL,
  LIST_LABEL,
  MANAGE_LABEL,
  PAUSE_ACTIVE_DETAIL,
  PAUSE_BUTTON_LABEL,
  PAUSE_IDLE_DETAIL,
  PAUSE_LABEL,
  POPUP_OFF,
  POPUP_ON,
  POPUP_PAUSED,
  PRIVACY_LABEL,
  REMOVE_LABEL,
  REPORT_FALSE_POSITIVE_LABEL,
  RESUME_LABEL,
  SCOPE_DETAIL,
  allowanceCount,
  listDetail,
  removeAllowanceLabel,
  tabAllowanceLabel,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import type { RevokeMessage } from './messages';
import { createPageSender } from './page-send';
import type { PopupAllowance, PopupView } from './popup';
import { reportUrl } from './report';
import type { Settings } from './storage';
import { currentVersion } from './version';

type Tone = 'on' | 'off' | 'paused';

const sender = createPageSender('popup');

/** A tab removal names its tab, so it never drops another tab's entry. */
function revokeMessage(allowance: PopupAllowance): RevokeMessage {
  const message = { type: MESSAGE.revoke, scope: allowance.scope, host: allowance.host };

  return allowance.tabId === undefined ? message : { ...message, tabId: allowance.tabId };
}

/** The header state: the list is off, or paused, or on. The sheet tones each one. */
export function renderState(view: PopupView): void {
  const tone: Tone = !view.settings.enabled ? 'off' : view.paused ? 'paused' : 'on';
  const text: Record<Tone, string> = { off: POPUP_OFF, paused: POPUP_PAUSED, on: POPUP_ON };
  const element = roleElement('state');

  if (element === null) {
    return;
  }

  element.textContent = text[tone];
  element.dataset.state = tone;
}

/**
 * One press writes all three settings, so the two reading settings keep the
 * values the reader left. The service worker stores them, and the reload renders
 * what it stored.
 */
export function renderSwitch(view: PopupView): void {
  const element = roleElement('enabled');

  if (!(element instanceof HTMLInputElement)) {
    return;
  }

  element.checked = view.settings.enabled;
  element.setAttribute('aria-label', ENABLED_SWITCH_LABEL);
  element.onchange = (event: Event): void => {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    const settings: Settings = { ...view.settings, enabled: checked };

    sender.send({ type: MESSAGE.setSettings, settings }, view.reload);
  };
}

/**
 * The one allowance the popup shows. The visible label repeats in every popup,
 * so the accessible name of the removal names the site.
 */
export function renderTabAllowance(view: PopupView): void {
  const allowance = view.allowance;

  setHidden('tab-allowance', allowance === null);

  if (allowance === null) {
    return;
  }

  setText('tab-allowance-label', tabAllowanceLabel(allowance.host));
  setText('tab-allowance-detail', SCOPE_DETAIL[allowance.scope]);
  setText('tab-allowance-remove', REMOVE_LABEL);

  const remove = roleElement('tab-allowance-remove');

  if (remove === null) {
    return;
  }

  remove.setAttribute('aria-label', removeAllowanceLabel(allowance.host));
  remove.onclick = (): void => {
    sender.send(revokeMessage(allowance), view.reload);
  };
}

/** The pause is one hour from now, and a second press resumes at once. */
export function renderPause(view: PopupView): void {
  setText('pause-label', PAUSE_LABEL);
  setText('pause-detail', view.paused ? PAUSE_ACTIVE_DETAIL : PAUSE_IDLE_DETAIL);
  setText('pause-button', view.paused ? RESUME_LABEL : PAUSE_BUTTON_LABEL);

  const button = roleElement('pause-button');

  if (button === null) {
    return;
  }

  button.onclick = (): void => {
    const until = view.paused ? 0 : view.now + PAUSE_DURATION_MS;

    sender.send({ type: MESSAGE.pause, until }, view.reload);
  };
}

export function renderAllowances(view: PopupView): void {
  setText('allowances-label', ALLOWED_SITES);
  setText('allowance-count', allowanceCount(view.count));
  setText('manage', MANAGE_LABEL);

  const manage = roleElement('manage');

  if (manage !== null) {
    manage.onclick = (): void => {
      sender.guard(() => chrome.runtime.openOptionsPage());
    };
  }
}

function setLink(role: string, href: string, text: string): void {
  const element = roleElement(role);

  if (!(element instanceof HTMLAnchorElement)) {
    return;
  }

  element.textContent = text;
  element.setAttribute('href', href);
}

/**
 * The three links leave the extension. The report carries no URL, because the
 * popup is not a block page; a context that cannot name its build hides it
 * rather than open a form that omits the version.
 */
export function renderLinks(view: PopupView): void {
  const version = currentVersion();

  setLink('how-it-works', `${view.apiBase}/`, HOW_IT_WORKS_LABEL);
  setLink('privacy', `${view.apiBase}/privacy`, PRIVACY_LABEL);

  if (version === null) {
    setHidden('report', true);
    return;
  }

  setHidden('report', false);
  setLink(
    'report',
    reportUrl({ url: null, listVersion: view.list.version, extensionVersion: version }),
    REPORT_FALSE_POSITIVE_LABEL,
  );
}

export function renderList(view: PopupView): void {
  setText('list-label', LIST_LABEL);
  setText('list-detail', listDetail(view.list));
}
