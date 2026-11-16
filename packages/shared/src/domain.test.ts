import { describe, expect, it } from 'vitest';

import { registrableDomain } from './domain';

describe('the registrable domain', () => {
  it('reads the registrable domain of a subdomain', () => {
    expect(registrableDomain('https://news.forbes.com/a')).toBe('forbes.com');
  });

  it('lowercases the domain', () => {
    expect(registrableDomain('https://News.Forbes.COM/a')).toBe('forbes.com');
  });

  it('returns an empty string when there is no registrable domain', () => {
    expect(registrableDomain('http://192.168.0.1/a')).toBe('');
    expect(registrableDomain('not a url')).toBe('');
  });
});
