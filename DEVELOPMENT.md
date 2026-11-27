# Development

## Requirements

- Node.js 26 or later. `.nvmrc` names the same version, so `nvm use` selects it.
- pnpm 11, through `corepack enable`.
- Google Chrome 120 or later, to load the unpacked build.
- The Playwright Chromium build, for the end-to-end flow:
  `pnpm exec playwright install chromium`.

## Install

```sh
pnpm install --frozen-lockfile
```

The lockfile is committed. The install fails on any difference between it and
the manifests.

## The local stack

`pnpm dev` builds the bundled list with the local overlay and starts two
processes in the repository root:

| Process   | Address or output         | What it is                                                        |
| --------- | ------------------------- | ----------------------------------------------------------------- |
| Server    | `http://127.0.0.1:8787`   | `dev/dummy-server.ts`: the backend contract and the fixture pages |
| Extension | `packages/extension/dist` | esbuild in watch mode, with the local backend                     |

The two commands are:

```sh
pnpm exec tsx dev/dummy-server.ts
pnpm --filter @detour/extension watch:dev
```

Both print to that terminal. A process that exits stops the other, and Ctrl-C
stops both.

The development build writes `http://127.0.0.1:8787` as its backend origin.
The dummy server answers the list, the alternatives, the signed images, the
two popup pages, and the fixture articles on that one origin.

The development build writes a `.js.map` file beside each bundle, and the last
line of the bundle names it. Chrome reads a map only while DevTools is open, so
a page does not parse one when it loads. An inline map, which the build wrote
before, made every popup open parse several megabytes. The release build writes
no map, and the store package carries none.

If port 8787 is not free, move the server and the build together:

```sh
DETOUR_API_BASE=http://127.0.0.1:9000 DETOUR_PORT=9000 pnpm dev
```

## Set the backend URL

The build reads `DETOUR_API_BASE`. The value is one origin with no path, no
query, and no credentials.

```sh
DETOUR_API_BASE=https://api.example.com pnpm build
DETOUR_API_BASE=http://127.0.0.1:9000 pnpm build:dev
```

The default release origin is `https://detour-api.meshkov.info`. The default
development origin is `http://127.0.0.1:8787`.

The build writes the origin into `API_BASE` in every bundle. It also adds the
origin to `host_permissions` in the manifest that it writes. The broad
`*://*/*` rule already covers the origin, and the explicit entry records the
server that this build uses.

The value takes effect only at build time. A running extension keeps the
origin that its bundle carries, so rebuild and reload the extension after you
change the value.

## Load the extension

1. Run `pnpm dev`.
2. Open `chrome://extensions` and turn on Developer mode.
3. Choose Load unpacked and select `packages/extension/dist`.
4. Open http://127.0.0.1:8787/walled/nvidia-custom-silicon.

A press of Reload on the extension card runs the new bundle.

The development build keeps the `key` of the manifest, so the card shows the id
`jcncblagncbpbamfnekhdkomffdpehpk`. A release build drops the key, because the
store refuses a package that carries one. Without a key, Chrome derives the id
of an unpacked build from the absolute path of its folder. A release build in
`dist` shows a different id for that reason. It cannot read the settings and the
allowances that the development id stored.

Run `pnpm dev` or `pnpm build:dev` again after `pnpm build`, `pnpm store:pack`,
or `pnpm store:capture` to restore the development id. If you move the folder,
Chrome derives a different id again. The backend allows the development id and
the store id, and no other id.

## Debug the extension

A local run needs the development build. The release build drops the manifest
key, so an unpacked release build takes an id from its folder, and the backend
refuses that id with 403. The build prints the id that it wrote:

```text
extension id: jcncblagncbpbamfnekhdkomffdpehpk (from the manifest key)
```

To reproduce a real page against the live backend, build the development
extension and name that backend:

```sh
DETOUR_API_BASE=https://detour-api.meshkov.info pnpm build:dev
```

Reload the extension card, then open the article. To work without the network,
run `pnpm dev` and open a fixture page instead.

Each context has its own console:

- The block page and the options page are normal pages. Open DevTools on the
  tab and read the Network panel for `/v1/alternatives`.
- The service worker stops when it is idle. On `chrome://extensions`, press
  `service worker` under Inspect views, then read the console and
  `chrome.storage`.
- The popup closes when it loses focus. Right-click it and choose Inspect to
  keep its console open.

A 403 from the backend means that the server refused the caller origin. The
origin carries the id of the loaded build, so compare the id line of the build
output with the id on the extension card.

## The cache

The extension keeps three things between visits: the list, the answers that the
block page found, and the reads of the stopped pages. The options page holds one
section that drops all three. Open it from the popup's `Settings` row, press
`Clear cache`, and confirm. The page reports how many entries the worker
removed.

Clearing the cache is what makes a fixture scenario run again: a second visit to
a blocked page renders the stored answer and asks the backend for nothing. The
settings and the allowances stay.

## Fixture pages

The dummy server serves every page of a local run.

| Page                                        | What it shows                                    |
| ------------------------------------------- | ------------------------------------------------ |
| `/walled/nvidia-custom-silicon`             | A listed article with alternatives               |
| `/walled/empty-state`                       | A listed article with no answer                  |
| `/walled/slow`                              | A listed article whose answer waits five seconds |
| `/walled/fail`                              | A listed article whose answer fails with 503     |
| `/open/article`                             | An unlisted page that loads                      |
| `/walled/redirect-to-open`                  | A listed page that refreshes to an unlisted host |
| `/images/preview.png`, `/images/source.png` | The two images                                   |

