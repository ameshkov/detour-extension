// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AllowanceScope } from './allowances';
import { LIST_STORAGE_VERSION, PAUSE_DURATION_MS, STORAGE } from './constants';
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
import { startPopup } from './popup';
import { reportUrl } from './report';
import type { Settings } from './storage';
import { BUNDLED_LIST } from './storage';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import { mountShell, readShell, role } from './testing/shell';

const SHELL = readShell('popup.html');

const API_BASE = 'https://detour-api.invalid';
const NOW = Date.UTC(2026, 10, 13, 12, 0);
const ACTIVE_HOST = 'cnet.com';

let fake: FakeChrome;

function link(name: string): HTMLAnchorElement {
  const element = role(name);

  if (!(element instanceof HTMLAnchorElement)) {
    throw new Error(`the shell has no ${name} link`);
  }

  return element;
}

function switchElement(): HTMLInputElement {
  const element = role('enabled');

  if (!(element instanceof HTMLInputElement)) {
    throw new Error('the shell has no enabled switch');
  }

  return element;
}

function press(name: string): void {
  role(name).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function pressSwitch(checked: boolean): void {
  const element = switchElement();

  element.checked = checked;
  element.dispatchEvent(new Event('change'));
}

function messagesOfType(type: string): unknown[] {
  return fake.calls.messages.filter((message) => (message as { type?: string }).type === type);
}

type StoredEntry = { host: string; tabId?: number; addedAt: number };

/** The store a scope writes, and the key inside it. */
const STORE_OF: Record<AllowanceScope, { area: 'local' | 'session'; key: string }> = {
  tab: { area: 'session', key: STORAGE.allowTabs },
  session: { area: 'session', key: STORAGE.allowSession },
  always: { area: 'local', key: STORAGE.allowAlways },
};

function storeEntries(scope: AllowanceScope, entries: StoredEntry[]): void {
  const { area, key } = STORE_OF[scope];

  fake.storage[area].values[key] = entries;
}

function storeSettings(settings: Settings): void {
  fake.storage.local.values[STORAGE.settings] = settings;
}

function storeList(): { version: number; sites: number; updated: string } {
  const list = {
    ...BUNDLED_LIST,
    version: 9,
    updated: '2026-11-05',
    sites: BUNDLED_LIST.sites.slice(0, 1),
  };

  fake.storage.local.values[STORAGE.list] = {
    storageVersion: LIST_STORAGE_VERSION,
    fetchedAt: NOW,
    list,
  };

  return { version: 9, sites: 1, updated: '2026-11-05' };
}

/**
 * The service worker's three writes, against the fake store: a removal drops the
 * entry it names, a save stores the settings, and a pause stores its time. The
 * popup renders from the store afterwards, so a control that only reflects the
 * press fails the tests.
 */
function answerWrites(): void {
  fake.respond('revoke', (message) => {
    const { scope, host, tabId } = message as {
      scope: AllowanceScope;
      host: string;
      tabId?: number;
    };
    const { area, key } = STORE_OF[scope];
    const entries = (fake.storage[area].values[key] as StoredEntry[] | undefined) ?? [];

    fake.storage[area].values[key] = entries.filter(
      (entry) => !(entry.host === host && entry.tabId === tabId),
    );

    return { ok: true, allowances: message };
  });
  fake.respond('setSettings', (message) => {
    const { settings } = message as { settings: Settings };

    storeSettings(settings);

    return { ok: true, settings };
  });
  fake.respond('pause', (message) => {
    const { until } = message as { until: number };

    fake.storage.local.values[STORAGE.pauseUntil] = until;

    return { ok: true, pauseUntil: until };
  });
}

async function start(): Promise<void> {
  await startPopup({ apiBase: API_BASE, now: NOW });
}

beforeEach(() => {
  fake = installFakeChrome();
  answerWrites();
  mountShell(SHELL);
});

afterEach(() => {
  document.body.innerHTML = '';
  resetFakeChrome();
  vi.restoreAllMocks();
});

describe('the state of the list', () => {
  it('shows the allowance of the active tab and its scope', async () => {
    storeEntries('always', [{ host: ACTIVE_HOST, addedAt: NOW }]);

    await start();

    expect(role('state').textContent).toBe(POPUP_ON);
    expect(role('state').dataset.state).toBe('on');
    expect(role('tab-allowance').hidden).toBe(false);
    expect(role('tab-allowance-label').textContent).toBe(tabAllowanceLabel(ACTIVE_HOST));
    expect(role('tab-allowance-detail').textContent).toBe(SCOPE_DETAIL.always);
  });

  it('prefers the permanent entry over a tab entry', async () => {
    storeEntries('tab', [{ host: ACTIVE_HOST, tabId: 11, addedAt: NOW }]);
    storeEntries('always', [{ host: ACTIVE_HOST, addedAt: NOW }]);

    await start();

    expect(role('tab-allowance-detail').textContent).toBe(SCOPE_DETAIL.always);
  });

  it('shows no allowance row without one', async () => {
    await start();

    expect(role('tab-allowance').hidden).toBe(true);
    expect(role('tab-allowance-label').textContent).toBe('');
  });

  it('counts the allowances of every store and offers manage', async () => {
    storeEntries('tab', [{ host: ACTIVE_HOST, tabId: 11, addedAt: NOW }]);
    storeEntries('session', [{ host: 'forbes.com', addedAt: NOW }]);
    storeEntries('always', [{ host: 'businessinsider.com', addedAt: NOW }]);

    await start();

    expect(role('allowances-label').textContent).toBe(ALLOWED_SITES);
    expect(role('allowance-count').textContent).toBe(allowanceCount(3));
    expect(role('allowance-count').textContent).toBe('3 sites');
    expect(role('manage').textContent).toBe(MANAGE_LABEL);
    expect(role('manage')).toBeInstanceOf(HTMLButtonElement);
    expect((role('manage') as HTMLButtonElement).disabled).toBe(false);
  });

  it('opens the options page from manage', async () => {
    await start();
    press('manage');

    expect(fake.calls.openedOptionsPage).toBe(1);
  });

  /**
   * An invalidated context throws from `openOptionsPage`, and a runtime that
   * answers later can reject. Neither reaches the reader as an unhandled
   * rejection.
   */
  it('holds a manage press the runtime cannot answer', async () => {
    await start();

    const rejected = vi.fn((): Promise<void> => Promise.reject(new Error('invalidated')));
    const thrown = vi.fn((): Promise<void> => {
      throw new Error('no runtime');
    });

    fake.runtime.openOptionsPage = rejected;
    expect(() => press('manage')).not.toThrow();
    expect(rejected).toHaveBeenCalledTimes(1);

    fake.runtime.openOptionsPage = thrown;
    expect(() => press('manage')).not.toThrow();
    expect(thrown).toHaveBeenCalledTimes(1);
  });

  it('removes the allowance of the tab', async () => {
    storeEntries('tab', [{ host: ACTIVE_HOST, tabId: 11, addedAt: NOW }]);

    await start();

    const remove = role('tab-allowance-remove');

    expect(remove.textContent).toBe(REMOVE_LABEL);
    expect(remove.getAttribute('aria-label')).toBe(removeAllowanceLabel(ACTIVE_HOST));

    press('tab-allowance-remove');

    expect(messagesOfType('revoke')).toEqual([
      { type: 'revoke', scope: 'tab', host: ACTIVE_HOST, tabId: 11 },
    ]);

    await vi.waitFor(() => {
      expect(role('tab-allowance').hidden).toBe(true);
    });
  });

  it('shows the list version, the site count, and the date', async () => {
    const list = storeList();

    await start();

    expect(role('list-label').textContent).toBe(LIST_LABEL);
    expect(role('list-detail').textContent).toBe(listDetail(list));
  });

  it('holds no table', () => {
    expect(SHELL).not.toContain('<table');
  });
});

describe('the pause', () => {
  it('pauses the list for one hour', async () => {
    await start();

    expect(role('pause-label').textContent).toBe(PAUSE_LABEL);
    expect(role('pause-detail').textContent).toBe(PAUSE_IDLE_DETAIL);
    expect(role('pause-button').textContent).toBe(PAUSE_BUTTON_LABEL);

    press('pause-button');

    expect(PAUSE_DURATION_MS).toBe(3600000);
    expect(messagesOfType('pause')).toEqual([{ type: 'pause', until: NOW + PAUSE_DURATION_MS }]);

    await vi.waitFor(() => {
      expect(role('state').textContent).toBe(POPUP_PAUSED);
    });
  });

  it('resumes a paused list', async () => {
    fake.storage.local.values[STORAGE.pauseUntil] = NOW + 60000;

    await start();

    expect(role('state').textContent).toBe(POPUP_PAUSED);
    expect(role('state').dataset.state).toBe('paused');
    expect(role('pause-detail').textContent).toBe(PAUSE_ACTIVE_DETAIL);
    expect(role('pause-button').textContent).toBe(RESUME_LABEL);

    press('pause-button');

    expect(messagesOfType('pause')).toEqual([{ type: 'pause', until: 0 }]);

    await vi.waitFor(() => {
      expect(role('pause-button').textContent).toBe(PAUSE_BUTTON_LABEL);
    });
  });

  it('shows off when the extension is disabled', async () => {
    storeSettings({ enabled: false, autoOpenBest: false, imagesEnabled: true });

    await start();

    expect(role('state').textContent).toBe(POPUP_OFF);
    expect(role('state').dataset.state).toBe('off');
    expect(switchElement().checked).toBe(false);
    expect(role('pause-label').textContent).toBe(PAUSE_LABEL);
    expect(role('pause-detail').textContent).toBe(PAUSE_IDLE_DETAIL);
  });

  it('keeps the switch out of the pause', async () => {
    storeSettings({ enabled: true, autoOpenBest: false, imagesEnabled: true });
    fake.storage.local.values[STORAGE.pauseUntil] = NOW + 60000;

    await start();

    expect(role('state').textContent).toBe(POPUP_PAUSED);
    expect(role('state').dataset.state).toBe('paused');
    expect(switchElement().checked).toBe(true);
  });
});

describe('the switch of the list', () => {
  it('turns the list off from the header', async () => {
    storeSettings({ enabled: true, autoOpenBest: true, imagesEnabled: true });

    await start();

    expect(switchElement().checked).toBe(true);
    expect(switchElement().getAttribute('aria-label')).toBe(ENABLED_SWITCH_LABEL);
    expect(switchElement().getAttribute('role')).toBe('switch');

    pressSwitch(false);

    expect(messagesOfType('setSettings')).toEqual([
      {
        type: 'setSettings',
        settings: { enabled: false, autoOpenBest: true, imagesEnabled: true },
      },
    ]);

    await vi.waitFor(() => {
      expect(role('state').textContent).toBe(POPUP_OFF);
    });
  });

  it('turns the list on from the header', async () => {
    storeSettings({ enabled: false, autoOpenBest: true, imagesEnabled: true });

    await start();

    expect(switchElement().checked).toBe(false);
    expect(role('state').textContent).toBe(POPUP_OFF);

    pressSwitch(true);

    expect(messagesOfType('setSettings')).toEqual([
      { type: 'setSettings', settings: { enabled: true, autoOpenBest: true, imagesEnabled: true } },
    ]);

    await vi.waitFor(() => {
      expect(role('state').textContent).toBe(POPUP_ON);
    });
  });
});

describe('the popup links', () => {
  it('links how it works, the report, and the privacy page', async () => {
    await start();

    expect(link('how-it-works').textContent).toBe(HOW_IT_WORKS_LABEL);
    expect(link('how-it-works').getAttribute('href')).toBe(`${API_BASE}/`);
    expect(link('report').textContent).toBe(REPORT_FALSE_POSITIVE_LABEL);
    expect(link('report').getAttribute('href')).toBe(
      reportUrl({ url: null, listVersion: BUNDLED_LIST.version, extensionVersion: '0.1.0' }),
    );
    expect(link('privacy').textContent).toBe(PRIVACY_LABEL);
    expect(link('privacy').getAttribute('href')).toBe(`${API_BASE}/privacy`);

    for (const name of ['how-it-works', 'report', 'privacy']) {
      expect(link(name).getAttribute('target')).toBe('_blank');
      expect(link(name).getAttribute('rel')).toBe('noreferrer noopener');
    }

    expect(decodeURIComponent(link('report').getAttribute('href') ?? '')).not.toContain(
      'The page Detour stopped',
    );
  });
});
