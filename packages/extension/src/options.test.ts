// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AllowanceScope } from './allowances';
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
import { startOptionsPage } from './options';
import type { Settings } from './storage';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import { mountShell, readShell, role } from './testing/shell';

const ADDED_TODAY = Date.UTC(2026, 10, 13, 12, 41);
const ADDED_EARLIER = Date.UTC(2026, 10, 4, 9, 5);

let fake: FakeChrome;

function rows(): HTMLTableRowElement[] {
  return [...document.querySelectorAll<HTMLTableRowElement>('[data-role="allowance-rows"] tr')];
}

function cells(index: number): string[] {
  return [...(rows()[index]?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent ?? '');
}

function cellText(index: number, column: number): string {
  return cells(index)[column] ?? '';
}

function removeButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-role="allowance-rows"] button')];
}

function pressRemove(index = 0): void {
  removeButtons()[index]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function checkbox(name: string): HTMLInputElement {
  const element = role(name);

  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`the shell has no ${name} checkbox`);
  }

  return element;
}

function press(name: string, checked: boolean): void {
  const element = checkbox(name);

  element.checked = checked;
  element.dispatchEvent(new Event('change'));
}

function messagesOfType(type: string): unknown[] {
  return fake.calls.messages.filter((message) => (message as { type?: string }).type === type);
}

type StoredEntry = { host: string; tabId?: number; addedAt: number };

/** The store a scope writes, and the key inside it. */
const STORE_OF: Record<AllowanceScope, { area: 'local' | 'session'; key: string }> = {
  tab: { area: 'session', key: 'allowTabs' },
  session: { area: 'session', key: 'allowSession' },
  always: { area: 'local', key: 'allowAlways' },
};

function storedEntries(scope: AllowanceScope): StoredEntry[] {
  const { area, key } = STORE_OF[scope];

  return (fake.storage[area].values[key] as StoredEntry[] | undefined) ?? [];
}

function storeEntries(scope: AllowanceScope, entries: StoredEntry[]): void {
  const { area, key } = STORE_OF[scope];

  fake.storage[area].values[key] = entries;
}

/**
 * The service worker's two writes, against the fake store: a removal drops the
 * entry it names, and a save stores the settings it was given. The page renders
 * from the store afterwards, so a row or a checkbox that only reflects the press
 * fails the tests.
 */
function answerWrites(): void {
  fake.respond('revoke', (message) => {
    const { scope, host, tabId } = message as {
      scope: AllowanceScope;
      host: string;
      tabId?: number;
    };

    storeEntries(
      scope,
      storedEntries(scope).filter((entry) => !(entry.host === host && entry.tabId === tabId)),
    );

    return { ok: true, allowances: message };
  });
  fake.respond('setSettings', (message) => {
    const { settings } = message as { settings: Settings };

    fake.storage.local.values.settings = settings;

    return { ok: true, settings };
  });
}

beforeEach(() => {
  fake = installFakeChrome();
  answerWrites();
  mountShell(readShell('options.html'));
});

afterEach(() => {
  document.body.innerHTML = '';
  resetFakeChrome();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the options page copy', () => {
  it('states what the page does and which sites it lists', async () => {
    await startOptionsPage();

    expect(role('options-heading').textContent).toBe(OPTIONS_HEADING);
    expect(role('allowed-heading').textContent).toBe(ALLOWED_SITES);
    expect(role('allowed-intro').textContent).toBe(ALLOWED_SITES_INTRO);
    expect(role('reading-heading').textContent).toBe(READING_HEADING);
    expect(role('th-site').textContent).toBe(COLUMN_SITE);
    expect(role('th-scope').textContent).toBe(COLUMN_SCOPE);
    expect(role('th-added').textContent).toBe(COLUMN_ADDED);
  });
});

