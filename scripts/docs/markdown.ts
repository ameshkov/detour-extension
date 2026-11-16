export interface DocFile {
  readonly path: string;
  readonly text: string;
}

export interface DocProblem {
  readonly path: string;
  readonly line: number;
  readonly message: string;
}

export interface Heading {
  readonly slug: string;
  readonly line: number;
}

export interface Link {
  readonly target: string;
  readonly line: number;
}

export interface CodeChunk {
  readonly text: string;
  readonly line: number;
}

interface Fence {
  readonly char: string;
  readonly length: number;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const HEADING = /^ {0,3}#{1,6}[ \t]+(.*)$/;
const INLINE_CODE = /(`+)(.+?)\1/g;
const LINK = /!?\[[^\]]*\]\(\s*([^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const EXTERNAL = /^(?:https?:|mailto:)/i;

export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

function fenceOf(line: string): Fence | null {
  const marker = FENCE_OPEN.exec(line)?.[1];

  if (marker === undefined) {
    return null;
  }

  return { char: marker.charAt(0), length: marker.length };
}

function closes(line: string, fence: Fence): boolean {
  const marker = FENCE_CLOSE.exec(line)?.[1];

  return marker !== undefined && marker.charAt(0) === fence.char && marker.length >= fence.length;
}

function maskCodeSpans(line: string): string {
  return line.replace(INLINE_CODE, (span) => ' '.repeat(span.length));
}

export function headingsOf(text: string): Heading[] {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  let fence: Fence | null = null;

  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineNumber = index + 1;

    if (fence !== null) {
      if (closes(line, fence)) {
        fence = null;
      }

      continue;
    }

    const opened = fenceOf(line);

    if (opened !== null) {
      fence = opened;
      continue;
    }

    const match = HEADING.exec(line);

    if (match === null) {
      continue;
    }

    const raw = (match[1] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim();
    const base = slugify(raw);
    const count = seen.get(base);

    if (count === undefined) {
      seen.set(base, 0);
      headings.push({ slug: base, line: lineNumber });
      continue;
    }

    const next = count + 1;
    seen.set(base, next);
    headings.push({ slug: `${base}-${next}`, line: lineNumber });
  }

  return headings;
}

export function linksIn(text: string): Link[] {
  const links: Link[] = [];
  let fence: Fence | null = null;

  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineNumber = index + 1;

    if (fence !== null) {
      if (closes(line, fence)) {
        fence = null;
      }

      continue;
    }

    const opened = fenceOf(line);

    if (opened !== null) {
      fence = opened;
      continue;
    }

    for (const match of maskCodeSpans(line).matchAll(LINK)) {
      const target = match[1];

      if (target === undefined || EXTERNAL.test(target)) {
        continue;
      }

      links.push({ target, line: lineNumber });
    }
  }

  return links;
}

export function codesIn(text: string): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let fence: (Fence & { line: number; content: string[] }) | null = null;

  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineNumber = index + 1;

    if (fence !== null) {
      if (closes(line, fence)) {
        chunks.push({ text: fence.content.join('\n'), line: fence.line });
        fence = null;
      } else {
        fence.content.push(line);
      }

      continue;
    }

    const opened = fenceOf(line);

    if (opened !== null) {
      fence = { ...opened, line: lineNumber, content: [] };
      continue;
    }

    for (const match of line.matchAll(INLINE_CODE)) {
      const span = match[2];

      if (span !== undefined) {
        chunks.push({ text: span, line: lineNumber });
      }
    }
  }

  if (fence !== null) {
    chunks.push({ text: fence.content.join('\n'), line: fence.line });
  }

  return chunks;
}
