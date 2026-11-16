# Daily Express

- Domain: express.co.uk
- Checked: 2026-11-12
- Page: https://www.express.co.uk/news/royal/2265455/meghan-markle-claims-against-father-comment-carole
- Wall: soft
- Method: A server-side fetch of the site returned HTTP 200 and carried the `adblock` and `Blockthrough` markers. Playwright Chromium with the AdGuard extension loaded the page above and showed no wall.
- Limitation: User-authorized prototype seed. Wall presence, type, and site coverage remain unverified.

The server response named Blockthrough, which supplies ad-blocker walls, and the string `adblock`. With AdGuard enabled the article body was reachable and no overlay appeared. A future check must open the same page without the extension, record what appears, and establish whether the wall covers the whole site or only some sections.
