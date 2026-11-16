import { registrableDomain } from './domain';

export const MAX_QUERY_LENGTH = 300;
export const MIN_QUERY_WORDS = 4;
export const MIN_QUERY_CHARS = 25;
export const MAX_SLUG_WORDS = 8;

const STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'from',
  'by',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'as',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'he',
  'she',
  'they',
  'we',
  'you',
  'i',
  'his',
  'her',
  'their',
  'our',
  'your',
  'not',
  'no',
  'do',
  'does',
  'did',
  'has',
  'have',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'than',
  'then',
  'when',
  'while',
  'how',
  'why',
  'what',
]);

const TITLE_SEPARATORS = [' - ', ' | ', ' · ', ' — '];
const SLUG_SEPARATORS = /[/\-_.]/;
const WHITESPACE = /\s+/g;

type QueryInput = { title: string; url: string; siteName: string };

function collapseWhitespace(text: string): string {
  return text.replace(WHITESPACE, ' ').trim();
}

/**
 * Trims the segment that a page title appends after the article title. The
 * segment names the publisher, so it narrows a search instead of widening it.
 */
export function cleanTitle(input: QueryInput): string {
  const title = collapseWhitespace(input.title);
  const siteName = collapseWhitespace(input.siteName).toLowerCase();
  const domain = registrableDomain(input.url);

  let cutAt = -1;
  let segmentStart = -1;

  for (const separator of TITLE_SEPARATORS) {
    const index = title.lastIndexOf(separator);

    if (index > cutAt) {
      cutAt = index;
      segmentStart = index + separator.length;
    }
  }

  if (cutAt === -1) {
    return title;
  }

  const segment = title.slice(segmentStart).toLowerCase();
  const namesSite =
    (siteName !== '' && segment.includes(siteName)) || (domain !== '' && segment.includes(domain));

  if (!namesSite) {
    return title;
  }

  return collapseWhitespace(title.slice(0, cutAt));
}

function slugWords(url: string): string[] {
  let pathname: string;

  try {
    pathname = new URL(url).pathname;
  } catch {
    return [];
  }

  const words: string[] = [];

  for (const token of pathname.split(SLUG_SEPARATORS)) {
    const word = token.toLowerCase();

    if (word === '' || STOPWORDS.has(word)) {
      continue;
    }

    words.push(word);
  }

  return words;
}

function cutAtWordBoundary(text: string): string {
  if (text.length <= MAX_QUERY_LENGTH) {
    return text;
  }

  const window = text.slice(0, MAX_QUERY_LENGTH);
  const lastSpace = window.lastIndexOf(' ');

  // A window with no space is a single long token, so the hard cut is the only
  // useful answer for a search query.
  return (lastSpace > 0 ? window.slice(0, lastSpace) : window).trim();
}

export function buildQuery(input: QueryInput): string {
  const title = cleanTitle(input);

  if (title.length >= MAX_QUERY_LENGTH) {
    return cutAtWordBoundary(title);
  }

  const titleWords = title === '' ? [] : title.split(' ');
  const isShort = titleWords.length < MIN_QUERY_WORDS || title.length < MIN_QUERY_CHARS;

  if (!isShort) {
    return cutAtWordBoundary(title);
  }

  const seen = new Set(titleWords.map((word) => word.toLowerCase()));
  const additions: string[] = [];

  for (const word of slugWords(input.url)) {
    if (additions.length === MAX_SLUG_WORDS) {
      break;
    }

    // A repeated word spends one of the eight slots and adds nothing to the
    // search, so the slug never repeats a word the title already carries.
    if (seen.has(word)) {
      continue;
    }

    seen.add(word);
    additions.push(word);
  }

  if (additions.length === 0) {
    return cutAtWordBoundary(title);
  }

  const query = title === '' ? additions.join(' ') : `${title} ${additions.join(' ')}`;

  return cutAtWordBoundary(query);
}
