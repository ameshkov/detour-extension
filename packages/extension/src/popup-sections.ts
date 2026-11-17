import { MESSAGE } from './constants';
import {
  ENABLED_SWITCH_LABEL,
  HOW_IT_WORKS_LABEL,
  PAUSE_DURATION_LABELS,
  PAUSE_MENU_LABEL,
  PAUSE_ROW_LABEL,
  PAUSE_TODAY_NOTE,
  POPUP_OFF,
  POPUP_ON,
  POPUP_PAUSED,
  PRIVACY_LABEL,
  RESUME_LABEL,
  SETTINGS_LABEL,
  SHOW_ALTERNATIVES_LABEL,
  SITE_LISTED,
  SITE_REPORT_HINT,
  SITE_UNLISTED,
  WALL_LABEL,
  WALL_PRACTICE,
  pausedRowLabel,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import type { PauseKind } from './pause';
import { PAUSE_KINDS, pauseUntilFor } from './pause';
import { createPageSender } from './page-send';
import type { PopupView } from './popup';
import { reportUrl } from './report';
import type { Settings } from './storage';
import { currentVersion } from './version';

type Tone = 'on' | 'off' | 'paused';

const sender = createPageSender('popup');

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
 * The block answers for the page in front of the reader, so both states say
 * something and each carries one action: the alternatives when the list knows
 * the site, and the report sentence when it does not.
 */
export function renderSite(view: PopupView): void {
  const site = view.site;

  setHidden('site', site === null);

  if (site === null) {
    return;
  }

  setText('site-text', `${site.host} ${site.listed ? SITE_LISTED : SITE_UNLISTED}`);
  setText('site-wall', site.wall === null ? '' : WALL_LABEL[site.wall]);
  setText('site-detail', site.wall === null ? '' : WALL_PRACTICE[site.wall]);
  setHidden('site-wall', !site.listed);

  const row = roleElement('site-row');

  if (row !== null) {
    row.dataset.listed = String(site.listed);
  }

  setHidden('site-alternatives', !site.listed);
  setText('site-alternatives-label', SHOW_ALTERNATIVES_LABEL);

  const alternatives = roleElement('site-alternatives');

  if (alternatives !== null) {
    alternatives.onclick = (): void => {
      sender.send(
        { type: MESSAGE.showAlternatives, tabId: site.tabId, url: site.url },
        view.reload,
      );
    };
  }

  // The report names the page, the list, and the build. A context that cannot
  // name its build hides the link rather than open a form that omits the version.
  const version = currentVersion();
  const report = roleElement('site-report');
  const showReport = !site.listed && version !== null;

  setHidden('site-report', !showReport);

  if (report instanceof HTMLAnchorElement && version !== null) {
    report.textContent = SITE_REPORT_HINT;
    report.setAttribute(
      'href',
      reportUrl({ url: site.url, listVersion: view.listVersion, extensionVersion: version }),
    );
  }
}

function setDurationsOpen(open: boolean): void {
  setHidden('durations', !open);

  const pause = roleElement('pause');

  if (pause !== null) {
    pause.setAttribute('aria-expanded', String(open));
  }
}

/**
 * The row is the whole control at rest, and the durations unfold under it. A
 * paused row states the remainder, and the resume sits beside the label so the
 * countdown never becomes a row of its own.
 */
export function renderPause(view: PopupView): void {
  const label = view.paused ? pausedRowLabel(view.remaining) : PAUSE_ROW_LABEL;
  const pause = roleElement('pause');

  setText('pause-label', label);
  setText('resume', RESUME_LABEL);

  const labelElement = roleElement('pause-label');

  if (labelElement !== null) {
    labelElement.dataset.until = view.paused ? String(view.until) : '';
  }

  setHidden('resume', !view.paused);
  setDurationsOpen(false);

  if (pause !== null) {
    pause.setAttribute(
      'aria-label',
      view.paused ? `${label}. ${PAUSE_MENU_LABEL}` : PAUSE_ROW_LABEL,
    );
    pause.onclick = (): void => {
      const list = roleElement('durations');

      setDurationsOpen(list?.hidden !== false);
    };
  }

  const resume = roleElement('resume');

  if (resume !== null) {
    resume.onclick = (): void => {
      sender.send({ type: MESSAGE.pause, until: 0, session: false }, view.reload);
    };
  }

  renderDurations(view);
}

/** One row per duration, and the chosen one replaces whatever pause was running. */
function renderDurations(view: PopupView): void {
  for (const kind of PAUSE_KINDS) {
    const role = `duration-${kind}`;
    const button = roleElement(role);

    if (button === null) {
      continue;
    }

    if (kind === 'today') {
      setText('duration-today-label', PAUSE_DURATION_LABELS.today);
      setText('duration-today-note', PAUSE_TODAY_NOTE);
    } else {
      button.textContent = PAUSE_DURATION_LABELS[kind as PauseKind];
    }

    button.onclick = (): void => {
      sender.send(
        {
          type: MESSAGE.pause,
          until: pauseUntilFor(kind, view.now),
          session: kind === 'session',
        },
        view.reload,
      );
      setDurationsOpen(false);
    };
  }
}

export function renderSettings(): void {
  const settings = roleElement('settings');

  setText('settings-label', SETTINGS_LABEL);

  if (settings !== null) {
    settings.onclick = (): void => {
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

/** The two links leave the extension. Reporting lives on the site block instead. */
export function renderLinks(view: PopupView): void {
  setLink('how-it-works', `${view.apiBase}/`, HOW_IT_WORKS_LABEL);
  setLink('privacy', `${view.apiBase}/privacy`, PRIVACY_LABEL);
}
