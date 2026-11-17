// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_STORAGE_VERSION, PAUSE_DURATION_MS, STORAGE } from './constants';
import {
  ENABLED_SWITCH_LABEL,
  HOW_IT_WORKS_LABEL,
  PAUSE_DURATION_LABELS,
  PAUSE_ROW_LABEL,
  POPUP_OFF,
  POPUP_ON,
  POPUP_PAUSED,
  PRIVACY_LABEL,
  RESUME_LABEL,
  SETTINGS_LABEL,
  SHOW_ALTERNATIVES_LABEL,
  SITE_REPORT_HINT,
  WALL_LABEL,
  WALL_PRACTICE,
} from './copy';
import { nextMidnight } from './pause';
import { startPopup } from './popup';
import type { Settings } from './storage';
import { BUNDLED_LIST } from './storage';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import { mountShell, readShell, role } from './testing/shell';

const SHELL = readShell('popup.html');

const API_BASE = 'https://detour-api.invalid';
const NOW = Date.UTC(2026, 10, 13, 12, 0);
const LISTED_URL = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';
const UNLISTED_URL = 'https://example.com/a-story';

let fake: FakeChrome;

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

function storeSettings(settings: Settings): void {
  fake.storage.local.values[STORAGE.settings] = settings;
}

function storeList(): void {
  fake.storage.local.values[STORAGE.list] = {
    storageVersion: LIST_STORAGE_VERSION,
    fetchedAt: NOW,
    list: { ...BUNDLED_LIST, version: 9, updated: '2026-11-05' },
  };
}

function storeTimedPause(until: number): void {
  fake.storage.local.values[STORAGE.pauseUntil] = until;
}

function storeSessionPause(): void {
  fake.storage.session.values[STORAGE.pauseSession] = true;
}

/**
 * The service worker's writes, against the fake store: a save stores the
 * settings and a pause stores both of its keys. The popup renders from the store
 * afterwards, so a control that only reflects the press fails the tests.
 */
