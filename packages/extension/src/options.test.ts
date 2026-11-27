// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AllowanceScope } from './allowances';
import {
  ALLOWED_SITES,
  ALLOWED_SITES_INTRO,
  AUTO_OPEN_SETTING_DETAIL,
  AUTO_OPEN_SETTING_LABEL,
  APPEARANCE_HEADING,
  CACHE_CONFIRM,
  CACHE_DETAIL,
  CACHE_HEADING,
  CLEAR_CACHE_LABEL,
  CLEARING_LABEL,
  COLUMN_ADDED,
  COLUMN_SCOPE,
  COLUMN_SITE,
  IMAGES_SETTING_DETAIL,
  IMAGES_SETTING_LABEL,
  NO_ALLOWANCES,
  OPTIONS_HEADING,
  COLUMN_WHY,
  METERED_NOTE,
  NO_WALL_NOTE,
  READING_HEADING,
  REMOVE_LABEL,
  SCOPE_LABEL,
  WALL_CATEGORY_DETAIL,
  WALL_CATEGORY_LABEL,
  WALL_TYPE_LABEL,
  THEME_CHOICES,
  THEME_SETTING_DETAIL,
  THEME_SETTING_LABEL,
  WALLS_HEADING,
  WALLS_INTRO,
  cacheCleared,
  removeAllowanceLabel,
  wallCellLabel,
} from './copy';
import { startOptionsPage } from './options';
import { defaultWalls } from './walls';
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

