import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';

import { page } from './layout';

export const ROOT = resolve(import.meta.dirname, '..');
export const OUT = join(ROOT, 'website', 'dist');

const POLICY = join(ROOT, 'docs', 'privacy.md');
const EXTENSION = join(ROOT, 'packages', 'extension', 'src');
const ASSETS = join(ROOT, 'store', 'assets');

export const FILES = [
  'favicon.png',
  'index.html',
  'logo-mark.png',
  'privacy.html',
  'screenshot-block.png',
  'styles.css',
] as const;

/** The body of the home page. */
export function indexBody(): string {
  return `      <h1>Read the story, not the wall.</h1>
      <p class="lede">
        Detour stops a page that walls a story behind an ad blocker, a paywall, a sign-in, a
        region check, or an age check, and shows the same story on a publisher that does not.
      </p>
      <p class="status">In preparation for the Chrome Web Store. The source is on GitHub.</p>
      <img
        class="shot"
        src="screenshot-block.png"
        alt="The Detour block page: the story, the two walls of the site, and four publishers that carry it."
        width="1280"
        height="800"
      />

      <h2>What it does</h2>
      <ul>
        <li>Stops the walled page before it draws, and names the walls that the site uses.</li>
        <li>Finds the same story on publishers that do not wall it.</li>
        <li>Opens the result you pick, or the site itself, for the tab or once.</li>
        <li>Keeps the list and the last answers on the device, so the next page is fast.</li>
        <li>Lets you turn a wall type off when you do not want it to stop a page.</li>
      </ul>

      <h2>What leaves the browser</h2>
      <p>
        When Detour stops a page, it sends the address and the title of that page to one backend,
        which looks for the same story. It sends nothing else. The
        <a href="privacy.html">privacy policy</a> states what the service keeps.
      </p>

      <h2>The list</h2>
      <p>
        The publishers and their walls live in a separate repository, so a wall can be added or
        removed without an extension update. The extension reads the list from the backend and
        keeps a copy for the next start.
      </p>`;
}

/**
 * The policy without its front matter and its own title. The page carries the
 * title, so the body must not add a second one.
 */
export function policyMarkdown(source: string): string {
  return source
    .replace(/^---\n[\s\S]*?\n---\n+/, '')
    .replace(/^# .*\n+/, '')
    .trim();
}

/** The policy as the HTML of one article. */
export function policyBody(source: string): string {
  // Marked returns a string when `async` is false.
  return marked.parse(policyMarkdown(source), { async: false }) as string;
}

export type BuiltSite = {
  outDir: string;
  files: readonly string[];
};

/** The whole site: two pages and the four files that they load. */
export async function buildSite(outDir: string = OUT): Promise<BuiltSite> {
  const policy = await readFile(POLICY, 'utf8');

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await writeFile(
    join(outDir, 'index.html'),
    page({
      title: 'Detour — read the story, not the wall',
      description:
        'Detour stops a page that walls a story, behind an ad blocker, a paywall, a sign-in, a region check, or an age check, and shows the same story on a publisher that does not.',
      body: indexBody(),
    }),
  );

  await writeFile(
    join(outDir, 'privacy.html'),
    page({
      title: 'Privacy — Detour',
      description: 'What leaves the browser, what the service keeps, and what Detour does not do.',
      body: `<article class="policy">
        <h1>Privacy</h1>
${policyBody(policy)}
      </article>`,
    }),
  );

  await copyFile(join(ROOT, 'website', 'styles.css'), join(outDir, 'styles.css'));
  await copyFile(join(EXTENSION, 'logo-mark.png'), join(outDir, 'logo-mark.png'));
  await copyFile(join(ASSETS, 'icon-128.png'), join(outDir, 'favicon.png'));
  await copyFile(join(ASSETS, 'screenshot-block.png'), join(outDir, 'screenshot-block.png'));

  return { outDir, files: FILES };
}

async function main(): Promise<void> {
  try {
    const built = await buildSite();

    process.stdout.write(`${built.outDir}\n${built.files.join(', ')}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const invoked = process.argv[1];

if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  await main();
}
