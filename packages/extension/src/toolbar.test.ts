import type { ListedSite } from '@detour/shared';
import { sha256Hex } from '@detour/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { TOOLBAR_OFF_TITLE, TOOLBAR_TITLE, loadTitle, stopTitle } from './copy';
import { STORAGE } from './constants';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import type { ToolbarFacts } from './toolbar';
import { refreshToolbar, toolbarView } from './toolbar';
import { defaultWalls } from './walls';

const CNET_URL = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';
const UNLISTED_URL = 'https://example.test/an-article';
const BLOCK_URL = `chrome-extension://jcncblagncbpbamfnekhdkomffdpehpk/block.html?u=${encodeURIComponent(CNET_URL)}&theme=light`;

/** The fields of the CNET entry of the bundled list, which has one soft wall. */
const CNET: Pick<ListedSite, 'domain' | 'walls'> = {
  domain: 'cnet.com',
  walls: [{ category: 'adblock', type: 'soft' }],
};

const NO_WALLS: ToolbarFacts['walls'] = { hard: [], soft: [], metered: [] };

function facts(overrides: Partial<ToolbarFacts> = {}): ToolbarFacts {
  return {
    enabled: true,
    listEnabled: true,
    walls: defaultWalls(),
    site: CNET,
    allowed: false,
    ...overrides,
  };
}

afterEach(() => {
  resetFakeChrome();
});

describe('the toolbar view', () => {
  it('grays the mark while Detour is off', () => {
    const view = toolbarView(facts({ enabled: false }));

    expect(view.icons[16]).toBe('icon-off-16.png');
    expect(view.icons[128]).toBe('icon-off-128.png');
    expect(view.title).toBe(TOOLBAR_OFF_TITLE);
  });

  it('shows the coloured route on a page that Detour will stop', () => {
    const view = toolbarView(facts());

    expect(view.icons[16]).toBe('icon-16.png');
    expect(view.icons[128]).toBe('icon-128.png');
    expect(view.title).toBe(stopTitle('cnet.com'));
    expect(view.title).toBe('Detour will stop this page on cnet.com');
  });

  it('shows the faint route on a page that the list does not carry', () => {
    const view = toolbarView(facts({ site: null }));

    expect(view.icons[16]).toBe('icon-plain-16.png');
    expect(view.icons[128]).toBe('icon-plain-128.png');
    expect(view.title).toBe(TOOLBAR_TITLE);
  });

  it('shows the faint route when no chosen wall stops the page', () => {
    const view = toolbarView(facts({ walls: NO_WALLS }));

    expect(view.icons[16]).toBe('icon-plain-16.png');
    expect(view.title).toBe(loadTitle('cnet.com'));
    expect(view.title).toBe('Detour will not stop this page on cnet.com');
  });

  it('shows the faint route when an allowance covers the site', () => {
    const view = toolbarView(facts({ allowed: true }));

    expect(view.icons[16]).toBe('icon-plain-16.png');
    expect(view.title).toBe(loadTitle('cnet.com'));
  });

  it('shows the faint route while the list is disabled', () => {
    const view = toolbarView(facts({ listEnabled: false }));

    expect(view.icons[16]).toBe('icon-plain-16.png');
    expect(view.title).toBe(loadTitle('cnet.com'));
  });

  it('drops the colour of a listed site while Detour is off', () => {
    const view = toolbarView(facts({ enabled: false, site: CNET }));

    expect(view.icons[16]).toBe('icon-off-16.png');
    expect(view.title).toBe(TOOLBAR_OFF_TITLE);
  });
});

async function painted(fake: FakeChrome): Promise<void> {
  await refreshToolbar();

  expect(fake.calls.icons).toHaveLength(1);
  expect(fake.calls.badges).toEqual(['']);
  expect(fake.calls.badgeColors).toEqual([]);
  expect(fake.calls.badgeTextColors).toEqual([]);
  expect(fake.calls.titles).toHaveLength(1);
}

