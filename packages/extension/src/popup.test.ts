// @vitest-environment happy-dom
import type { Wall } from '@detour/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, PRIVACY_URL, SITE_URL } from './constants';
import {
  ALTERNATIVES_FAILED,
  ALTERNATIVES_HEADING,
  ALTERNATIVES_LOADING,
  ALTERNATIVES_NONE,
  ENABLED_SWITCH_LABEL,
  FALLBACK_HEADING,
  HOW_IT_WORKS_LABEL,
  POPUP_OFF,
  POPUP_ON,
  NO_SITE_NOTICE,
  POPUP_UNAVAILABLE,
  PRIVACY_LABEL,
  RETRY_LABEL,
  SEARCH_CARD_POPUP_DETAIL,
  SEARCH_ENGINE_NAMES,
  SETTINGS_LABEL,
  SITE_NOT_LISTED,
  SITE_REPORT_HINT,
  THEME_SWITCH_DARK,
  headline,
} from './copy';
import type { Send } from './popup-data';
import { startPopup } from './popup';
import type { PopupSite, PopupState, RouteView } from './state-view';
import type { Settings } from './storage';
import { defaultWalls } from './walls';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import { mountShell, readShell, role } from './testing/shell';

const SHELL = readShell('popup.html');

const LISTED_URL = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';
const UNLISTED_URL = 'https://example.com/a-story';
const LIST_ID = 'a'.repeat(64);

const WALL: Wall = { category: 'paywall', type: 'soft' };

const SITE: PopupSite = {
  domain: 'cnet.com',
  name: 'CNET',
  walls: [WALL],
  note: 'A paywall covers the article after the first read.',
  tabId: 11,
  url: LISTED_URL,
};

const REPORT = { url: LISTED_URL, listId: LIST_ID };

const ROUTES: RouteView[] = [
  {
    title: 'The best AI image generators, compared',
    description: 'We tested every tool that asks for your money.',
    domain: 'arstechnica.com',
    url: 'https://arstechnica.com/gadgets/ai-image-tools-compared/',
    favicon: null,
    walls: 'none',
    match: null,
  },
  {
    title: 'AI image tools, ranked',
    description: 'A second look at the same tools.',
    domain: 'theverge.com',
    url: 'https://www.theverge.com/ai-image-tools-ranked/',
    favicon: null,
    walls: 'listed',
    match: null,
  },
];

const SETTINGS: Settings = { ...DEFAULT_SETTINGS, theme: 'light', walls: defaultWalls() };

let fake: FakeChrome;
let sent: unknown[];
let closed: number;

function stateOf(overrides: Partial<PopupState['view']> = {}): PopupState {
  return {
    settings: SETTINGS,
    view: {
      kind: 'results',
      site: SITE,
      routes: ROUTES,
      searchCard: true,
      query: 'AI image tools',
      report: REPORT,
      ...overrides,
    } as PopupState['view'],
  };
}

/** One worker: a state for the popup, and an ok for everything else. */
function answering(state: PopupState | null, delay = 0): Send {
  return async (message: unknown): Promise<unknown> => {
    sent.push(message);

    if ((message as { type?: string }).type === 'popupState') {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return state === null ? { ok: false, error: 'bad_message' } : { ok: true, state };
    }

    return { ok: true };
  };
}

function start(send: Send): Promise<void> {
  return startPopup({
    send,
    close: () => {
      closed += 1;
    },
    openOptions: () => {
      opened += 1;
    },
  });
}

let opened = 0;

function press(name: string): void {
  role(name).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pressKey(key: string): void {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

function rows(): HTMLLIElement[] {
  return [...role('list').querySelectorAll<HTMLLIElement>('li')];
}

function keyCaps(): string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[data-role="result-key"], [data-role="search-key"], [data-role="report-key"]',
    ),
  ]
    .map((cap) => cap.textContent ?? '')
    .filter((cap) => cap !== '');
}

function switchElement(): HTMLInputElement {
  const element = role('enabled');

  if (!(element instanceof HTMLInputElement)) {
    throw new Error('the shell has no switch');
  }

  return element;
}

