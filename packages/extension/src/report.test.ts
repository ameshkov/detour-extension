import { describe, expect, it } from 'vitest';

import { REPORT_ISSUE_URL } from './constants';
import { REPORT_ISSUE_TITLE, reportIssueBody } from './copy';
import { reportUrl } from './report';

const FORBES_URL = 'https://www.forbes.com/sites/richardnieva/2026/10/14/nvidias-next-move/';

function issues(url: string | null, listVersion = 7, extensionVersion = '0.1.0'): URL {
  return new URL(reportUrl({ url, listVersion, extensionVersion }));
}

describe('the report link', () => {
  it('prefills the issue with the url, the list version, and the extension version', () => {
    const issue = issues(FORBES_URL);

    expect(issue.origin + issue.pathname).toBe(REPORT_ISSUE_URL);
    expect(issue.searchParams.get('title')).toBe(REPORT_ISSUE_TITLE('forbes.com'));
    expect(issue.searchParams.get('body')).toBe(
      reportIssueBody({
        url: FORBES_URL,
        listVersion: 7,
        extensionVersion: '0.1.0',
      }),
    );
    expect(issue.searchParams.get('body')?.split('\n')).toEqual([
      `The page Detour stopped: ${FORBES_URL}`,
      'List version: 7',
      'Extension version: 0.1.0',
    ]);
  });

  it('names the site in the title', () => {
    expect(issues(FORBES_URL).searchParams.get('title')).toBe('Block page problem on forbes.com');
  });

  it('leaves the url line out of a report without a url', () => {
    const body = issues(null).searchParams.get('body')?.split('\n');

    expect(body).toEqual(['List version: 7', 'Extension version: 0.1.0']);
  });

  it('keeps a value that is not a web url out of the title', () => {
    const unsafe = 'javascript:alert(1)';
    const issue = issues(unsafe);

    expect(issue.searchParams.get('title')).toBe('Block page problem');
    expect(issue.searchParams.get('body')?.split('\n')[0]).toBe(
      `The page Detour stopped: ${unsafe}`,
    );
  });
});