function clickRole(name: string): void {
  role(name).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function pressClear(): void {
  role('clear-cache')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function wallRows(): HTMLTableRowElement[] {
  return [...document.querySelectorAll<HTMLTableRowElement>('[data-role="wall-rows"] tr')];
}

function wallChecks(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('[data-role="wall-check"]')];
}

function wallCheck(type: string, category: string): HTMLInputElement {
  const found = wallChecks().find(
    (element) =>
      element.getAttribute('aria-label') === wallCellLabel(category as never, type as never),
  );

  if (found === undefined) {
    throw new Error(`the table has no ${category} ${type} cell`);
  }

  return found;
}

function pressWall(type: string, category: string, chosen: boolean): void {
  const element = wallCheck(type, category);

  element.checked = chosen;
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
    expect(role('appearance-heading').textContent).toBe(APPEARANCE_HEADING);
    expect(role('theme-label').textContent).toBe(THEME_SETTING_LABEL);
    expect(role('theme-detail').textContent).toBe(THEME_SETTING_DETAIL);
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

describe('the walls table', () => {
  it('names the section and explains what a tick does', async () => {
    await startOptionsPage();

    expect(role('walls-heading').textContent).toBe(WALLS_HEADING);
    expect(role('walls-intro').textContent).toBe(WALLS_INTRO);
    expect(role('metered-note').textContent).toBe(METERED_NOTE);
    expect(role('no-wall-note').textContent).toBe(NO_WALL_NOTE);
    expect(role('th-why').textContent).toBe(COLUMN_WHY);
    expect(role('th-hard').textContent).toBe(WALL_TYPE_LABEL.hard);
    expect(role('th-soft').textContent).toBe(WALL_TYPE_LABEL.soft);
    expect(role('th-metered').textContent).toBe(WALL_TYPE_LABEL.metered);
  });

  it('draws one row per category and one cell per type', async () => {
    await startOptionsPage();

    expect(wallRows()).toHaveLength(7);
    expect(wallRows()[0]?.querySelector('[data-role="wall-name"]')?.textContent).toBe(
      WALL_CATEGORY_LABEL.adblock,
    );
    expect(wallRows()[0]?.querySelector('[data-role="wall-detail"]')?.textContent).toBe(
      WALL_CATEGORY_DETAIL.adblock,
    );
    expect(role('wall-rows').querySelectorAll('td')).toHaveLength(21);
  });

  it('holds no box in a metered cell outside the paywall row', async () => {
    await startOptionsPage();

    const empties = document.querySelectorAll('[data-role="wall-cell"][data-empty="true"]');

    expect(wallChecks()).toHaveLength(15);
    expect(empties).toHaveLength(6);
    expect(wallRows()[0]?.querySelectorAll('td')[2]?.getAttribute('data-empty')).toBe('true');
    expect(wallCheck('metered', 'paywall').checked).toBe(false);
  });

  it('ticks the default ad-blocker walls of both types', async () => {
    await startOptionsPage();

    expect(wallCheck('hard', 'adblock').checked).toBe(true);
    expect(wallCheck('soft', 'adblock').checked).toBe(true);
    expect(wallCheck('hard', 'paywall').checked).toBe(false);
  });

  it('sends the whole record when one cell changes', async () => {
    await startOptionsPage();
    pressWall('hard', 'paywall', true);

    await vi.waitFor(() => {
      expect(messagesOfType('setSettings')).toEqual([
        {
          type: 'setSettings',
          settings: {
            enabled: true,
            autoOpenBest: false,
            imagesEnabled: true,
            theme: 'system',
            walls: { hard: ['adblock', 'paywall'], soft: ['adblock'], metered: [] },
          },
        },
      ]);
    });
  });

  it('clears a cell the reader unticks', async () => {
    await startOptionsPage();
    pressWall('soft', 'adblock', false);

    await vi.waitFor(() => {
      expect(messagesOfType('setSettings')).toEqual([
        {
          type: 'setSettings',
          settings: {
            enabled: true,
            autoOpenBest: false,
            imagesEnabled: true,
            theme: 'system',
            walls: { hard: ['adblock'], soft: [], metered: [] },
          },
        },
      ]);
    });
  });

  it('returns the focus to the cell after the write', async () => {
    await startOptionsPage();
    pressWall('hard', 'paywall', true);

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(wallCheck('hard', 'paywall'));
    });
  });

  it('renders what the worker stored after a press', async () => {
    fake.respond('setSettings', () => {
      const stored: Settings = {
        enabled: true,
        autoOpenBest: false,
        imagesEnabled: true,
        theme: 'system',
        walls: { hard: [], soft: [], metered: ['paywall'] },
      };

      fake.storage.local.values.settings = stored;

      return { ok: true, settings: stored };
    });

    await startOptionsPage();
    pressWall('hard', 'region', true);

    await vi.waitFor(() => {
      expect(wallCheck('hard', 'adblock').checked).toBe(false);
    });
    expect(wallCheck('metered', 'paywall').checked).toBe(true);
  });
});