function flip(checked: boolean): void {
  const element = switchElement();

  element.checked = checked;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  fake = installFakeChrome();
  sent = [];
  opened = 0;
  closed = 0;
  mountShell(SHELL);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetFakeChrome();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeChoice;
});

describe('the popup shell', () => {
  it('carries the parts that the renderer fills', () => {
    const shell = new DOMParser().parseFromString(SHELL.replace(/<link[^>]*>/g, ''), 'text/html');
    const roles = [
      'header',
      'mark',
      'wordmark',
      'state',
      'enabled',
      'source',
      'source-tile',
      'source-domain',
      'source-description',
      'walls',
      'walls-detail',
      'site-report',
      'report-title',
      'report-key',
      'status',
      'list-head',
      'alternatives-heading',
      'count',
      'list',
      'search',
      'fallback',
      'engines',
      'retry-row',
      'retry',
      'how-it-works',
      'privacy',
      'theme',
      'settings',
    ];

    for (const name of roles) {
      expect(shell.querySelector(`[data-role="${name}"]`), name).not.toBeNull();
    }
  });

  it('paints the waiting line before the answer', async () => {
    const running = start(answering(stateOf(), 20));

    expect(role('status').textContent).toBe(ALTERNATIVES_LOADING);
    expect(role('status').hidden).toBe(false);

    await running;

    expect(role('status').hidden).toBe(true);
  });

  it('keeps the switch out of the frame until the settings arrive', async () => {
    // The real search takes seconds, so a switch painted before it would say
    // that Detour is off while the answer is still coming.
    const running = start(answering(stateOf(), 50));

    expect(switchElement().hidden).toBe(true);
    expect(role('state').hidden).toBe(true);
    expect(role('state').textContent).toBe('');
    expect(role('theme').hidden).toBe(true);

    // The links and the gear need nothing from the worker.
    expect(role('how-it-works').textContent).toBe(HOW_IT_WORKS_LABEL);
    expect(role('privacy').textContent).toBe(PRIVACY_LABEL);

    await running;

    expect(switchElement().hidden).toBe(false);
    expect(role('state').hidden).toBe(false);
    expect(role('state').textContent).toBe(POPUP_ON);
    expect(role('theme').hidden).toBe(false);
  });

  it('reports a state it could not read', async () => {
    await start(answering(null));

    expect(role('status').textContent).toBe(POPUP_UNAVAILABLE);
    expect(role('status').hidden).toBe(false);
    expect(switchElement().hidden).toBe(true);
    expect(role('state').hidden).toBe(true);
  });

  it('reads no storage and no tab', async () => {
    const storageRead = vi.spyOn(fake.storage.local, 'get');
    const sessionRead = vi.spyOn(fake.storage.session, 'get');

    await start(answering(stateOf()));

    expect(storageRead).not.toHaveBeenCalled();
    expect(sessionRead).not.toHaveBeenCalled();
  });
});

describe('the popup state word', () => {
  it('reads On with the switch on', async () => {
    await start(answering(stateOf()));

    expect(role('state').textContent).toBe(POPUP_ON);
    expect(role('state').dataset.state).toBe('on');
    expect(switchElement().checked).toBe(true);
    expect(switchElement().getAttribute('aria-label')).toBe(ENABLED_SWITCH_LABEL);
  });

  it('reads Off, keeps the card, and offers no search', async () => {
    await start(
      answering({
        settings: { ...SETTINGS, enabled: false },
        view: { kind: 'off', site: SITE },
      }),
    );

    expect(role('state').textContent).toBe(POPUP_OFF);
    expect(switchElement().checked).toBe(false);
    expect(role('source').hidden).toBe(false);
    expect(role('source-description').textContent).toBe(headline('CNET', 1));
    expect(role('search').hidden).toBe(true);
    expect(role('list').children).toHaveLength(0);
  });

  it('says why a page without a site has nothing', async () => {
    await start(answering({ settings: SETTINGS, view: { kind: 'no-site' } }));

    expect(role('source').hidden).toBe(true);
    expect(role('list').children).toHaveLength(0);
    expect(role('search').hidden).toBe(true);
    expect(role('status').textContent).toBe(NO_SITE_NOTICE);
    expect(role('status').hidden).toBe(false);
  });
});

