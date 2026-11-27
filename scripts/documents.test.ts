import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);

  if (start === -1) {
    return '';
  }

  const end = markdown.indexOf('\n## ', start + heading.length);

  return end === -1 ? markdown.slice(start) : markdown.slice(start, end);
}

describe('the architecture page', () => {
  const architecture = read('docs/architecture.md');

  it('sends the block page to the service worker alone', () => {
    const row = architecture.split('\n').find((line) => line.startsWith('| Block page'));

    expect(row).toBeDefined();
    expect(row).toContain('Service worker');
    expect(row).not.toContain('Storage');
    expect(row).not.toContain('Worker API');
  });

  it('orders the popup page as card, routes, then the footer links', () => {
    const popup = collapse(section(architecture, 'Popup and options page'));
    const card = popup.indexOf('the source card names the page');
    const routes = popup.indexOf('routes follow the card');
    const links = popup.indexOf('How it works');

    expect(card).toBeGreaterThan(-1);
    expect(routes).toBeGreaterThan(-1);
    expect(links).toBeGreaterThan(-1);
    expect(card).toBeLessThan(routes);
    expect(routes).toBeLessThan(links);
  });

  it('names the two state messages the surfaces send', () => {
    const contract = collapse(architecture);

    expect(contract).toContain('`popupState`');
    expect(contract).toContain('`pageState`');
    expect(contract).toContain('`openRoute`');
    expect(contract).not.toContain('showAlternatives');
  });

  it('names the three backend routes the extension uses', () => {
    const contract = collapse(section(architecture, 'Backend contract'));

    expect(contract).toContain('GET /v1/list');
    expect(contract).toContain('POST /v1/alternatives');
    expect(contract).toContain('GET /v1/img');
  });

  it('states that the image link must be absolute', () => {
    const images = collapse(section(architecture, 'Images'));

    expect(images).toContain('must be absolute');
  });
});

describe('the readme', () => {
  it('names the one-command local start in the readme', () => {
    const readme = collapse(read('README.md'));

    expect(readme).toContain('`pnpm dev`');
    expect(readme).toContain('http://127.0.0.1:8787/walled/nvidia-custom-silicon');
    expect(readme).toContain('`DETOUR_API_BASE`');
    expect(readme).not.toContain('not implemented yet');
  });
});

describe('the development guide', () => {
  it('lists the local commands and the backend value', () => {
    const guide = collapse(read('DEVELOPMENT.md'));

    expect(guide).toContain('`pnpm dev`');
    expect(guide).toContain('`pnpm dummy-server`');
    expect(guide).toContain('`pnpm test:e2e`');
    expect(guide).toContain('`DETOUR_API_BASE`');
    expect(guide).not.toContain('not implemented yet');
    expect(guide).not.toContain('prints the stub message');
  });
});

describe('the privacy policy', () => {
  const policy = collapse(read('docs/privacy.md'));

  it('states that the backend stores the query', () => {
    expect(policy).toContain('Detour stores the query as described above');
    expect(policy).not.toContain('Detour does not store the query');
  });

  it('describes the favicon as the only image request', () => {
    expect(policy).toContain('the block page does not draw that image');
    expect(policy).toContain('reuses it as the row tile');
  });
});
