import { renderListFormat } from '@detour/shared/list-format';

import type { DocProblem } from './markdown';

export const LIST_FORMAT_DOC = 'docs/list-format.md';

export function checkGeneratedDoc(actual: string | null): DocProblem[] {
  if (actual === null) {
    return [
      {
        path: LIST_FORMAT_DOC,
        line: 1,
        message: `missing generated file: ${LIST_FORMAT_DOC}. Run pnpm docs:generate.`,
      },
    ];
  }

  const text = actual.endsWith('\n') ? actual.slice(0, -1) : actual;

  if (text !== renderListFormat()) {
    return [
      {
        path: LIST_FORMAT_DOC,
        line: 1,
        message: `stale generated file: ${LIST_FORMAT_DOC}. Run pnpm docs:generate.`,
      },
    ];
  }

  return [];
}