describe('the unlisted popup', () => {
  function unlisted(): PopupState {
    return {
      settings: SETTINGS,
      view: {
        kind: 'unlisted',
        domain: 'example.com',
        query: 'a story',
        report: { url: UNLISTED_URL, listId: LIST_ID },
      },
    };
  }

  it('names the site and says that the list does not carry it', async () => {
    await start(answering(unlisted()));

    expect(role('source-domain').textContent).toBe('example.com');
    expect(role('source-description').textContent).toBe(SITE_NOT_LISTED);
    expect(role('walls-row').hidden).toBe(true);
  });

  it('offers the report as a row with its digit', async () => {
    await start(answering(unlisted()));

    const report = role('site-report');

    expect(report.hidden).toBe(false);
    expect(role('report-title').textContent).toBe(SITE_REPORT_HINT);
    expect(role('report-key').textContent).toBe('1');
    expect(report.getAttribute('href')).toContain(LIST_ID);
    expect(report.getAttribute('href')).toContain(encodeURIComponent(UNLISTED_URL));
  });

  it('closes the search card with the second digit and opens the engines', async () => {
    await start(answering(unlisted()));

    expect(role('search').hidden).toBe(false);
    expect(role('search-title').textContent).toBe(FALLBACK_HEADING);
    expect(role('search-detail').textContent).toBe(SEARCH_CARD_POPUP_DETAIL);
    expect(role('search-key').textContent).toBe('2');

    press('search');

    expect(role('search').hidden).toBe(true);
    expect(role('fallback').hidden).toBe(false);
    expect(role('engines').querySelectorAll('a')).toHaveLength(4);
    expect(role('engines').textContent).toContain(SEARCH_ENGINE_NAMES.duckduckgo);
  });
});

describe('the routes', () => {
  it('renders one row per route, with the search card last', async () => {
    await start(answering(stateOf()));

    expect(rows()).toHaveLength(2);
    expect(role('alternatives-heading').textContent).toBe(ALTERNATIVES_HEADING);
    expect(role('count').textContent).toBe('3');
    expect(keyCaps()).toEqual(['1', '2', '3']);
    expect(role('search').hidden).toBe(false);
    expect(role('status').hidden).toBe(true);
  });

  it('claims no walls only for the route the list clears', async () => {
    await start(answering(stateOf()));

    const badges = role('list').querySelectorAll('[data-role="result-walls"]');

    expect(badges).toHaveLength(1);
    expect(rows()[0]?.textContent).toContain('No walls');
    expect(rows()[1]?.textContent).not.toContain('No walls');
  });

  it('opens a route through the worker and closes the popup', async () => {
    await start(answering(stateOf()));

    rows()[0]
      ?.querySelector('a')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(sent).toContainEqual({ type: 'openRoute', url: ROUTES[0]?.url });
    await vi.waitFor(() => {
      expect(closed).toBe(1);
    });
  });

  it('opens the engines from the search card', async () => {
    await start(answering(stateOf()));

    press('search');

    expect(role('fallback').hidden).toBe(false);
    expect(role('search').hidden).toBe(true);
    expect(role('engines').querySelectorAll('a')).toHaveLength(4);
  });

  it('shows the walls of the site with their detail', async () => {
    await start(answering(stateOf()));

    const chip = role('walls').querySelector<HTMLButtonElement>('button[data-role="wall"]');

    expect(chip).not.toBeNull();
    chip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(role('walls-detail').hidden).toBe(false);
    expect(role('walls-detail').textContent).toContain('Paywall');
  });
});

