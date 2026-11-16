import type { SiteEntry } from '@detour/shared';

export const EVIDENCE_MIN_CHARS = 200;

const CHECKED_LINE = /^- Checked: (\d{4}-\d{2}-\d{2})$/m;

export function checkEvidence(entry: SiteEntry, text: string | null): string[] {
  if (text === null) {
    return ['evidence file is missing'];
  }

  const problems: string[] = [];

  if (text.length < EVIDENCE_MIN_CHARS) {
    problems.push(`evidence is ${text.length} characters, shorter than ${EVIDENCE_MIN_CHARS}`);
  }

  const checked = CHECKED_LINE.exec(text);

  if (checked === null) {
    problems.push('evidence has no "- Checked: <YYYY-MM-DD>" line');
  } else if (checked[1] !== entry.verified) {
    problems.push(
      `evidence checked date ${checked[1]} does not match the verified date ${entry.verified}`,
    );
  }

  return problems;
}
