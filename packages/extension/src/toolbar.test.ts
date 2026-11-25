import { afterEach, describe, expect, it } from 'vitest';

import {
  LISTED_BADGE,
  TOOLBAR_OFF_TITLE,
  TOOLBAR_PAUSED_TITLE,
  TOOLBAR_TITLE,
  listedTitle,
} from './copy';
import { STORAGE } from './constants';
import type { FakeChrome } from './testing/fake-chrome';
import { installFakeChrome, resetFakeChrome } from './testing/fake-chrome';
import { BADGE_COLOR, BADGE_TEXT_COLOR, refreshToolbar, toolbarView } from './toolbar';

const NOW = 1_700_000_000_000;
const CNET_URL = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';
const UNLISTED_URL = 'https://example.test/an-article';

afterEach(() => {
  resetFakeChrome();
});

describe('the toolbar view', () => {
  it('grays the mark while Detour is off', () => {
    const view = toolbarView({ enabled: false, paused: false, site: null });

    expect(view.icons[16]).toBe('icon-off-16.png');
    expect(view.icons[128]).toBe('icon-off-128.png');
    expect(view.badge).toBe('');
    expect(view.title).toBe(TOOLBAR_OFF_TITLE);
  });

  it('grays the mark while Detour is paused', () => {
    const view = toolbarView({ enabled: true, paused: true, site: null });

    expect(view.icons[16]).toBe('icon-off-16.png');
    expect(view.title).toBe(TOOLBAR_PAUSED_TITLE);
  });

  it('marks a listed site with an exclamation mark', () => {
    const view = toolbarView({
      enabled: true,
      paused: false,
      site: { domain: 'cnet.com' },
    });

    expect(view.icons[16]).toBe('icon-16.png');
    expect(view.badge).toBe(LISTED_BADGE);
    expect(view.badge).toBe('!');
    expect(view.title).toBe(listedTitle('cnet.com'));
    expect(view.title).toBe('Detour — cnet.com is on the list');
  });

  it('leaves a site that the list does not carry without a badge', () => {
    const view = toolbarView({ enabled: true, paused: false, site: null });

    expect(view.icons[16]).toBe('icon-16.png');
    expect(view.badge).toBe('');
    expect(view.title).toBe(TOOLBAR_TITLE);
  });

  it('drops the badge of a listed site while Detour is off', () => {
    const view = toolbarView({
      enabled: false,
      paused: false,
      site: { domain: 'cnet.com' },
    });

    expect(view.badge).toBe('');
    expect(view.title).toBe(TOOLBAR_OFF_TITLE);
  });
});

async function painted(fake: FakeChrome): Promise<void> {
  await refreshToolbar(() => NOW);

  expect(fake.calls.icons).toHaveLength(1);
  expect(fake.calls.badges).toHaveLength(1);
  expect(fake.calls.badgeColors).toEqual([BADGE_COLOR]);
  expect(fake.calls.badgeTextColors).toEqual([BADGE_TEXT_COLOR]);
  expect(fake.calls.titles).toHaveLength(1);
}

describe('the toolbar refresh', () => {
  it('badges the page in front of the reader when the list carries it', async () => {
    const fake = installFakeChrome();

    fake.activeTabUrl = CNET_URL;

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-16.png');
    expect(fake.calls.badges[0]).toBe(LISTED_BADGE);
    expect(fake.calls.titles[0]).toBe(listedTitle('cnet.com'));
  });

  it('leaves the mark plain on a page that the list does not carry', async () => {
    const fake = installFakeChrome();

    fake.activeTabUrl = UNLISTED_URL;

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-16.png');
    expect(fake.calls.badges[0]).toBe('');
    expect(fake.calls.titles[0]).toBe(TOOLBAR_TITLE);
  });

  it('grays the mark and clears the badge while Detour is off', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.settings] = { enabled: false };

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-off-16.png');
    expect(fake.calls.badges[0]).toBe('');
    expect(fake.calls.titles[0]).toBe(TOOLBAR_OFF_TITLE);
  });

  it('names the pause while Detour is paused', async () => {
    const fake = installFakeChrome();

    fake.storage.local.values[STORAGE.pauseUntil] = NOW + 60_000;

    await painted(fake);

    expect(fake.calls.icons[0]?.[16]).toBe('icon-off-16.png');
    expect(fake.calls.titles[0]).toBe(TOOLBAR_PAUSED_TITLE);
  });

  it('names no site on a page without an address', async () => {
    const fake = installFakeChrome();

    fake.activeTabUrl = 'chrome://newtab/';

    await painted(fake);

    expect(fake.calls.badges[0]).toBe('');
    expect(fake.calls.titles[0]).toBe(TOOLBAR_TITLE);
  });

  it('leaves the last view in place when the tab query fails', async () => {
    const fake = installFakeChrome();

    fake.tabs.query = async (): Promise<Array<{ id: number; url: string }>> => {
      throw new Error('the window closed');
    };

    await expect(refreshToolbar(() => NOW)).resolves.toBeUndefined();
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

    const older = refreshToolbar(() => NOW);

    fake.activeTabUrl = UNLISTED_URL;

    await refreshToolbar(() => NOW);
    release();
    await older;

    expect(fake.calls.badges.at(-1)).toBe('');
    expect(fake.calls.titles.at(-1)).toBe(TOOLBAR_TITLE);
  });
});
