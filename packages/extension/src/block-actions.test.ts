// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AllowanceEntry } from './allowances';
import type { ActionsView } from './block-actions';
import { renderActions } from './block-actions';
import { REPORT_ISSUE_URL, STORAGE } from './constants';
import { ACTION_ERROR, REPORT_LABEL, SCOPE_LABEL, SCOPE_MENU_LABEL, openAnywayLabel } from './copy';
import { reportUrl } from './report';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import { mountShell, readShell, role } from './testing/shell';

const URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';
const LIST_VERSION = 4;
const EXTENSION_VERSION = '0.1.0';

let fake: FakeChrome;
let navigated: string[];

function view(overrides: Partial<ActionsView> = {}): ActionsView {
  return {
    original: URL,
    siteName: 'Forbes',
    host: 'forbes.com',
    listed: true,
    listVersion: LIST_VERSION,
    navigate: (url: string): void => {
      navigated.push(url);
    },
    ...overrides,
  };
}

function press(name: string): void {
  role(name).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function escapeOn(element: HTMLElement): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function allowMessages(): unknown[] {
  return fake.calls.messages.filter((message) => (message as { type?: string }).type === 'allow');
}

function tabEntry(): AllowanceEntry {
  return { host: 'forbes.com', tabId: fake.currentTabId, addedAt: 1 };
}

/**
 * The service worker of a cold start: it writes the tab allowance first and
 * answers the message only after the given delay.
 */
function allowAfter(delay: number): void {
  fake.respond(
    'allow',
    () =>
      new Promise((resolve) => {
        setTimeout(() => {
          fake.storage.session.values[STORAGE.allowTabs] = [tabEntry()];
          resolve({
            ok: true,
            allowances: { allowAlways: [], allowSession: [], allowTabs: [tabEntry()] },
          });
        }, delay);
      }),
  );
}

beforeEach(() => {
  fake = installFakeChrome();
  fake.respond('allow', () => ({
    ok: true,
    allowances: { allowAlways: [], allowSession: [], allowTabs: [] },
  }));
  navigated = [];
  mountShell(readShell('block.html'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetFakeChrome();
});

describe('the allowance menu', () => {
  it('offers the three scopes in the menu', () => {
    renderActions(view());

    expect(role('scope-tab').textContent).toBe(SCOPE_LABEL.tab);
    expect(role('scope-session').textContent).toBe(SCOPE_LABEL.session);
    expect(role('scope-always').textContent).toBe(SCOPE_LABEL.always);
  });

  it('keeps the menu closed until the caret is pressed', () => {
    const caret = role('open-menu');
    const menu = role('scope-menu');

    renderActions(view());

    expect(caret.textContent).toBe('⌄');
    expect(caret.getAttribute('aria-label')).toBe(SCOPE_MENU_LABEL);
    expect(caret.getAttribute('aria-haspopup')).toBe('menu');
    expect(caret.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);

    press('open-menu');

    expect(menu.hidden).toBe(false);
    expect(caret.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes the menu on escape from the caret', () => {
    const caret = role('open-menu');

    renderActions(view());
    caret.focus();
    press('open-menu');

    escapeOn(caret);

    expect(role('scope-menu').hidden).toBe(true);
    expect(caret.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(caret);
  });

  it('closes the menu on escape from inside it', () => {
    const caret = role('open-menu');
    const session = role('scope-session');

    renderActions(view());
    press('open-menu');
    session.focus();

    escapeOn(session);

    expect(role('scope-menu').hidden).toBe(true);
    expect(caret.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(caret);
  });

  it('closes the menu on a second caret press', () => {
    renderActions(view());

    press('open-menu');
    press('open-menu');

    expect(role('scope-menu').hidden).toBe(true);
    expect(role('open-menu').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the open action', () => {
  it('opens the site in this tab by default', async () => {
    renderActions(view());

    expect(role('open-site').textContent).toBe(openAnywayLabel('Forbes'));

    press('open-site');

    await vi.waitFor(() => {
      expect(navigated).toEqual([URL]);
    });

    expect(allowMessages()).toEqual([{ type: 'allow', scope: 'tab', url: URL }]);
  });

  it('opens the site on this site until a restart', async () => {
    renderActions(view());
    press('open-menu');
    press('scope-session');

    await vi.waitFor(() => {
      expect(navigated).toEqual([URL]);
    });

    expect(allowMessages()).toEqual([{ type: 'allow', scope: 'session', url: URL }]);
  });

  it('opens the site on this site always', async () => {
    renderActions(view());
    press('open-menu');
    press('scope-always');

    await vi.waitFor(() => {
      expect(navigated).toEqual([URL]);
    });

    expect(allowMessages()).toEqual([{ type: 'allow', scope: 'always', url: URL }]);
  });

  it('stores the allowance before it opens the site while the worker starts cold', async () => {
    vi.useFakeTimers();

    allowAfter(1200);

    const storedAtNavigate: unknown[] = [];

    renderActions(
      view({
        navigate: (url: string): void => {
          storedAtNavigate.push(fake.storage.session.values[STORAGE.allowTabs]);
          navigated.push(url);
        },
      }),
    );
    press('open-site');

    await vi.advanceTimersByTimeAsync(1100);
    expect(navigated).toEqual([]);

    await vi.advanceTimersByTimeAsync(200);
    expect(navigated).toEqual([URL]);
    expect(storedAtNavigate).toEqual([[tabEntry()]]);
  });

  it('keeps the page when the worker starts too late', async () => {
    vi.useFakeTimers();

    allowAfter(1600);

    renderActions(view());
    press('open-site');

    await vi.advanceTimersByTimeAsync(1500);

    expect(role('action-error').hidden).toBe(false);
    expect(role('action-error').textContent).toBe(ACTION_ERROR);

    await vi.advanceTimersByTimeAsync(100);

    expect(navigated).toEqual([]);
  });

  it('shows an action error and does not navigate when the allowance fails', async () => {
    fake.respond('allow', () => ({ ok: false, error: 'bad_message' }));

    renderActions(view());
    press('open-site');

    await vi.waitFor(() => {
      expect(role('action-error').hidden).toBe(false);
    });

    expect(role('action-error').textContent).toBe(ACTION_ERROR);
    expect(navigated).toEqual([]);
    expect(allowMessages()).toHaveLength(1);
  });

  it('keeps the actions out for a value that is not a web url', () => {
    renderActions(view({ original: 'javascript:alert(1)', siteName: null, host: null }));

    expect(role('actions').hidden).toBe(true);
    expect(role('scope-menu').hidden).toBe(true);
  });

  it('keeps the row for a web url that the list does not carry', () => {
    renderActions(view({ siteName: null, host: null }));

    expect(role('actions').hidden).toBe(false);
    expect(role('open-menu').getAttribute('aria-haspopup')).toBe('menu');
  });

  it('shows an action error and does not navigate when the allowance never answers', async () => {
    vi.useFakeTimers();
    fake.respond('allow', () => new Promise(() => {}));

    renderActions(view());
    press('open-site');

    await vi.advanceTimersByTimeAsync(5000);

    expect(role('action-error').hidden).toBe(false);
    expect(role('action-error').textContent).toBe(ACTION_ERROR);
    expect(navigated).toEqual([]);
    expect(allowMessages()).toHaveLength(1);
  });

  it('opens a url the list does not carry without asking for an allowance', async () => {
    renderActions(view({ siteName: null, host: null, listed: false }));
    press('open-site');

    await vi.waitFor(() => {
      expect(navigated).toEqual([URL]);
    });

    expect(allowMessages()).toHaveLength(0);
  });

  it('renders without a runtime and hides the report link', () => {
    resetFakeChrome();

    expect(() => renderActions(view())).not.toThrow();
    expect(role('actions').hidden).toBe(false);
    expect(role('open-site').textContent).toBe(openAnywayLabel('Forbes'));
    expect(role('report').hidden).toBe(true);
  });

  it('keeps the row when the manifest read fails', () => {
    vi.spyOn(fake.runtime, 'getManifest').mockImplementation(() => {
      throw new Error('the extension context was invalidated');
    });

    expect(() => renderActions(view())).not.toThrow();
    expect(role('actions').hidden).toBe(false);
    expect(role('open-site').textContent).toBe(openAnywayLabel('Forbes'));
    expect(role('report').hidden).toBe(true);
  });
});

describe('a second render', () => {
  it('keeps one handler after a second render', async () => {
    renderActions(view());
    renderActions(view());

    press('open-site');

    await vi.waitFor(() => {
      expect(navigated).toEqual([URL]);
    });

    expect(allowMessages()).toHaveLength(1);
  });

  it('clears the handlers of a row it hides', () => {
    renderActions(view());
    renderActions(view({ original: 'javascript:alert(1)', siteName: null, host: null }));

    expect(role('open-site').onclick).toBeNull();
    expect(role('scope-tab').onclick).toBeNull();
    expect(role('scope-session').onclick).toBeNull();
    expect(role('scope-always').onclick).toBeNull();
  });
});

describe('the report link', () => {
  it('builds it from the url, the list version, and the extension version', () => {
    renderActions(view());

    const link = role('report');
    const href = link.getAttribute('href');

    expect(href).toBe(
      reportUrl({
        url: URL,
        listVersion: LIST_VERSION,
        extensionVersion: EXTENSION_VERSION,
      }),
    );
    expect(href?.startsWith(REPORT_ISSUE_URL)).toBe(true);
    expect(link.textContent).toBe(REPORT_LABEL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer noopener');
    expect(link.hidden).toBe(false);
  });
});
