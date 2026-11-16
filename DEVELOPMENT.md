# Development

## Requirements

- Node.js 22.13 or later.
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

`pnpm dev` builds the local list and starts two processes in the repository
root:

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

## Fixture pages

The dummy server serves every page of a local run.

| Page                                        | What it shows                                    |
| ------------------------------------------- | ------------------------------------------------ |
| `/walled/nvidia-custom-silicon`             | A listed article with alternatives               |
| `/walled/empty-state`                       | A listed article with no answer                  |
| `/open/article`                             | An unlisted page that loads                      |
| `/walled/redirect-to-open`                  | A listed page that refreshes to an unlisted host |
| `/images/preview.png`, `/images/source.png` | The two images                                   |

The dev overlay in `sites/sites.dev.yaml` lists `127.0.0.1` under `/walled/*`.
The overlay is a development aid and it never enters the release list.

## The dummy server

`pnpm dummy-server` starts the server without the extension watch. Use
`--port` to select another port.

```sh
pnpm dummy-server --port 9000
```

It answers these routes:

| Route                   | Answer                                 |
| ----------------------- | -------------------------------------- |
| `GET /v1/list`          | The generated list, with an `ETag`     |
| `POST /v1/alternatives` | Four saved results, or an empty answer |
| `GET /v1/img`           | A signed image proxy                   |
| `GET /`                 | A short page about the server          |
| `GET /privacy`          | A short local privacy page             |

The alternatives answer names the provider `dummy`. A URL whose path ends with
`/empty-state`, or a title that carries `no alternatives`, answers an empty
list.

The image route signs a source URL with `HMAC-SHA256` and a fixed local key,
`local-development-only-key`. The signature is the first 16 lowercase
hexadecimal characters, the same rule that a production backend uses. A
missing source answers 400, a wrong signature answers 403, and a source that
is not an image answers 415.

The list comes from `packages/extension/src/sites.json`. Run
`pnpm list:build` first if the file is missing.

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
profile. The run starts the dummy server on `http://127.0.0.1:8787`. The
profile passes `--host-resolver-rules=MAP forbes.test 127.0.0.1`, so the
unlisted host case reaches the same server.

If port 8787 is not free, move the run and the build together:

```sh
DETOUR_API_BASE=http://127.0.0.1:9000 E2E_PORT=9000 pnpm test:e2e
```

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

## Documents

`pnpm docs:check` checks the links, the `pnpm` commands, and the generated
list reference.

`pnpm docs:generate` writes `docs/list-format.md` from the schema. Never edit
that file by hand.