describe('the toolbar refresh', () => {
  it('shows the coloured route on the page that Detour will stop', async () => {
    const fake = installFakeChrome();

    fake.activeTabUrl = CNET_URL;

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-16.png');
    expect(fake.calls.titles[0]).toBe(stopTitle('cnet.com'));
  });

  it('shows the faint route on a page that the list does not carry', async () => {
    const fake = installFakeChrome();

    fake.activeTabUrl = UNLISTED_URL;

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-plain-16.png');
    expect(fake.calls.titles[0]).toBe(TOOLBAR_TITLE);
  });

  it('shows the faint route on a listed site that the reader allowed', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.allowAlways] = [{ host: 'cnet.com', addedAt: 1 }];

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-plain-16.png');
    expect(fake.calls.titles[0]).toBe(loadTitle('cnet.com'));
  });

  it('shows the faint route on a tab that holds an allowance', async () => {
    const fake = installFakeChrome();

    fake.storage.session.values[STORAGE.allowTabs] = [
      { host: 'cnet.com', tabId: fake.currentTabId, addedAt: 1 },
    ];

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-plain-16.png');
    expect(fake.calls.titles[0]).toBe(loadTitle('cnet.com'));
  });

  it('shows the faint route when no chosen wall stops the page', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.settings] = { walls: NO_WALLS };

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-plain-16.png');
    expect(fake.calls.titles[0]).toBe(loadTitle('cnet.com'));
  });

  it('answers for the article of a block page while the tab holds its record', async () => {
    const fake = installFakeChrome();

    fake.activeTabUrl = BLOCK_URL;
    fake.storage.session.values[`${STORAGE.capability}${fake.currentTabId}`] =
      await sha256Hex(CNET_URL);

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-16.png');
    expect(fake.calls.titles[0]).toBe(stopTitle('cnet.com'));
  });

  it('keeps the mark plain on a block page without a record', async () => {
    const fake = installFakeChrome();

    fake.activeTabUrl = BLOCK_URL;

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-plain-16.png');
    expect(fake.calls.titles[0]).toBe(TOOLBAR_TITLE);
  });

  it('grays the mark and clears the badge while Detour is off', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.settings] = { enabled: false };

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-off-16.png');
    expect(fake.calls.titles[0]).toBe(TOOLBAR_OFF_TITLE);
  });

  it('names no site on a page without an address', async () => {
    const fake = installFakeChrome();

    fake.activeTabUrl = 'chrome://newtab/';

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-plain-16.png');
    expect(fake.calls.titles[0]).toBe(TOOLBAR_TITLE);
  });

  it('leaves the last view in place when the tab query fails', async () => {
    const fake = installFakeChrome();

    fake.tabs.query = async (): Promise<Array<{ id: number; url: string }>> => {
      throw new Error('the window closed');
    };

    await expect(refreshToolbar()).resolves.toBeUndefined();
    expect(fake.calls.icons).toEqual([]);
    expect(fake.calls.badges).toEqual([]);
  });

  it('keeps the newest view when two refreshes race', async () => {
    const fake = installFakeChrome();
    let release = (): void => {};
    const gate = new Promise<void>((done) => {
      release = done;
    });
    let first = true;

    // The older call keeps the address it asked about and finishes last.
    fake.tabs.query = async (): Promise<Array<{ id: number; url: string }>> => {
      const url = fake.activeTabUrl;

      if (first) {
        first = false;
        await gate;
      }

      return [{ id: fake.currentTabId, url }];
    };

    const older = refreshToolbar();

    fake.activeTabUrl = UNLISTED_URL;

    await refreshToolbar();
    release();
    await older;

    expect(fake.calls.badges.at(-1)).toBe('');
    expect(fake.calls.titles.at(-1)).toBe(TOOLBAR_TITLE);
  });
});
