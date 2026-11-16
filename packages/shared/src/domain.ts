import { getDomain } from 'tldts';

/**
 * The registrable domain of a URL: the public suffix plus one label. An empty
 * string answers an IP host and a value that does not parse, so a caller can
 * drop an entry it cannot name.
 */
export function registrableDomain(url: string): string {
  return getDomain(url)?.toLowerCase() ?? '';
}
