# Detour

Detour is a Chrome extension that stops a visit to a publisher that puts a
wall in front of a story, and it shows the same story from publishers that do
not. The list names every wall that a page carries: an ad-blocker wall, a
paywall, a registration prompt, a consent dialog, a region check, a VPN check,
or an age check, each with a hard, soft, or metered type. The settings page
holds a table of the walls that stop a page, one category per row and one type
per column. The extension reads the site list, finds the alternatives, and
shows the block page. The toolbar icon turns gray while Detour is off or
paused, and carries a badge on a site that the list names. A backend server
does the search and serves the list.
This repository holds the extension and a dummy backend for local work. The
production backend is a separate service.

## Status

The extension is complete: the guard, the service worker, the block page, the
popup, and the options page. It talks to one backend origin. You set that
origin when you build the extension. The repository also carries a dummy
server that answers the same contract, so local work needs no remote service
and no account.

## Try the extension

1. Run `pnpm install --frozen-lockfile`.
2. Run `pnpm dev`.
3. Open `chrome://extensions` and turn on Developer mode.
4. Choose Load unpacked and select `packages/extension/dist`.
5. Open http://127.0.0.1:8787/walled/nvidia-custom-silicon.

The block page appears in place of the article, with the alternatives for it.
The page at http://127.0.0.1:8787/open/article loads unchanged.

Two more local pages show the other states of the block page:
http://127.0.0.1:8787/walled/slow waits five seconds for the answer, and
http://127.0.0.1:8787/walled/fail answers with a failure. The options page
clears the cached list, answers, and page reads, so a scenario runs again.
[DEVELOPMENT.md](DEVELOPMENT.md) has the details and the tests.

## Backend URL

The build reads the `DETOUR_API_BASE` environment value and writes it into
the extension bundles. The value is one origin with no path.

```sh
DETOUR_API_BASE=https://api.example.com pnpm build
```

A development build uses the dummy server by default:
`http://127.0.0.1:8787`.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
```

## Website

The public page and the privacy policy are at
<https://ameshkov.github.io/detour-extension/>. The site lives in `website/`, and
`pnpm site:build` writes it from `docs/privacy.md` and the store images.

## Publish

The Chrome Web Store release lives in `store/`. One command packs the release
build, and one uploads and publishes it.

```sh
pnpm store:pack
pnpm store:publish --mode=live
```

[store/README.md](store/README.md) holds the listing text, the images, the
secrets, and the workflow.

## Documentation

- [DEVELOPMENT.md](DEVELOPMENT.md) — local setup, every script, and the
  checks.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to work on the extension and where
  a site enters or leaves the list.
- [docs/architecture.md](docs/architecture.md) — the two systems, the storage
  keys, the routes, and the backend contract.
- [docs/brand.md](docs/brand.md) — the mark, the palette, the type, and the
  licence.
- [docs/privacy.md](docs/privacy.md) — what leaves the browser, what a backend
  keeps, and the search provider.
- [store/README.md](store/README.md) — the store listing, the images, and the
  release.
