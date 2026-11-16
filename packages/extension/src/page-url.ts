/**
 * The two questions the block page, the report link, and the popup ask of a
 * value from the query: is it a web address, and which site does it name. They
 * live apart from any renderer, so a module that only needs the answer never
 * imports one.
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
