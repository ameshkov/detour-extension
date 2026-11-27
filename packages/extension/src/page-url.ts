/**
 * The questions the block page, the report link, and the popup ask of a value
 * from the query: is it a web address, which site does it name, and how does a
 * narrow card show it. They live apart from any renderer, so a module that only
 * needs the answer never imports one.
 */

/** An `http` or `https` value, so a non-web scheme never becomes a link. */
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The site as the reader knows it: the host with the `www.` prefix removed. A
 * value that does not parse, or is not http(s), names no site.
 */
export function hostOf(url: string | null): string | null {
  if (url === null) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  return parsed.hostname.replace(/^www\./, '');
}

/**
 * The address that the worker stamped into a block page, or null when the page
 * carries none. The toolbar answers for that page, not for the block page.
 */
export function originalUrl(search: string): string | null {
  const value = new URLSearchParams(search).get('u');

  return value === null || value === '' ? null : value;
}

/**
 * The address as a narrow card shows it: the host without `www.` and the path,
 * with no scheme, query, or fragment. The full address stays in the link and in
 * its title, and a value that is not a web address stays as it is.
 */
export function compactUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return value;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return value;
  }

  const host = parsed.host.replace(/^www\./, '');
  const path = parsed.pathname === '/' ? '' : parsed.pathname;

  return `${host}${path}`;
}
