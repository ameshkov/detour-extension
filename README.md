# Detour

Detour is a Chrome extension that stops a visit to a publisher that walls a
story from readers who use an ad blocker, and it shows the same story from
publishers that do not. The extension reads the site list, finds the
alternatives, and shows the block page. A backend server does the search and
serves the list. This repository holds the extension and a dummy backend for
local work. The production backend is a separate service.

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

## Documentation

- [DEVELOPMENT.md](DEVELOPMENT.md) — local setup, every script, and the
  checks.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how a site enters or leaves the list.
- [docs/architecture.md](docs/architecture.md) — the two systems, the storage
  keys, the routes, and the backend contract.
- [docs/brand.md](docs/brand.md) — the mark, the palette, the type, and the
  licence.
- [docs/privacy.md](docs/privacy.md) — what leaves the browser, what a backend
  keeps, and the search provider.
- [docs/list-format.md](docs/list-format.md) — the generated field reference.
