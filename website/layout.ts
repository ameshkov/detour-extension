export type Page = {
  title: string;
  description: string;
  body: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * The shell of every page: one head, one header, one footer. The site is
 * served from a subdirectory, so every address is relative.
 */
export function page(input: Page): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <meta name="description" content="${escapeHtml(input.description)}" />
    <meta name="color-scheme" content="light" />
    <link rel="icon" href="favicon.png" type="image/png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header>
      <a class="brand" href="index.html">
        <span class="tile"><img src="logo-mark.png" alt="" /></span>
        Detour
      </a>
      <nav>
        <a href="privacy.html">Privacy</a>
        <a href="https://github.com/ameshkov/detour-extension">GitHub</a>
      </nav>
    </header>
    <main>
${input.body}
    </main>
    <footer>
      <p>Detour stops a walled story and shows it elsewhere. It removes no wall and unlocks no paywall.</p>
    </footer>
  </body>
</html>
`;
}
