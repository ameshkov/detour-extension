import { describe, expect, it } from 'vitest';

import { MIN_QUERY_WORDS, buildQuery, cleanTitle } from './query';

const articleUrl = 'https://www.forbes.com/sites/alanohnsman/2026/11/10/nvidia-bets-on-chips/';

function wordsOf(query: string): string[] {
  return query === '' ? [] : query.split(' ');
}

describe('title cleaning', () => {
  it('drops a trailing segment that names the site', () => {
    const query = cleanTitle({
      title: 'Nvidia Bets On Custom Silicon - Forbes',
      url: articleUrl,
      siteName: 'Forbes',
    });

    expect(query).toBe('Nvidia Bets On Custom Silicon');
  });

  it('drops a trailing segment that names the registrable domain', () => {
    const query = cleanTitle({
      title: 'Nvidia Bets On Custom Silicon | forbes.com',
      url: articleUrl,
      siteName: 'Forbes Media',
    });

    expect(query).toBe('Nvidia Bets On Custom Silicon');
  });

  it('drops only the last segment', () => {
    const query = cleanTitle({ title: 'A - B - Forbes', url: articleUrl, siteName: 'Forbes' });

    expect(query).toBe('A - B');
  });

  it('keeps a trailing segment that names neither', () => {
    const query = cleanTitle({
      title: 'Nvidia Bets On Custom Silicon · Reuters',
      url: articleUrl,
      siteName: 'Forbes',
    });

    expect(query).toBe('Nvidia Bets On Custom Silicon · Reuters');
  });

  it('keeps a title whose separator is not one of the four', () => {
    const query = cleanTitle({
      title: 'Nvidia Bets On Custom Silicon: Forbes',
      url: articleUrl,
      siteName: 'Forbes',
    });

    expect(query).toBe('Nvidia Bets On Custom Silicon: Forbes');
  });
});

describe('query building', () => {
  it('adds slug words when the title is short', () => {
    const query = buildQuery({
      title: 'Chips',
      url: 'https://www.forbes.com/tech/nvidia-custom-silicon/',
      siteName: 'Forbes',
    });

    expect(wordsOf(query).length).toBeGreaterThanOrEqual(MIN_QUERY_WORDS);
    expect(query).toContain('nvidia');
    expect(query).toContain('silicon');
  });

  it('drops stopwords from the slug', () => {
    const query = buildQuery({
      title: 'Chips',
      url: 'https://www.forbes.com/the-best-of-the-nvidia-and-amd-chips/',
      siteName: 'Forbes',
    });

    const words = wordsOf(query).map((word) => word.toLowerCase());

    expect(words).not.toContain('the');
    expect(words).not.toContain('of');
    expect(words).not.toContain('and');
    expect(words).toContain('nvidia');
  });

  it('keeps the title alone when it is long enough', () => {
    const title = 'Nvidia Bets On Custom Silicon For Data Centers';

    const query = buildQuery({
      title,
      url: 'https://www.forbes.com/tech/amd-instinct-chips/',
      siteName: 'Forbes',
    });

    expect(query).toBe(title);
  });

  it('collapses whitespace', () => {
    const query = cleanTitle({
      title: '  Nvidia   Bets  On  Custom Silicon  ',
      url: articleUrl,
      siteName: 'Forbes',
    });

    expect(query).toBe('Nvidia Bets On Custom Silicon');
  });

  it('stops at three hundred characters on a word boundary', () => {
    const word = 'silicon';
    const title = Array.from({ length: 60 }, () => word).join(' ');

    const query = buildQuery({ title, url: articleUrl, siteName: 'Forbes' });

    expect(query.length).toBeLessThanOrEqual(300);
    expect(query.endsWith(' ')).toBe(false);
    expect(title.charAt(query.length)).toBe(' ');
    expect(query.endsWith(word)).toBe(true);
  });

  it('adds slug words when four words are shorter than twenty-five characters', () => {
    const query = buildQuery({
      title: 'Chips Are Very Fast',
      url: articleUrl,
      siteName: 'Forbes',
    });

    expect(wordsOf(query).length).toBeGreaterThan(4);
    expect(query.startsWith('Chips Are Very Fast')).toBe(true);
  });

  it('adds at most eight slug words', () => {
    const query = buildQuery({
      title: 'Chips',
      url: 'https://example.com/a-b-c-d-e-f-g-h-i-j-k-l/',
      siteName: 'Example',
    });

    expect(wordsOf(query).length).toBeLessThanOrEqual(1 + 8);
  });

  it('cuts the joined query when the slug words pass the limit', () => {
    const title = Array.from({ length: 40 }, () => 'chip').join(' ');
    const query = buildQuery({ title, url: articleUrl, siteName: 'Forbes' });

    expect(query.length).toBeLessThanOrEqual(300);
    expect(query.endsWith('chip')).toBe(true);
  });

  it('hard-cuts when the window holds no space', () => {
    const query = buildQuery({ title: 'x'.repeat(400), url: articleUrl, siteName: 'Forbes' });

    expect(query).toHaveLength(300);
  });

  it('returns an empty string when nothing is left', () => {
    expect(buildQuery({ title: '', url: 'https://www.forbes.com/', siteName: 'Forbes' })).toBe('');
  });

  it('keeps the words in url order', () => {
    const query = buildQuery({
      title: 'Chips',
      url: 'https://www.forbes.com/first/second-third_fourth.fifth',
      siteName: 'Forbes',
    });

    expect(wordsOf(query)).toEqual(['Chips', 'first', 'second', 'third', 'fourth', 'fifth']);
  });
});
