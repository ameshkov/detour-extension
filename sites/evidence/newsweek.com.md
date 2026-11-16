# Newsweek

- Domain: newsweek.com
- Checked: 2026-11-12
- Page: https://www.newsweek.com/
- Wall: soft
- Method: A server-side fetch of the page above returned HTTP 200 and carried the `adblock` marker. Playwright Chromium with the AdGuard extension loaded the same page and showed no wall.
- Limitation: User-authorized prototype seed. Wall presence, type, and site coverage remain unverified.

The server response loaded the string `adblock` several times. With AdGuard enabled the home page rendered and no overlay appeared. A future check must open an article without the extension, record what appears, and establish whether the wall covers the whole site or only some sections.
