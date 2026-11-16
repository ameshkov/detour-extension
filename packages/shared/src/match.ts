const TRAILING_DOT = /\.$/;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(TRAILING_DOT, '');
}

export function hostMatches(host: string, domain: string): boolean {
  const normalizedHost = normalizeHost(host);
  const normalizedDomain = normalizeHost(domain);

  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function globToRegExp(glob: string): RegExp {
  let source = '^';

  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index);

    if (char === '*') {
      if (glob.charAt(index + 1) === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }

    source += char.replace(REGEX_SPECIAL, '\\$&');
  }

  return new RegExp(`${source}$`);
}

export function pathMatches(path: string, globs: readonly string[]): boolean {
  if (globs.length === 0) {
    return true;
  }

  return globs.some((glob) => globToRegExp(glob).test(path));
}

/** The fields the matcher reads from one entry of a list. */
type MatchableSite = { domain: string; paths: readonly string[] };

export function findListedSite<T extends MatchableSite>(
  list: { sites: readonly T[] },
  url: string,
): T | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const site = list.sites.find(
    (entry) =>
      hostMatches(parsed.hostname, entry.domain) && pathMatches(parsed.pathname, entry.paths),
  );

  return site ?? null;
}
