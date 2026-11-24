import { describe, expect, it } from 'vitest';

const LIST_ID = 'a'.repeat(64);

import {
  ENABLED_SWITCH_LABEL,
  KEEP_WAITING_LABEL,
  PAUSE_DURATION_LABELS,
  PAUSE_ROW_LABEL,
  POPUP_OFF,
  POPUP_ON,
  POPUP_PAUSED,
  REPORT_ISSUE_TITLE,
  RESUME_LABEL,
  SCOPE_DETAIL,
  SCOPE_LABEL,
  SEARCH_ENGINE_NAMES,
  SETTINGS_LABEL,
  SHOW_ALTERNATIVES_LABEL,
  SITE_LISTED,
  SITE_REPORT_HINT,
  SITE_UNLISTED,
  SLOW_NOTE,
  ANTI_USER_NOTE,
  NO_URL_HEADLINE,
  STAY_LABEL,
  WALL_CATEGORY_LABEL,
  WALL_TYPE_LABEL,
  countdownText,
  headline,
  openAnywayLabel,
  pauseCountdown,
  pausedRowLabel,
  openInsteadLabel,
  removeAllowanceLabel,
  reportIssueBody,
  resultsCount,
} from './copy';

const FORBES_URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';

describe('the copy', () => {
  it('counts the publishers of one alternative', () => {
    expect(resultsCount(1)).toBe('1 publisher without a wall');
  });

  it('counts the publishers of a list', () => {
    expect(resultsCount(5)).toBe('5 publishers without a wall');
  });

  it('counts the walls in the headline', () => {
    expect(headline('Forbes', 1)).toBe('Forbes puts a wall in front of this story');
    expect(headline('Forbes', 2)).toBe('Forbes puts two walls in front of this story');
    expect(headline('Forbes', 7)).toBe('Forbes puts seven walls in front of this story');
    expect(headline(null, 0)).toBe(NO_URL_HEADLINE);
  });

  it('judges the ad-blocker wall in a sentence of its own', () => {
    expect(ANTI_USER_NOTE).toBe(
      'An ad-blocker wall is an anti-user practice: the site tries to control what software runs on your computer.',
    );
  });

  it('names the site in the open actions', () => {
    expect(openAnywayLabel('Forbes')).toBe('Open Forbes anyway');
    expect(openInsteadLabel('Forbes')).toBe('Open Forbes instead');
  });

  it('writes the issue body from the url, both identifiers, and the labels', () => {
    const body = reportIssueBody({
      url: FORBES_URL,
      listId: LIST_ID,
      extensionVersion: '0.1.0',
    });

    expect(body).toBe(
      [
        `The page Detour stopped: ${FORBES_URL}`,
        `List: ${LIST_ID}`,
        'Extension version: 0.1.0',
      ].join('\n'),
    );
    expect(reportIssueBody({ url: null, listId: LIST_ID, extensionVersion: '0.1.0' })).toBe(
      [`List: ${LIST_ID}`, 'Extension version: 0.1.0'].join('\n'),
    );
  });

  it('names the host in the issue title', () => {
    expect(REPORT_ISSUE_TITLE('forbes.com')).toBe('Block page problem on forbes.com');
    expect(REPORT_ISSUE_TITLE(null)).toBe('Block page problem');
  });

  it('names the five pauses', () => {
    expect(PAUSE_DURATION_LABELS).toEqual({
      '5m': '5 minutes',
      '30m': '30 minutes',
      '1h': '1 hour',
      today: 'Today',
      session: 'Until the browser restarts',
    });
  });

  it('counts down under an hour and over one', () => {
    expect(pauseCountdown(59 * 60 * 1000 + 42 * 1000)).toBe('59:42 left');
    expect(pauseCountdown(4 * 60 * 1000)).toBe('04:00 left');
    expect(pauseCountdown(3600 * 1000)).toBe('1:00:00 left');
    expect(pauseCountdown(0)).toBe('00:00 left');
  });

  it('names the paused row with and without a clock', () => {
    expect(pausedRowLabel(90 * 1000)).toBe('Paused · 01:30 left');
    expect(pausedRowLabel(null)).toBe('Paused · until Chrome restarts');
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

  it('names the popup state, the two site verdicts, and the wall words', () => {
    expect(POPUP_ON).toBe('On');
    expect(POPUP_OFF).toBe('Off');
    expect(POPUP_PAUSED).toBe('Paused');
    expect(PAUSE_ROW_LABEL).toBe('Pause the list');
    expect(RESUME_LABEL).toBe('Resume');
    expect(SITE_LISTED).toBe('is on the list');
    expect(SITE_UNLISTED).toBe('is not on the list');
    expect(SITE_REPORT_HINT).toBe('If you see a wall here, report it.');
    expect(WALL_CATEGORY_LABEL.adblock).toBe('Ad blocker');
    expect(WALL_CATEGORY_LABEL.age).toBe('Age check');
    expect(WALL_TYPE_LABEL).toEqual({ hard: 'Hard', soft: 'Soft', metered: 'Metered' });
    expect(SETTINGS_LABEL).toBe('Settings');
    expect(SHOW_ALTERNATIVES_LABEL).toBe('Show alternatives');
  });
});
