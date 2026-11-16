/**
 * The three page shells, read from the source tree and mounted into the test
 * document. A page test imports these instead of repeating the read, the slice,
 * and the markup lookup.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readShell(file: 'block.html' | 'popup.html' | 'options.html'): string {
  return readFileSync(resolve(import.meta.dirname, '..', file), 'utf8');
}

/**
 * The body's contents without the scripts: the browser runs a page's bundle
 * from its own document, so the test mounts the markup and drives the module.
 */
export function mountShell(html: string): void {
  const open = html.indexOf('<body');
  const start = html.indexOf('>', open) + 1;
  const end = html.indexOf('</body>', start);

  document.body.innerHTML = html
    .slice(start, end)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}

export function role(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-role="${name}"]`);

  if (element === null) {
    throw new Error(`the shell has no ${name} element`);
  }

  return element;
}