describe('the answers without routes', () => {
  it('renders the empty state with the engines and the retry', async () => {
    await start(
      answering(stateOf({ kind: 'empty', query: 'AI image tools' } as Partial<PopupState['view']>)),
    );

    expect(role('status').textContent).toBe(ALTERNATIVES_NONE);
    expect(role('status').hidden).toBe(false);
    expect(role('fallback').hidden).toBe(false);
    expect(role('retry').textContent).toBe('Try the search again');
    expect(rows()).toHaveLength(0);
  });

  it('renders the failed state and asks again on a retry', async () => {
    await start(
      answering(stateOf({ kind: 'error', query: 'AI image tools' } as Partial<PopupState['view']>)),
    );

    expect(role('status').textContent).toBe(ALTERNATIVES_FAILED);
    expect(role('retry').textContent).toBe(RETRY_LABEL);

    press('retry');

    await vi.waitFor(() => {
      expect(
        sent.filter((message) => (message as { type?: string }).type === 'popupState'),
      ).toHaveLength(2);
    });
  });
});

describe('the controls', () => {
  it('sends the settings on a switch press and asks for the state again', async () => {
    await start(answering(stateOf()));

    flip(false);

    await vi.waitFor(() => {
      expect(sent).toContainEqual({
        type: 'setSettings',
        settings: { ...SETTINGS, enabled: false },
      });
      expect(
        sent.filter((message) => (message as { type?: string }).type === 'popupState'),
      ).toHaveLength(2);
    });
  });

  it('opens the options page from the gear', async () => {
    await start(answering(stateOf()));

    press('settings');

    expect(opened).toBe(1);
    expect(role('settings').getAttribute('aria-label')).toBe(SETTINGS_LABEL);
  });

  it('links the footer to the site and the policy', async () => {
    await start(answering(stateOf()));

    expect(role('how-it-works').textContent).toBe(HOW_IT_WORKS_LABEL);
    expect(role('how-it-works').getAttribute('href')).toBe(SITE_URL);
    expect(role('privacy').textContent).toBe(PRIVACY_LABEL);
    expect(role('privacy').getAttribute('href')).toBe(PRIVACY_URL);
  });

  it('moves the theme and stores the choice', async () => {
    await start(answering(stateOf()));

    expect(role('theme').getAttribute('aria-label')).toBe(THEME_SWITCH_DARK);

    press('theme');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(fake.calls.messages).toContainEqual({
      type: 'setSettings',
      settings: { ...SETTINGS, theme: 'dark' },
    });
  });
});

/** The unlisted page, whose two rows answer the first two digits. */
function unlistedState(): PopupState {
  return {
    settings: SETTINGS,
    view: {
      kind: 'unlisted',
      domain: 'example.com',
      query: 'a story',
      report: { url: UNLISTED_URL, listId: LIST_ID },
    },
  };
}

describe('the keyboard', () => {
  it('opens the row of the digit it presses', async () => {
    await start(answering(stateOf()));

    pressKey('2');

    expect(sent).toContainEqual({ type: 'openRoute', url: ROUTES[1]?.url });
  });

  it('walks the rows with the arrows and opens the selection with Enter', async () => {
    await start(answering(stateOf()));

    pressKey('ArrowDown');
    pressKey('ArrowDown');

    expect(rows()[1]?.querySelector('a')?.dataset.selected).toBe('true');

    pressKey('Enter');

    expect(sent).toContainEqual({ type: 'openRoute', url: ROUTES[1]?.url });
  });

  it('gives the first digit to the report row and the second to the search', async () => {
    await start(answering(unlistedState()));

    pressKey('1');

    // The report is a link that opens its own tab, so it opens no engines here.
    expect(role('fallback').hidden).toBe(true);

    pressKey('2');

    expect(role('fallback').hidden).toBe(false);
  });

  it('keeps the Enter of a focused link to the link', async () => {
    await start(answering(stateOf()));

    const link = rows()[1]?.querySelector('a');

    link?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // The browser presses the link itself, so the popup adds no second press.
    expect(sent).not.toContainEqual({ type: 'openRoute', url: ROUTES[1]?.url });
  });
});
