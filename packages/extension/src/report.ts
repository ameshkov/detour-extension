import { REPORT_ISSUE_URL } from './constants';
import { REPORT_ISSUE_TITLE, reportIssueBody } from './copy';
import { hostOf } from './page-url';

export type ReportInput = {
  url: string | null;
  listId: string;
  extensionVersion: string;
};

/**
 * The prefilled issue form. The title names the site, and the body carries the
 * page, the list, and the build, so a report arrives with the facts a
 * reader would otherwise have to look up.
 */
export function reportUrl(input: ReportInput): string {
  const title = encodeURIComponent(REPORT_ISSUE_TITLE(hostOf(input.url)));
  const body = encodeURIComponent(reportIssueBody(input));

  return `${REPORT_ISSUE_URL}?title=${title}&body=${body}`;
}
