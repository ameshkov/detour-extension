import { describe, expect, it } from 'vitest';

import { compactUrl } from './page-url';

describe('the address shown for the stopped page', () => {
  it('drops the scheme, the www prefix, the query, and the fragment', () => {
    expect(
      compactUrl(
        'https://www.cnet.com/news-live/black-friday-deals-live-blog-2026-11-24/?_gl=1*abc&_ga=GA1.1#top',
      ),
    ).toBe('cnet.com/news-live/black-friday-deals-live-blog-2026-11-24/');
  });

  it('shows the host alone for the front page', () => {
    expect(compactUrl('https://www.forbes.com/')).toBe('forbes.com');
    expect(compactUrl('https://forbes.com')).toBe('forbes.com');
  });

  it('keeps a port that the address names', () => {
    expect(compactUrl('http://127.0.0.1:8787/walled/story')).toBe('127.0.0.1:8787/walled/story');
  });

  it('keeps a value that is not a web address as it is', () => {
    expect(compactUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(compactUrl('not a url')).toBe('not a url');
  });

  it('keeps the path as the page wrote it, with its case and its escapes', () => {
    expect(compactUrl('https://example.com/News/A%20Story')).toBe('example.com/News/A%20Story');
  });
});