function answerWrites(): void {
  fake.respond('setSettings', (message) => {
    const { settings } = message as { settings: Settings };

    storeSettings(settings);

    return { ok: true, settings };
  });
  fake.respond('pause', (message) => {
    const { until, session } = message as { until: number; session: boolean };

    fake.storage.local.values[STORAGE.pauseUntil] = session ? 0 : until;
    fake.storage.session.values[STORAGE.pauseSession] = session;

    return { ok: true, pauseUntil: session ? 0 : until, session };
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
  vi.useRealTimers();
  document.body.innerHTML = '';
  resetFakeChrome();
  vi.restoreAllMocks();
});

describe('the site block', () => {
  it('says that a listed site is on the list and names the wall', async () => {
    await start();

    expect(role('site').hidden).toBe(false);
    expect(role('site-text').textContent).toBe('cnet.com is on the list');
    expect(role('site-row').dataset.listed).toBe('true');
    expect(role('site-wall').hidden).toBe(false);
    expect(role('site-wall').textContent).toBe(WALL_LABEL.soft);
    expect(role('site-detail').textContent).toBe(WALL_PRACTICE.soft);
    expect(role('site-alternatives').hidden).toBe(false);
    expect(role('site-alternatives-label').textContent).toBe(SHOW_ALTERNATIVES_LABEL);
    expect(role('site-report').hidden).toBe(true);
  });

  it('names the wall of every type of entry', async () => {
    for (const [wall, label] of Object.entries(WALL_LABEL)) {
      storeList();

      const entry = BUNDLED_LIST.sites[0]!;
      const list = fake.storage.local.values[STORAGE.list] as {
        list: { sites: Array<Record<string, unknown>> };
      };

      list.list.sites = [{ ...entry, wall }];

      await start();

      expect(role('site-wall').textContent).toBe(label);
      expect(role('site-detail').textContent).toBe(WALL_PRACTICE[wall as 'hard']);
    }
  });

  it('says that an unlisted site is not on the list and offers a report', async () => {
    fake.activeTabUrl = UNLISTED_URL;

    await start();

    expect(role('site').hidden).toBe(false);
    expect(role('site-text').textContent).toBe('example.com is not on the list');
    expect(role('site-row').dataset.listed).toBe('false');
    expect(role('site-wall').hidden).toBe(true);
    expect(role('site-detail').textContent).toBe('');
    expect(role('site-alternatives').hidden).toBe(true);
    expect(role('site-report').hidden).toBe(false);
    expect(role('site-report').textContent).toBe(SITE_REPORT_HINT);
    expect(role('site-report').getAttribute('href')).toContain('example.com');
    expect(document.querySelector('[data-role="site-report-label"]')).toBeNull();
  });

  it('draws the verdict without a dot', async () => {
    expect(document.querySelector('[data-role="site-mark"]')).toBeNull();

    await start();

    expect(document.querySelector('[data-role="site-mark"]')).toBeNull();
  });

  it('hides the block on a page that names no site', async () => {
    fake.activeTabUrl = 'chrome://extensions/';

    await start();

    expect(role('site').hidden).toBe(true);
  });

  it('asks the worker for the alternatives of this page', async () => {
    await start();
    press('site-alternatives');

    expect(messagesOfType('showAlternatives')).toEqual([
      { type: 'showAlternatives', tabId: fake.currentTabId, url: LISTED_URL },
    ]);
  });

  it('holds no list version and no site count', () => {
    expect(SHELL).not.toContain('data-role="list"');
    expect(SHELL).not.toContain('<table');
  });
});

describe('the pause row', () => {
  it('starts closed and does nothing until a duration is chosen', async () => {
    await start();

    expect(role('pause-label').textContent).toBe(PAUSE_ROW_LABEL);
    expect(role('durations').hidden).toBe(true);
    expect(role('pause').getAttribute('aria-expanded')).toBe('false');
    expect(role('resume').hidden).toBe(true);

    press('pause');

    expect(role('durations').hidden).toBe(false);
    expect(role('pause').getAttribute('aria-expanded')).toBe('true');
    expect(messagesOfType('pause')).toEqual([]);
  });

  it('draws its indicator with the chevron the other rows carry', async () => {
    await start();

    const other = role('settings').querySelector('.chevron');

    expect(role('pause-chevron').textContent).toBe('›');
    expect(role('pause-chevron').textContent).toBe(other?.textContent);
  });

  it('names all five durations', async () => {
    await start();
    press('pause');

    expect(role('duration-5m').textContent).toBe(PAUSE_DURATION_LABELS['5m']);
    expect(role('duration-30m').textContent).toBe(PAUSE_DURATION_LABELS['30m']);
    expect(role('duration-1h').textContent).toBe(PAUSE_DURATION_LABELS['1h']);
    expect(role('duration-today-label').textContent).toBe(PAUSE_DURATION_LABELS.today);
    expect(role('duration-today-note').textContent).toBe('Until midnight');
    expect(role('duration-session').textContent).toBe(PAUSE_DURATION_LABELS.session);
  });

  it('pauses for the duration the reader picks', async () => {
    await start();
    press('pause');
    press('duration-5m');

    expect(messagesOfType('pause')).toEqual([
      { type: 'pause', until: NOW + 5 * 60 * 1000, session: false },
    ]);
    expect(role('durations').hidden).toBe(true);

    await vi.waitFor(() => {
      expect(role('state').textContent).toBe(POPUP_PAUSED);
    });
  });

  it('pauses for an hour from the row it names', async () => {
    await start();
    press('pause');
    press('duration-1h');

    expect(PAUSE_DURATION_MS).toBe(3_600_000);
    expect(messagesOfType('pause')).toEqual([
      { type: 'pause', until: NOW + PAUSE_DURATION_MS, session: false },
    ]);
  });

  it('reads Today as the end of the day, not as an hour', async () => {
    await start();
    press('pause');
    press('duration-today');

    expect(messagesOfType('pause')).toEqual([
      { type: 'pause', until: nextMidnight(NOW), session: false },
    ]);
    expect(nextMidnight(NOW)).toBeGreaterThan(NOW);
  });

  it('pauses until the browser restarts in the session store', async () => {
    await start();
    press('pause');
    press('duration-session');

    expect(messagesOfType('pause')).toEqual([{ type: 'pause', until: 0, session: true }]);

    await vi.waitFor(() => {
      expect(role('pause-label').textContent).toBe('Paused · until Chrome restarts');
    });
  });

  it('reports a session pause without a clock', async () => {
    storeSessionPause();

    await start();

    expect(role('pause-label').textContent).toBe('Paused · until Chrome restarts');
    expect(role('resume').hidden).toBe(false);
    expect(role('state').dataset.state).toBe('paused');
  });

  it('reports a timed pause with the time it has left', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storeTimedPause(NOW + 90 * 1000);

    await start();

    expect(role('state').textContent).toBe(POPUP_PAUSED);
    expect(role('pause-label').textContent).toBe('Paused · 01:30 left');
    expect(role('resume').hidden).toBe(false);
    expect(role('resume').textContent).toBe(RESUME_LABEL);
    expect(role('pause').getAttribute('aria-label')).toContain('Paused · 01:30 left');
  });

  it('resumes from the row', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storeTimedPause(NOW + 90 * 1000);

    await start();
    press('resume');

    expect(messagesOfType('pause')).toEqual([{ type: 'pause', until: 0, session: false }]);

    await vi.waitFor(() => {
      expect(role('pause-label').textContent).toBe(PAUSE_ROW_LABEL);
    });
  });

  it('leaves the row alone once the pause it counted has ended', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storeTimedPause(NOW + 90 * 1000);

    await start();

    expect(role('pause-label').textContent).toBe('Paused · 01:30 left');

    press('resume');

    await vi.waitFor(() => {
      expect(role('pause-label').textContent).toBe(PAUSE_ROW_LABEL);
    });

    // The interval that counted the old pause must not write over the new row.
    await vi.advanceTimersByTimeAsync(3_000);

    expect(role('pause-label').textContent).toBe(PAUSE_ROW_LABEL);
  });

  it('keeps the pause out of the switch', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    storeTimedPause(NOW + 60 * 1000);

    await start();

    expect(role('state').textContent).toBe(POPUP_PAUSED);
    expect(switchElement().checked).toBe(true);
  });
});

