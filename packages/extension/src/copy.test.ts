import { describe, expect, it } from 'vitest';

const LIST_ID = 'a'.repeat(64);

import {
  ENABLED_SWITCH_LABEL,
  KEEP_WAITING_LABEL,
  POPUP_OFF,
  POPUP_ON,
  POPUP_UNAVAILABLE,
  REPORT_ISSUE_TITLE,
  SCOPE_DETAIL,
  SCOPE_LABEL,
  SEARCH_CARD_POPUP_DETAIL,
  SEARCH_ENGINE_NAMES,
  SETTINGS_LABEL,
  SITE_NOT_LISTED,
  SITE_REPORT_HINT,
  SLOW_NOTE,
  ANTI_USER_NOTE,
  NO_URL_HEADLINE,
  STAY_LABEL,
  WALL_CATEGORY_LABEL,
  WALL_TYPE_LABEL,
  countdownText,
  headline,
  openAnywayLabel,
  openInsteadLabel,
  removeAllowanceLabel,
  reportIssueBody,
  WALL_TYPE_DETAIL,
  fallbackHintParts,
  keyboardHint,
  sitesSimilarLabel,
  verifiedOn,
  resultsCount,
  resultsLabel,
  wallsDetected,
} from './copy';

const FORBES_URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';

describe('the copy', () => {
  it('counts one route to the story', () => {
    expect(resultsCount(1)).toBe('1');
    expect(resultsLabel(1)).toBe('1 route to this story');
  });

  it('counts the routes of a list', () => {
    expect(resultsCount(5)).toBe('5');
    expect(resultsLabel(5)).toBe('5 routes to this story');
  });

  it('names similar sites with their domain', () => {
    expect(sitesSimilarLabel('forbes.com')).toBe('Sites similar to forbes.com');
  });

  it('names the keys of the engine hint', () => {
    const parts = fallbackHintParts();

    expect(parts.filter((part) => part.key === true).map((part) => part.text)).toEqual([
      '1',
      '4',
      '↵',
      '↑',
    ]);
    expect(parts.map((part) => part.text).join('')).toBe(
      'Press 1–4 and ↵ to search with an engine. ↑ edits the query',
    );
  });

  it('names the digits that open a row', () => {
    expect(keyboardHint(1)).toBe('Press 1 or ↑↓ + ↵ to open an alternative');
    expect(keyboardHint(4)).toBe('Press 1–4 or ↑↓ + ↵ to open an alternative');
    expect(keyboardHint(12)).toBe('Press 1–9 or ↑↓ + ↵ to open an alternative');
  });

  it('writes the checked date in the calendar form of the list', () => {
    expect(verifiedOn('2026-11-12')).toBe('Verified 2026-11-12');
  });

  it('describes the wall types as detour-list defines them', () => {
    expect(WALL_TYPE_DETAIL.hard).toBe(
      'The story stays out of reach until the reader pays, registers, accepts tracking, or turns the ad blocker off.',
    );
    expect(WALL_TYPE_DETAIL.soft).toBe(
      'A card covers the story, and the reader dismisses or defers it, so the story reads.',
    );
    expect(WALL_TYPE_DETAIL.metered).toBe(
      'The page limits the number of articles a reader can open.',
    );
  });

  it('counts the walls in the header', () => {
    expect(wallsDetected(1)).toBe('1 wall detected');
    expect(wallsDetected(3)).toBe('3 walls detected');
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
    expect(POPUP_UNAVAILABLE).toBe('Detour could not read this page.');
    expect(SITE_NOT_LISTED).toBe('This site is not on the list');
    expect(SEARCH_CARD_POPUP_DETAIL).toBe('Pick an engine.');
    expect(SITE_REPORT_HINT).toBe('If you see a wall here, report it.');
    expect(WALL_CATEGORY_LABEL.adblock).toBe('Ad blocker');
    expect(WALL_CATEGORY_LABEL.age).toBe('Age check');
    expect(WALL_TYPE_LABEL).toEqual({ hard: 'Hard', soft: 'Soft', metered: 'Metered' });
    expect(SETTINGS_LABEL).toBe('Settings');
  });
});
