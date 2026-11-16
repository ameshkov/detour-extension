import { describe, expect, it } from 'vitest';

import {
  ENABLED_SWITCH_LABEL,
  KEEP_WAITING_LABEL,
  LIST_LABEL,
  PAUSE_BUTTON_LABEL,
  POPUP_OFF,
  POPUP_ON,
  POPUP_PAUSED,
  REPORT_ISSUE_TITLE,
  RESUME_LABEL,
  SCOPE_DETAIL,
  SCOPE_LABEL,
  SEARCH_ENGINE_NAMES,
  SLOW_NOTE,
  STAY_LABEL,
  allowanceCount,
  countdownText,
  listDetail,
  openAnywayLabel,
  openInsteadLabel,
  removeAllowanceLabel,
  reportIssueBody,
  resultsCount,
  tabAllowanceLabel,
} from './copy';

const FORBES_URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';

describe('the copy', () => {
  it('counts the publishers of one alternative', () => {
    expect(resultsCount(1)).toBe('1 publisher without a wall');
  });

  it('counts the publishers of a list', () => {
    expect(resultsCount(5)).toBe('5 publishers without a wall');
  });

  it('names the site in the open actions', () => {
    expect(openAnywayLabel('Forbes')).toBe('Open Forbes anyway');
    expect(openInsteadLabel('Forbes')).toBe('Open Forbes instead');
  });

  it('writes the issue body from the url, both versions, and the labels', () => {
    const body = reportIssueBody({
      url: FORBES_URL,
      listVersion: 7,
      extensionVersion: '0.1.0',
    });

    expect(body).toBe(
      [
        `The page Detour stopped: ${FORBES_URL}`,
        'List version: 7',
        'Extension version: 0.1.0',
      ].join('\n'),
    );
    expect(reportIssueBody({ url: null, listVersion: 7, extensionVersion: '0.1.0' })).toBe(
      ['List version: 7', 'Extension version: 0.1.0'].join('\n'),
    );
  });

  it('names the host in the issue title', () => {
    expect(REPORT_ISSUE_TITLE('forbes.com')).toBe('Block page problem on forbes.com');
    expect(REPORT_ISSUE_TITLE(null)).toBe('Block page problem');
  });

  it('lists the version, the sites, and the date', () => {
    expect(listDetail({ version: 5, sites: 128, updated: '2026-11-12' })).toBe(
      'Version 5 · 128 sites · updated 2026-11-12',
    );
  });

  it('counts one site and many', () => {
    expect(allowanceCount(1)).toBe('1 site');
    expect(allowanceCount(2)).toBe('2 sites');
  });

  it('explains each scope in one sentence', () => {
    expect(SCOPE_DETAIL.tab).toBe(
      'This tab and the tabs it opens on this site, until you close it.',
    );
    expect(SCOPE_DETAIL.session).toBe('Until Chrome restarts.');
    expect(SCOPE_DETAIL.always).toBe('Always, until you remove it.');
    expect(SCOPE_DETAIL.tab).toContain('close');
    expect(SCOPE_DETAIL.tab).toContain('this site');
  });

  it("states the three scopes in the reader's words", () => {
    expect(SCOPE_LABEL.tab).toBe('This tab');
    expect(SCOPE_LABEL.session).toBe('This site until restart');
    expect(SCOPE_LABEL.always).toBe('This site always');
  });

  it('names the four engines', () => {
    expect(SEARCH_ENGINE_NAMES).toEqual({
      duckduckgo: 'DuckDuckGo',
      brave: 'Brave',
      google: 'Google',
      bing: 'Bing',
    });
  });

  it('names the site in the tab allowance', () => {
    expect(tabAllowanceLabel('cnet.com')).toBe('cnet.com is open in this tab');
  });

  it('names the site in the accessible name of a remove button', () => {
    expect(removeAllowanceLabel('forbes.com')).toBe('Remove the allowance for forbes.com');
    expect(removeAllowanceLabel('forbes.com')).not.toBe(removeAllowanceLabel('cnet.com'));
  });

  it('names the countdown line', () => {
    expect(countdownText('arstechnica.com')).toBe(
      'Opening arstechnica.com because it is the best match',
    );
    expect(STAY_LABEL).toBe('Stay here');
  });

  it('names the switch of the list', () => {
    expect(ENABLED_SWITCH_LABEL).toBe('Turn the list on or off');
  });

  it('names the note and its two controls', () => {
    expect(SLOW_NOTE).toBe('The search is still running.');
    expect(KEEP_WAITING_LABEL).toBe('Keep waiting');
    expect(openInsteadLabel('Forbes')).toBe('Open Forbes instead');
  });

  it('names the popup state, the allowance, and the list', () => {
    expect(POPUP_ON).toBe('On');
    expect(POPUP_OFF).toBe('Off');
    expect(POPUP_PAUSED).toBe('Paused');
    expect(tabAllowanceLabel('cnet.com')).toBe('cnet.com is open in this tab');
    expect(PAUSE_BUTTON_LABEL).toBe('Pause for 1 hour');
    expect(RESUME_LABEL).toBe('Resume');
    expect(allowanceCount(1)).toBe('1 site');
    expect(LIST_LABEL).toBe('List');
    expect(listDetail({ version: 3, sites: 128, updated: '2026-11-12' })).toBe(
      'Version 3 · 128 sites · updated 2026-11-12',
    );
  });
});