The dev overlay in `sites/sites.dev.yaml` lists `127.0.0.1` under `/walled/*`,
with an ad-blocker wall and a metered paywall. The default settings stop the
ad-blocker wall, so the fixture stops and the block page shows both pills.
Untick `Ad blocker` on the settings page, for the hard and the soft type, and
the same page loads, because the paywall is not ticked. The overlay is a
development aid and it never enters the release list.

A blocked page caches its answer for 24 hours, so the second visit to
`/walled/slow` or `/walled/fail` renders at once. Clear the cache in the
options page between runs, and the page asks again.

## The dummy server

`pnpm dummy-server` starts the server without the extension watch. Three flags
change what it does:

```sh
pnpm dummy-server                      # 127.0.0.1:8787, the slow page waits 5 s
pnpm dummy-server --port 9000          # another port
pnpm dummy-server --delay 12000        # the slow page waits twelve seconds
pnpm dummy-server --fail               # every alternatives answer answers 503
```

`--fail` covers the whole server, so `/walled/nvidia-custom-silicon` fails too
and the extension shows its failure state on the page it uses for every other
check. `--delay` and `--fail` describe the run at startup.

It answers these routes:

| Route                   | Answer                                            |
| ----------------------- | ------------------------------------------------- |
| `GET /v1/list`          | The bundled list, with an `ETag` of the body      |
| `POST /v1/alternatives` | Four saved results, an empty answer, or a failure |
| `GET /v1/img`           | A signed image proxy                              |
| `GET /`                 | A short page about the server                     |
| `GET /privacy`          | A short local privacy page                        |

The alternatives answer names the provider `dummy`. A URL whose path ends with
`/empty-state`, or a title that carries `no alternatives`, answers an empty
list. A URL whose path ends with `/slow` waits, and one whose path ends with
`/fail` answers 503 `{ "error": "search_failed" }`. The page URL is the whole
switch, so one server covers every state without a restart.

The image route signs a source URL with `HMAC-SHA256` and a fixed local key,
`local-development-only-key`. The signature is the first 16 lowercase
hexadecimal characters, the same rule that a production backend uses. A
missing source answers 400, a wrong signature answers 403, and a source that
is not an image answers 415.

The list comes from `packages/extension/src/sites.json`. Run
`pnpm list:build` first if the file is missing. The `ETag` is the SHA-256 of
the served body, the same value that names the list in a report.

The server reads its own origin from its port, so every image link and every
page link points at the port that the server listens on.

## Tests

```sh
pnpm test
pnpm test:e2e
```

`pnpm test` builds the release list and runs Vitest. The dummy server test
starts the server on a free port and reads real HTTP answers.

`pnpm test:e2e` builds the development extension and runs
`e2e/extension.spec.ts` against the unpacked build in a temporary Chromium
profile. The behaviours themselves are written in [qa/README.md](qa/README.md),
which tags each one with the case that covers it; the ones without a case are
walked by hand with [docs/manual-testing.md](docs/manual-testing.md). The run starts the dummy server on `http://127.0.0.1:8787`. The
profile passes `--host-resolver-rules=MAP forbes.test 127.0.0.1`, so the
unlisted host case reaches the same server.

If port 8787 is not free, move the run and the build together:

```sh
DETOUR_API_BASE=http://127.0.0.1:9000 E2E_PORT=9000 pnpm test:e2e
```

### The popup

The popup is a `chrome.action` surface: pressing the icon opens a window that
is not a tab, so Playwright's context does not list it as a page, and the
Playwright guide falls back to opening `popup.html` in a tab. That fallback
loses the one thing the popup depends on — the active tab it answers for — so
the run gets the real window instead.

`openNativePopup` in `e2e/fixtures.ts` asks the service worker for the popup
(`chrome.action.openPopup()`), then attaches a second Playwright client over
the browser's DevTools port (`--remote-debugging-port`, chosen per run). Chrome
lists the popup window as a page on that port, so locators, assertions, and
screenshots reach it. The popup paints the state of the page in front of the
reader, and a route press moves that page and closes the popup, which is what a
reader does.

`openPopupOver` opens `popup.html` in a background tab of the page's window
instead, for the one case a popup window cannot serve: a document that survives
a reload. The switch case uses it to check that the stored setting is what a
reload paints.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm docs:check
pnpm check
```

`pnpm check` runs the list build, the type check, the lint, the format check,
the document checks, and the tests.

## Release

`store/` holds everything that the Chrome Web Store takes. The listing text is
`store/meta/listing.json`, and `pnpm store:sheet` writes the sheet that a person
pastes into the dashboard.

```sh
pnpm icons           # the mark and the eight toolbar icons
pnpm site:build      # the website and its privacy page
pnpm store:capture   # the images of the listing, from the local fixtures
pnpm store:shot --live=<url>   # one real article in the block page and popup shots
pnpm store:pack      # the release build and store/dist/detour-<version>.zip
pnpm store:status    # the version that the store published
pnpm store:publish   # upload the ZIP and stage it
```

The mark and the toolbar icons come from `scripts/icons.ts`. `pnpm icons` redraws them at their
sizes, so a change to the route is one command and not nine exported files.

The upload reads `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and
`CWS_REFRESH_TOKEN`. A local run takes them from the environment, and the
workflow takes them from the `chrome-web-store` environment.
[store/README.md](store/README.md) has the setup and the failure modes.

## Documents

`pnpm docs:check` checks the links and the `pnpm` commands.

The list reference lives in `detour-list` at `docs/list-format.md`. This
repository copies its artifact, so the reference is not duplicated here.
