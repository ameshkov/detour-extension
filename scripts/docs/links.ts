import { posix } from 'node:path';

import type { DocFile, DocProblem } from './markdown';
import { headingsOf, linksIn } from './markdown';

function resolvePath(from: string, target: string): string {
  const folder = posix.dirname(from);
  const base = folder === '.' ? '' : folder;
  const relative = target.replace(/^\/+/, '');

  return posix.normalize(posix.join(base, relative));
}

export function checkLinks(
  docs: readonly DocFile[],
  exists: (path: string) => boolean,
): DocProblem[] {
  const anchorsByPath = new Map<string, Set<string>>();

  for (const doc of docs) {
    anchorsByPath.set(doc.path, new Set(headingsOf(doc.text).map((heading) => heading.slug)));
  }

  const problems: DocProblem[] = [];

  for (const doc of docs) {
    for (const link of linksIn(doc.text)) {
      const hash = link.target.indexOf('#');
      const pathPart = hash === -1 ? link.target : link.target.slice(0, hash);
      const anchor = hash === -1 ? '' : link.target.slice(hash + 1);
      const targetPath = pathPart === '' ? doc.path : resolvePath(doc.path, pathPart);

      const escapesRoot = targetPath.startsWith('..') || posix.isAbsolute(targetPath);

      if (pathPart !== '' && escapesRoot) {
        problems.push({ path: doc.path, line: link.line, message: `dead link: ${link.target}` });
        continue;
      }

      if (pathPart !== '' && !exists(targetPath)) {
        problems.push({ path: doc.path, line: link.line, message: `dead link: ${link.target}` });
        continue;
      }

      if (anchor === '') {
        continue;
      }

      const anchors = anchorsByPath.get(targetPath);

      if (anchors === undefined) {
        continue;
      }

      if (!anchors.has(anchor)) {
        problems.push({ path: doc.path, line: link.line, message: `dead anchor: ${link.target}` });
      }
    }
  }

  return problems;
}
