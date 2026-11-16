const ATTRIBUTE_TAGS: ReadonlySet<string> = new Set(['meta', 'link']);
const RAW_TEXT_TAGS: ReadonlySet<string> = new Set(['script', 'style']);
const CLOSING_TAG_PATTERNS = new Map<string, RegExp>();
const ATTRIBUTE_SOURCE = String.raw`([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))`;

type ClosingTag = { start: number; end: number };

/** The first closing tag of `name` at or after `from`, found in one pass. */
function findClosingTag(html: string, name: string, from: number): ClosingTag | null {
  let pattern = CLOSING_TAG_PATTERNS.get(name);

  if (pattern === undefined) {
    pattern = new RegExp(`</${name}[^>]*>`, 'gi');
    CLOSING_TAG_PATTERNS.set(name, pattern);
  }

  pattern.lastIndex = from;

  const match = pattern.exec(html);

  return match === null ? null : { start: match.index, end: match.index + match[0].length };
}

function isNameChar(code: number): boolean {
  return (
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2d ||
    code === 0x3a
  );
}

/**
 * The index of the `>` that ends a tag, walking forward with a quote flag so a
 * `>` inside a quoted value does not end it. A tag that never ends answers -1.
 */
function findTagEnd(html: string, from: number): number {
  let quote = '';

  for (let index = from; index < html.length; index += 1) {
    const char = html[index];

    if (quote !== '') {
      if (char === quote) {
        quote = '';
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }

  return -1;
}

export type ScannedTag = { name: string; text: string; content: string | null };

/**
 * Every `meta`, `link`, and `title` tag outside a comment and outside a script or
 * style body, in document order. A page is untrusted input, so the scan walks the
 * text once: it finds the next `<`, skips a comment or a raw-text body whole, and
 * walks to the tag's `>` with a quote flag. No pattern backtracks over the page,
 * so a head of unterminated tags costs one pass instead of one per tag.
 */
export function scanTags(html: string): ScannedTag[] {
  const tags: ScannedTag[] = [];
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf('<', index);

    if (open === -1) {
      break;
    }

    if (html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4);

      if (close === -1) {
        break;
      }

      index = close + 3;
      continue;
    }

    if (html.startsWith('</', open) || html.startsWith('<!', open) || html.startsWith('<?', open)) {
      const close = html.indexOf('>', open + 1);

      if (close === -1) {
        break;
      }

      index = close + 1;
      continue;
    }

    const nameStart = open + 1;
    let nameEnd = nameStart;

    while (isNameChar(html.charCodeAt(nameEnd))) {
      nameEnd += 1;
    }

    if (nameEnd === nameStart) {
      index = nameStart;
      continue;
    }

    const name = html.slice(nameStart, nameEnd).toLowerCase();
    const end = findTagEnd(html, nameEnd);

    if (end === -1) {
      break;
    }

    if (RAW_TEXT_TAGS.has(name)) {
      const closing = findClosingTag(html, name, end + 1);

      if (closing === null) {
        break;
      }

      index = closing.end;
      continue;
    }

    if (name === 'title') {
      const closing = findClosingTag(html, 'title', end + 1);

      if (closing === null) {
        break;
      }

      tags.push({
        name,
        text: html.slice(open, end + 1),
        content: html.slice(end + 1, closing.start),
      });
      index = closing.end;
      continue;
    }

    if (ATTRIBUTE_TAGS.has(name)) {
      tags.push({ name, text: html.slice(open, end + 1), content: null });
    }

    index = end + 1;
  }

  return tags;
}

/** The attributes of one tag by lowercase name. */
export function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = new RegExp(ATTRIBUTE_SOURCE, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(tag)) !== null) {
    const name = match[1]?.toLowerCase() ?? '';
    const value = match[2] ?? match[3] ?? match[4] ?? '';

    if (!found.has(name)) {
      found.set(name, value);
    }
  }

  return found;
}

export function metaKey(tag: string): { key: string; content: string } | null {
  const attrs = attributes(tag);
  const content = attrs.get('content');

  if (content === undefined) {
    return null;
  }

  return { key: (attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase(), content };
}
