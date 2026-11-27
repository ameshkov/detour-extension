import type { PageMeta } from './metadata';

/** A stored field never holds a page's whole script or a data URL. */
const META_MAX_STRING = 2048;

/** A title collapses its whitespace to one space; an empty value is null. */
function readText(value: string | null, collapse: boolean): string | null {
  if (value === null) {
    return null;
  }

  const cleaned = collapse ? value.replace(/\s+/g, ' ').trim() : value.trim();

  return cleaned === '' ? null : cleaned.slice(0, META_MAX_STRING);
}

/** The content of the first meta tag whose property or name is one of these. */
function metaContent(document: Document, keys: readonly string[]): string | null {
  for (const element of document.querySelectorAll('meta')) {
    const found = element.getAttribute('property') ?? element.getAttribute('name');

    if (found !== null && keys.includes(found.toLowerCase())) {
      return element.getAttribute('content');
    }
  }

  return null;
}

/** The icon link as an absolute http or https address, or null. */
function resolveIcon(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);

    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function relationsOf(element: Element): string[] {
  return (element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
}

/**
 * The icon of the page: the first `rel="icon"` that resolves, else the
 * `apple-touch-icon` that the page offers, else the file that a browser asks for
 * when the head names none. The relation list is split, because one link can
 * carry several relations.
 */
function readIcon(document: Document, baseUrl: string): string | null {
  let apple: string | null = null;

  for (const element of document.querySelectorAll('link')) {
    const relations = relationsOf(element);
    const href = (element.getAttribute('href') ?? '').trim();

    if (href === '') {
      continue;
    }

    if (relations.includes('icon')) {
      const resolved = resolveIcon(href, baseUrl);

      if (resolved !== null) {
        return resolved;
      }
    } else if (relations.includes('apple-touch-icon') && apple === null) {
      apple = href;
    }
  }

  if (apple !== null) {
    const resolved = resolveIcon(apple, baseUrl);

    if (resolved !== null) {
      return resolved;
    }
  }

  return resolveIcon('/favicon.ico', baseUrl);
}

/**
 * Reads the head that the parser has already inserted, in the order that the
 * served list and the old reader used, so a stored entry does not change
 * meaning. It never fetches, and every missing or unusable value is null.
 */
export function readPageMeta(document: Document, baseUrl: string): PageMeta {
  return {
    title:
      readText(metaContent(document, ['og:title']), true) ??
      readText(document.title === '' ? null : document.title, true),
    description:
      readText(metaContent(document, ['og:description']), false) ??
      readText(metaContent(document, ['description']), false),
    icon: readIcon(document, baseUrl),
  };
}
