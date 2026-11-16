import type { AllowanceScope, AllowanceState } from './allowances';
import { MESSAGE } from './constants';
import {
  ALLOWED_SITES,
  ALLOWED_SITES_INTRO,
  AUTO_OPEN_SETTING_DETAIL,
  AUTO_OPEN_SETTING_LABEL,
  COLUMN_ADDED,
  COLUMN_SCOPE,
  COLUMN_SITE,
  IMAGES_SETTING_DETAIL,
  IMAGES_SETTING_LABEL,
  NO_ALLOWANCES,
  OPTIONS_HEADING,
  READING_HEADING,
  REMOVE_LABEL,
  SCOPE_LABEL,
  removeAllowanceLabel,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import type { RevokeMessage } from './messages';
import { createPageSender } from './page-send';
import type { Settings } from './storage';
import { readAllowances, readSettings } from './storage';

export type OptionsAllowance = {
  host: string;
  scope: AllowanceScope;
  tabId?: number;
  addedAt: number;
};

export type OptionsView = {
  allowances: OptionsAllowance[];
  settings: Settings;
  reload: () => void;
};

/** The order of the table: the tab store, then the session store, then the permanent one. */
const SCOPES: readonly AllowanceScope[] = ['tab', 'session', 'always'];

const STORE_OF: Record<AllowanceScope, keyof AllowanceState> = {
  tab: 'allowTabs',
  session: 'allowSession',
  always: 'allowAlways',
};

const sender = createPageSender('options');

const READING_SETTINGS = [
  {
    role: 'auto-open',
    key: 'autoOpenBest',
    label: AUTO_OPEN_SETTING_LABEL,
    detail: AUTO_OPEN_SETTING_DETAIL,
  },
  {
    role: 'images',
    key: 'imagesEnabled',
    label: IMAGES_SETTING_LABEL,
    detail: IMAGES_SETTING_DETAIL,
  },
] as const;

/** The calendar date of an entry in UTC, so a row reads the same on every machine. */
function utcDate(addedAt: number): string {
  return new Date(addedAt).toISOString().slice(0, 10);
}

/** Every entry of the three stores, in scope order and then by the date it was added. */
function flattenAllowances(state: AllowanceState): OptionsAllowance[] {
  return SCOPES.flatMap((scope) =>
    [...state[STORE_OF[scope]]]
      .sort((left, right) => left.addedAt - right.addedAt)
      .map((entry) => ({ ...entry, scope })),
  );
}

/** A tab removal names its tab, so it never drops another tab's entry. */
function revokeMessage(entry: OptionsAllowance): RevokeMessage {
  const message = { type: MESSAGE.revoke, scope: entry.scope, host: entry.host };

  return entry.tabId === undefined ? message : { ...message, tabId: entry.tabId };
}

function removeButton(entry: OptionsAllowance, reload: () => void): HTMLButtonElement {
  const button = document.createElement('button');

  button.type = 'button';
  button.textContent = REMOVE_LABEL;
  button.setAttribute('aria-label', removeAllowanceLabel(entry.host));
  button.onclick = (): void => {
    sender.send(revokeMessage(entry), reload);
  };

  return button;
}

function allowanceRow(entry: OptionsAllowance, reload: () => void): HTMLTableRowElement {
  const row = document.createElement('tr');

  for (const text of [entry.host, SCOPE_LABEL[entry.scope], utcDate(entry.addedAt)]) {
    const cell = document.createElement('td');
    cell.textContent = text;
    row.append(cell);
  }

  const actions = document.createElement('td');
  actions.append(removeButton(entry, reload));
  row.append(actions);

  return row;
}

function renderAllowances(view: OptionsView): void {
  const rows = roleElement('allowance-rows');

  if (rows !== null) {
    rows.replaceChildren(...view.allowances.map((entry) => allowanceRow(entry, view.reload)));
  }

  const empty = view.allowances.length === 0;

  setHidden('allowance-table', empty);
  setHidden('allowed-empty', !empty);
}

/**
 * One reading setting. A press sends all three values, so the setting the reader
 * did not touch keeps the value that was stored.
 */
function renderSetting(setting: (typeof READING_SETTINGS)[number], view: OptionsView): void {
  setText(`${setting.role}-label`, setting.label);
  setText(`${setting.role}-detail`, setting.detail);

  const element = roleElement(setting.role);

  if (!(element instanceof HTMLInputElement)) {
    return;
  }

  element.checked = view.settings[setting.key];
  element.onchange = (): void => {
    const settings: Settings = { ...view.settings, [setting.key]: element.checked };

    sender.send({ type: MESSAGE.setSettings, settings }, view.reload);
  };
}

export function renderOptions(view: OptionsView): void {
  setText('options-heading', OPTIONS_HEADING);
  setText('allowed-heading', ALLOWED_SITES);
  setText('allowed-intro', ALLOWED_SITES_INTRO);
  setText('allowed-empty', NO_ALLOWANCES);
  setText('reading-heading', READING_HEADING);
  setText('th-site', COLUMN_SITE);
  setText('th-scope', COLUMN_SCOPE);
  setText('th-added', COLUMN_ADDED);

  renderAllowances(view);

  for (const setting of READING_SETTINGS) {
    renderSetting(setting, view);
  }
}

/**
 * Reads the three allowance stores and the settings, and renders the page. The
 * page writes nothing itself: every removal and every setting is a message, and
 * the reload that follows renders what the service worker stored.
 */
export async function startOptionsPage(): Promise<void> {
  const load = async (): Promise<void> => {
    const [allowances, settings] = await Promise.all([readAllowances(), readSettings()]);

    renderOptions({
      allowances: flattenAllowances(allowances),
      settings,
      reload: () => void load(),
    });
  };

  await load();
}