describe('the switch of the list', () => {
  it('turns the list off from the header', async () => {
    storeSettings({ enabled: true, autoOpenBest: true, imagesEnabled: true });

    await start();

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

  it('shows off when the list is off', async () => {
    storeSettings({ enabled: false, autoOpenBest: false, imagesEnabled: true });

    await start();

    expect(role('state').textContent).toBe(POPUP_OFF);
    expect(role('state').dataset.state).toBe('off');
    expect(switchElement().checked).toBe(false);
  });

  it('shows on when the list is on', async () => {
    await start();

    expect(role('state').textContent).toBe(POPUP_ON);
    expect(role('state').dataset.state).toBe('on');
    expect(switchElement().checked).toBe(true);
  });
});

describe('the settings row', () => {
  it('opens the options page', async () => {
    await start();

    expect(role('settings-label').textContent).toBe(SETTINGS_LABEL);

    press('settings');

    expect(fake.calls.openedOptionsPage).toBe(1);
  });

  /**
   * An invalidated context throws from `openOptionsPage`, and a runtime that
   * answers later can reject. Neither reaches the reader as an unhandled
   * rejection.
   */
  it('holds a press that the runtime cannot answer', async () => {
    await start();

    const rejected = vi.fn((): Promise<void> => Promise.reject(new Error('invalidated')));
    const thrown = vi.fn((): Promise<void> => {
      throw new Error('no runtime');
    });

    fake.runtime.openOptionsPage = rejected;
    expect(() => press('settings')).not.toThrow();
    expect(rejected).toHaveBeenCalledTimes(1);

    fake.runtime.openOptionsPage = thrown;
    expect(() => press('settings')).not.toThrow();
    expect(thrown).toHaveBeenCalledTimes(1);
  });
});

describe('the popup footer', () => {
  it('links how it works and the privacy page', async () => {
    await start();

    const how = role('how-it-works');
    const privacy = role('privacy');

    expect(how.textContent).toBe(HOW_IT_WORKS_LABEL);
    expect(how.getAttribute('href')).toBe(`${API_BASE}/`);
    expect(privacy.textContent).toBe(PRIVACY_LABEL);
    expect(privacy.getAttribute('href')).toBe(`${API_BASE}/privacy`);

    for (const element of [how, privacy]) {
      expect(element.getAttribute('target')).toBe('_blank');
      expect(element.getAttribute('rel')).toBe('noreferrer noopener');
    }
  });
});

describe('the popup shell', () => {
  it('carries no allowance row and no list row', () => {
    for (const gone of ['tab-allowance', 'allowances', 'list']) {
      expect(document.querySelector(`[data-role="${gone}"]`)).toBeNull();
    }
  });

  it('carries one role for everything the script fills', () => {
    for (const name of [
      'site',
      'site-row',
      'site-text',
      'site-wall',
      'site-detail',
      'site-report',
      'site-alternatives',
      'pause',
      'pause-label',
      'resume',
      'durations',
      'settings',
    ]) {
      expect(role(name), name).not.toBeNull();
    }
  });
});