describe('the reading settings', () => {
  it('shows the two reading settings', async () => {
    fake.storage.local.values.settings = {
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: false,
      theme: 'system',
      walls: defaultWalls(),
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
      theme: 'system',
      walls: defaultWalls(),
    };

    await startOptionsPage();
    press('auto-open', true);

    await vi.waitFor(() => {
      expect(messagesOfType('setSettings')).toEqual([
        {
          type: 'setSettings',
          settings: {
            enabled: true,
            autoOpenBest: true,
            imagesEnabled: true,
            theme: 'system',
            walls: defaultWalls(),
          },
        },
      ]);
    });
    expect(fake.storage.local.values.settings).toEqual({
      enabled: true,
      autoOpenBest: true,
      imagesEnabled: true,
      theme: 'system',
      walls: defaultWalls(),
    });
  });

  it('saves the images setting on its own', async () => {
    fake.storage.local.values.settings = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
      theme: 'system',
      walls: defaultWalls(),
    };

    await startOptionsPage();
    press('images', false);

    await vi.waitFor(() => {
      expect(messagesOfType('setSettings')).toEqual([
        {
          type: 'setSettings',
          settings: {
            enabled: true,
            autoOpenBest: false,
            imagesEnabled: false,
            theme: 'system',
            walls: defaultWalls(),
          },
        },
      ]);
    });
  });

  it('renders the settings the store holds after a save', async () => {
    fake.storage.local.values.settings = {
      enabled: true,
      autoOpenBest: false,
      imagesEnabled: true,
      theme: 'system',
      walls: defaultWalls(),
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
      theme: 'system',
      walls: defaultWalls(),
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
      theme: 'system',
      walls: defaultWalls(),
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

describe('the cache', () => {
  it('states what the cache holds and hides the status', async () => {
    await startOptionsPage();

    expect(role('cache-heading').textContent).toBe(CACHE_HEADING);
    expect(role('cache-detail').textContent).toBe(CACHE_DETAIL);
    expect(role('clear-cache').textContent).toBe(CLEAR_CACHE_LABEL);
    expect(role('cache-status').hidden).toBe(true);
  });

  it('asks before it clears', async () => {
    const confirm = vi.fn(() => false);

    vi.stubGlobal('confirm', confirm);

    await startOptionsPage();
    pressClear();

    expect(confirm).toHaveBeenCalledWith(CACHE_CONFIRM);
    expect(messagesOfType('clearCache')).toEqual([]);
    expect(role('cache-status').hidden).toBe(true);
  });

  it('clears the cache and counts what it dropped', async () => {
    vi.stubGlobal('confirm', () => true);
    fake.respond('clearCache', () => ({ ok: true, cleared: 3 }));

    await startOptionsPage();
    pressClear();

    await vi.waitFor(() => {
      expect(messagesOfType('clearCache')).toEqual([{ type: 'clearCache' }]);
    });

    await vi.waitFor(() => {
      expect(role('cache-status').textContent).toBe(cacheCleared(3));
    });
    expect(role('cache-status').hidden).toBe(false);
  });

  it('waits for the answer before it takes another press', async () => {
    vi.stubGlobal('confirm', () => true);

    let settle!: (value: unknown) => void;

    fake.respond(
      'clearCache',
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );

    await startOptionsPage();
    pressClear();

    await vi.waitFor(() => {
      expect(role('cache-status').textContent).toBe(CLEARING_LABEL);
    });
    expect((role('clear-cache') as HTMLButtonElement).disabled).toBe(true);

    settle({ ok: true, cleared: 2 });

    await vi.waitFor(() => {
      expect(role('cache-status').textContent).toBe(cacheCleared(2));
    });
    expect((role('clear-cache') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says so when nothing was cached', async () => {
    vi.stubGlobal('confirm', () => true);
    fake.respond('clearCache', () => ({ ok: true, cleared: 0 }));

    await startOptionsPage();
    pressClear();

    await vi.waitFor(() => {
      expect(role('cache-status').textContent).toBe(cacheCleared(0));
    });
  });

  it('shows no status when the worker did not answer', async () => {
    vi.stubGlobal('confirm', () => true);

    await startOptionsPage();
    pressClear();

    await vi.waitFor(() => {
      expect(messagesOfType('clearCache')).toHaveLength(1);
    });
    await vi.waitFor(() => {
      expect(role('cache-status').hidden).toBe(true);
    });
    expect((role('clear-cache') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('the theme choice', () => {
  it('names the three choices and presses the stored one', async () => {
    await startOptionsPage();

    for (const choice of ['system', 'light', 'dark'] as const) {
      expect(role(`theme-${choice}`).textContent).toBe(THEME_CHOICES[choice]);
      expect(role(`theme-${choice}`).getAttribute('aria-pressed')).toBe(
        String(choice === 'system'),
      );
    }
  });

  it('stores the choice it paints', async () => {
    await startOptionsPage();
    clickRole('theme-dark');

    await vi.waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    expect(messagesOfType('setSettings')).toEqual([
      {
        type: 'setSettings',
        settings: {
          enabled: true,
          autoOpenBest: false,
          imagesEnabled: true,
          theme: 'dark',
          walls: defaultWalls(),
        },
      },
    ]);
    await vi.waitFor(() => {
      expect(role('theme-dark').getAttribute('aria-pressed')).toBe('true');
    });
  });
});
