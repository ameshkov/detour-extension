// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

import { mountShell, readShell, role } from './shell';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the page shell', () => {
  it('reads a page from beside the source', () => {
    const html = readShell('popup.html');

    expect(html).toContain('data-page="popup"');
    expect(html).toContain('<link rel="stylesheet" href="ui.css" />');
  });

  it('mounts the body and drops its scripts', () => {
    mountShell(readShell('block.html'));

    expect(role('headline')).toBeInstanceOf(HTMLElement);
    expect(document.body.querySelector('script')).toBeNull();
  });

  it('names a role or throws', () => {
    mountShell(readShell('block.html'));

    expect(role('headline').getAttribute('data-role')).toBe('headline');
    expect(() => role('missing')).toThrow('the shell has no missing element');
  });
});