describe('the allowance table', () => {
  it('lists the allowances with their scope and date', async () => {
    fake.storage.session.values.allowTabs = [
      { host: 'forbes.com', tabId: 11, addedAt: ADDED_TODAY },
    ];
    fake.storage.local.values.allowAlways = [
      { host: 'businessinsider.com', addedAt: ADDED_EARLIER },
    ];

    await startOptionsPage();

    expect(rows()).toHaveLength(2);
    expect(cells(0)).toEqual(['forbes.com', SCOPE_LABEL.tab, '2026-11-13', REMOVE_LABEL]);
    expect(cells(1)).toEqual([
      'businessinsider.com',
      SCOPE_LABEL.always,
      '2026-11-04',
      REMOVE_LABEL,
    ]);
  });

  it('orders the stores tab, session, and always before the date', async () => {
    fake.storage.local.values.allowAlways = [
      { host: 'always.example', addedAt: ADDED_EARLIER },
      { host: 'always-late.example', addedAt: ADDED_TODAY },
    ];
    fake.storage.session.values.allowSession = [{ host: 'session.example', addedAt: ADDED_TODAY }];
    fake.storage.session.values.allowTabs = [
      { host: 'tab.example', tabId: 11, addedAt: ADDED_TODAY },
    ];

    await startOptionsPage();

    expect(rows().map((_row, index) => cellText(index, 0))).toEqual([
      'tab.example',
      'session.example',
      'always.example',
      'always-late.example',
    ]);
    expect(cellText(2, 2)).toBe('2026-11-04');
    expect(cellText(3, 2)).toBe('2026-11-13');
  });

  it('removes an allowance by host', async () => {
    fake.storage.session.values.allowSession = [{ host: 'forbes.com', addedAt: ADDED_TODAY }];

    await startOptionsPage();
    pressRemove();

    await vi.waitFor(() => {
      expect(messagesOfType('revoke')).toEqual([
        { type: 'revoke', scope: 'session', host: 'forbes.com' },
      ]);
    });
    expect(messagesOfType('revoke')[0]).not.toHaveProperty('tabId');

    await vi.waitFor(() => {
      expect(rows()).toHaveLength(0);
    });
    expect(fake.storage.session.values.allowSession).toEqual([]);
    expect(role('allowed-empty').hidden).toBe(false);
  });

  it('names the site in the accessible name of each remove button', async () => {
    fake.storage.local.values.allowAlways = [
      { host: 'forbes.com', addedAt: ADDED_TODAY },
      { host: 'cnet.com', addedAt: ADDED_EARLIER },
    ];

    await startOptionsPage();

    expect(removeButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      removeAllowanceLabel('cnet.com'),
      removeAllowanceLabel('forbes.com'),
    ]);
    expect(removeButtons().map((button) => button.textContent)).toEqual([
      REMOVE_LABEL,
      REMOVE_LABEL,
    ]);
  });

  it('removes a tab allowance with its tab', async () => {
    fake.storage.session.values.allowTabs = [{ host: 'cnet.com', tabId: 11, addedAt: ADDED_TODAY }];

    await startOptionsPage();
    pressRemove();

    await vi.waitFor(() => {
      expect(messagesOfType('revoke')).toEqual([
        { type: 'revoke', scope: 'tab', host: 'cnet.com', tabId: 11 },
      ]);
    });
  });

  it('removes an allowance of a site that left the list', async () => {
    fake.storage.local.values.allowAlways = [
      { host: 'old-publisher.example', addedAt: ADDED_EARLIER },
    ];

    await startOptionsPage();
    pressRemove();

    await vi.waitFor(() => {
      expect(messagesOfType('revoke')).toEqual([
        { type: 'revoke', scope: 'always', host: 'old-publisher.example' },
      ]);
    });
  });

  it('says so when no site is allowed', async () => {
    await startOptionsPage();

    expect(role('allowed-empty').textContent).toBe(NO_ALLOWANCES);
    expect(role('allowed-empty').hidden).toBe(false);
    expect(role('allowance-table').hidden).toBe(true);
    expect(rows()).toHaveLength(0);
  });

  it('hides the empty line while an allowance is listed', async () => {
    fake.storage.local.values.allowAlways = [{ host: 'forbes.com', addedAt: ADDED_TODAY }];

    await startOptionsPage();

    expect(role('allowance-table').hidden).toBe(false);
    expect(role('allowed-empty').hidden).toBe(true);
  });
});

describe('the reading settings', () => {
  it('shows the two reading settings', async () => {
    fake.storage.local.values.settings = {
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: false,
    };

    await startOptionsPage();

    expect(role('auto-open-label').textContent).toBe(AUTO_OPEN_SETTING_LABEL);
    expect(role('auto-open-detail').textContent).toBe(AUTO_OPEN_SETTING_DETAIL);
    expect(role('images-label').textContent).toBe(IMAGES_SETTING_LABEL);
    expect(role('images-detail').textContent).toBe(IMAGES_SETTING_DETAIL);
    expect(checkbox('auto-open').checked).toBe(true);
    expect(checkbox('images').checked).toBe(false);
  });

  it('saves a setting with the other two values kept', async () => {
    fake.storage.local.values.settings = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };

    await startOptionsPage();
    press('auto-open', true);

    await vi.waitFor(() => {
      expect(messagesOfType('setSettings')).toEqual([
        {
          type: 'setSettings',
          settings: { enabled: true, autoOpenBest: true, imagesEnabled: true },
        },
      ]);
    });
    expect(fake.storage.local.values.settings).toEqual({
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: true,
    });
  });

  it('saves the images setting on its own', async () => {
    fake.storage.local.values.settings = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };

    await startOptionsPage();
    press('images', false);

    await vi.waitFor(() => {
      expect(messagesOfType('setSettings')).toEqual([
        {
          type: 'setSettings',
          settings: { enabled: true, autoOpenBest: false, imagesEnabled: false },
        },
      ]);
    });
  });

  it('renders the settings the store holds after a save', async () => {
    fake.storage.local.values.settings = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
    };
    // The responder stores a value the page did not send, so a page that keeps
    // its own checked state instead of reading the store again fails here.
    fake.respond('setSettings', (message) => {
      const { settings } = message as { settings: Settings };
      const stored: Settings = { ...settings, imagesEnabled: false };

      fake.storage.local.values.settings = stored;

      return { ok: true, settings: stored };
    });

    await startOptionsPage();
    press('auto-open', true);

    await vi.waitFor(() => {
      expect(checkbox('images').checked).toBe(false);
    });
    expect(checkbox('auto-open').checked).toBe(true);
    expect(fake.storage.local.values.settings).toEqual({
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: false,
    });
  });
});

describe('a message that fails', () => {
  it('still renders the page and logs the failure', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation((): void => undefined);
    const error = new Error('no listener');

    fake.storage.local.values.allowAlways = [{ host: 'forbes.com', addedAt: ADDED_TODAY }];
    fake.storage.local.values.settings = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: false,
    };
    // Both writes reject, so the page renders again from storage alone: the
    // removal never happened and the press of the switch is undone by the read.
    fake.respond('revoke', () => Promise.reject(error));
    fake.respond('setSettings', () => Promise.reject(error));

    await startOptionsPage();
    vi.stubGlobal('DEV', true);
    pressRemove();
    press('images', true);

    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledTimes(2);
    });
    expect(log).toHaveBeenCalledWith('[detour] options: the message failed', error);

    expect(role('options-heading').textContent).toBe(OPTIONS_HEADING);
    await vi.waitFor(() => {
      expect(checkbox('images').checked).toBe(false);
    });
    expect(rows()).toHaveLength(1);
  });
});
