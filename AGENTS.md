# AGENTS.md

## Table of Contents

- [Project Overview](#project-overview)
- [Technical Context](#technical-context)
- [Project Structure](#project-structure)
- [Build And Test Commands](#build-and-test-commands)
- [Contribution Instructions](#contribution-instructions)
- [Code Guidelines](#code-guidelines)
  - [System Design](#system-design)
  - [Architecture](#architecture)
  - [Code Quality](#code-quality)
  - [Testing](#testing)
  - [Dependency Management](#dependency-management)
  - [Configuration & Documentation](#configuration--documentation)
  - [Other](#other)

## Project Overview

Detour is a Chrome extension that stops a visit to a publisher that walls a
story, and it shows the same story from publishers that do not. A wall is an ad
blocker, a paywall, a registration prompt, a consent dialog, a region check, a
VPN check, or an age check, each hard, soft, or metered. The list records the
walls that a site uses, and the settings choose which walls stop a page. The
extension reads the list, finds the alternatives through one backend origin, and
renders the block page. This repository holds the
extension, the shared list contract, a bundled copy of the site list, and a
local dummy backend. The list itself lives in `detour-list`, and the production
backend is a separate service.

## Technical Context

- **Language/Version**: TypeScript 6.0.3 in strict mode, Node.js 26 or
  later, and pnpm 11 for the workspace. Chrome 120 or later for the extension.
- **Primary Dependencies**: no runtime framework in the extension. esbuild
  builds the bundle. `tldts` provides the registrable domain and `zod` checks
  the served list. `yaml` parses the local overlay at build time. The dummy
  server uses `node:http` and `node:crypto`.
- **Storage**: `chrome.storage.local` and `chrome.storage.session` in the
  extension. The dummy server keeps no store.
- **Testing**: Vitest, `happy-dom` for the extension, and Playwright for the
  end-to-end run. The dummy server test uses a real HTTP socket.
- **Target Platform**: Chrome desktop with Manifest V3. The dummy server runs
  on Node.js.
- **Project Type**: browser extension with an external backend service.
- **Performance Goals**: guard overhead p95 under 20 ms on an unlisted page.
  Block page first paint under 100 ms. Warm alternatives under 150 ms.
- **Constraints**: `*://*/*` host permission, one backend origin fixed at
  build time, a 15-second alternatives deadline, a 5-second list deadline,
  and English only in v1.
- **Scale/Scope**: a prototype. The list targets 100 to 200 sites and the
  audience is small.

## Project Structure

```text
package.json           the scripts, the pinned toolchain, and the shared link
pnpm-workspace.yaml    the package globs and the pnpm build settings
tsconfig.json          strict TypeScript for the root program
playwright.config.ts   the end-to-end run and its dummy server
vitest.config.ts       the test runner
eslint.config.js       the lint rules
.github/workflows/     check.yml gates every change, publish.yml packs a tag and
                       submits a manual run, and pages.yml publishes the site
dev/                   dummy-server.ts, run-dev.ts, and their tests
e2e/                   extension.spec.ts and fixtures.ts
scripts/               check-docs.ts, documents.test.ts, brand.test.ts
scripts/docs/          the link, anchor, and command checks
sites/                 sites.release.json, sites.dev.yaml, build.ts, list-build.ts,
                       sync.ts, and their tests
sites/fixtures/pages/  three saved publisher pages for the metadata reader
docs/                  architecture.md, brand.md, privacy.md
store/                 meta/listing.json, meta/listing.md, assets/, the pack and
                       release tools, their tests, and README.md
website/               layout.ts, styles.css, build.ts, and its tests
packages/shared/       list contract, matching, query cleaner, hash
packages/extension/    manifest.json, the five bundles, the three pages, ui.css,
                       logo-mark.png, the four toolbar icons, the tests, and
                       scripts/build.ts
```

The extension sources sit flat in `packages/extension/src`, with the test
helpers in `src/testing/`.

## Build And Test Commands

- **Install**: `pnpm install --frozen-lockfile`
- **Sync the list artifact from detour-list**: `pnpm list:sync`
- **Build the bundled list**: `pnpm list:build`
- **Build the list with the local overlay**: `pnpm list:build:dev`
- **Build the extension**: `pnpm build`
- **Build against the local dummy server**: `pnpm build:dev`
- **Build against another backend**: `DETOUR_API_BASE=<origin> pnpm build`
- **Start the local stack**: `pnpm dev`
- **Start the dummy server alone**: `pnpm dummy-server`
- **Watch the development build**: `pnpm --filter @detour/extension watch:dev`
- **Test**: `pnpm test`
- **Test the extension alone**: `pnpm --filter @detour/extension test`
- **Test the end-to-end flow**: `pnpm test:e2e`
- **Capture the store images**: `pnpm store:capture`
- **Capture one real page**: `pnpm store:shot --live=<url>`
- **Build the website**: `pnpm site:build`
- **Pack the store release**: `pnpm store:pack`
- **Write the store listing sheet**: `pnpm store:sheet`
- **Read the store status**: `pnpm store:status`
- **Upload and publish**: `pnpm store:publish`, and `pnpm store:publish --mode=live`
- **Install the end-to-end browser**: `pnpm exec playwright install chromium`
- **Type check**: `pnpm typecheck`
- **Type check the extension**: `pnpm --filter @detour/extension typecheck`
- **Lint**: `pnpm lint`
- **Fix lint**: `pnpm lint:fix`
- **Check formatting**: `pnpm format:check`
- **Fix formatting**: `pnpm format:fix`
- **Check the documents**: `pnpm docs:check`
- **Run every gate**: `pnpm check`

## Contribution Instructions

- You MUST verify every change with the project gates. Run `pnpm check` before
  you report a task as done.
- You MUST update the tests for changed behavior. Write the test first, watch
  it fail, then write the code.
- You MUST run `pnpm test` and make every test pass.
- You MUST update the document that a change touches, in the same pull request.
  A change to behavior, a command, an endpoint, a storage key, a user-visible
  string, or data handling updates its document.
- You MUST NOT edit `sites/sites.release.json` by hand. Run `pnpm list:sync`,
  then `pnpm list:build`, and commit both the artifact copy and the build.
- You MUST make a list change in `detour-list`. This repository owns no
  editorial data, and its `CONTRIBUTING.md` points there.
- You MUST update the Project Structure section of this file when the
  structure changes.
- If a task asks for a refactor or a new convention, add the rule to the
  matching Code Guidelines section of this file.
- After a task, check the code against the Code Guidelines in this file.
- For a document-only task, still run the lint and the format check.

## Code Guidelines

### System Design

The extension runs in a sandbox with a small API surface:

- Request only the permissions you need. `*://*/*` is the one broad permission
  and the store listing gives one purpose for it. Do not add another
  permission without a written reason.
- Keep the bundle small. No UI framework. esbuild only. Every dependency slows
  the browser start.
- Separate the contexts. The guard decides and stops the load. The service
  worker owns the list, the allowances, and the navigation. The block page
  owns presentation. A content script never holds business logic.
- The service worker stops at any time. Keep state in `chrome.storage`, never
  in a module variable. Treat every message as the first one.
- Use message passing between contexts. Never share mutable state.
- Two writers. The service worker writes every storage key except
  `alt:<sha256(url)>`. The block page writes that one key, and only a finished
  backend answer. The reader's `clearCache` is the one removal: the service
  worker drops `list`, every `alt:` key, and every `meta:` key, and it never
  writes an `alt:` entry. The settings, the allowances, and the tab records
  stay.
- Fail open. A guard error, a timeout, a missing list, or a `disabled` list
  lets the page load.
- Design for updates. The list carries a storage version, and an envelope of
  another version is discarded. The list identifier is the SHA-256 of the served
  body, which is also the ETag that a backend publishes. The settings fall back per
  field. Both caches age out by timestamp.
- The backend origin is a build value. Do not read it from a page, from
  storage, or from the network at run time.

The dummy server follows these rules:

- One handler per route. The handler validates the request and returns a
  status and a body.
- Keep the fixtures in code. A local run must need no file and no account.
- The path of the article is the scenario switch, as `/empty-state` already is:
  `/slow` waits, and `/fail` answers 503. A scenario is a URL, never a restart
  of the server and never a stored mode.
- A flag of the run changes the whole server: `--delay` moves the wait of the
  slow scenario, and `--fail` fails every alternatives answer.
- Never put a secret in code. The local signing key is a fixed development
  placeholder, and it is not a production secret.

### Architecture

- **Separation of Concerns** — each module handles one aspect of the system.
- **Single Responsibility Principle** — every file and function has one reason
  to change.
- **Dependency Direction** — dependencies point to the shared package, never
  from it.
- **Explicit Boundaries** — the message contract and the HTTP contract are
  intentional. Do not reach into another context.
- **Data Flow Clarity** — the list becomes a decision, the URL becomes a cache
  key, and the cache key becomes one answer for every reader.
- **Minimize Coupling, Maximize Cohesion** — a module is self-contained and
  talks through a narrow interface.
- **Make Invalid States Impossible** — the schema and the types reject a bad
  list entry and a bad URL.
- **Observability Built-in** — the guard logs behind `DEV`.
- **Keep It Boring** — plain TypeScript, no framework, no generator.

The extension has five surfaces, from the browser event to the screen:

```text
guard (guard-entry.ts)  →  service worker (background.ts)  →  block page (block-entry.ts)
                                        ↓
                                  chrome.storage  ←  popup (popup-entry.ts)
                                                  ←  options page (options-entry.ts)
```

- The guard answers one question and stops one load. It keeps one
  module-level marker for the document, and it draws at most one anchor, only
  for a failed navigation that carries `blockPageUrl`.
- The service worker owns the list, the allowances, the one-time passes, the
  metadata cache, the stopped-tab capability record, the tab navigation, and the
  toolbar icon and badge.
  It writes every storage key except `alt:<sha256(url)>`. It records
  `sha256(url)` under `capability:<tabId>` in the session store before the
  block navigation and prunes it on tab close. It answers metadata,
  alternatives, and an allowance only for the sender's own tab and the URL it
  recorded, and it writes the pass that opens one page once. It stops a page
  only when one of the entry's walls is a wall that the reader chose, so a site
  whose walls are all switched off loads.
- The block page renders state and sends messages. It never reads a page, and
  it writes only `alt:<sha256(url)>`, from a finished backend answer. It reads
  the list, the settings, and its `alt:` entry from storage directly. It runs
  only in a top-level document. Its four states, `loading`, `results`,
  `empty`, and `error`, are the whole state set. It names the site, counts its
  walls, and draws one pill per wall. The judgement sentence appears only for
  an ad-blocker wall.
- The popup renders the state, the verdict on the page of the active tab with
  the pills of its walls and the action that fits it, the pause, and the
  settings.
- The options page lists every allowance, holds the walls table and the two
  reading settings, and clears the cache after a confirmation. The table has
  one category per row and one type per column; a metered cell outside the
  paywall row has no box.
- The popup and the options page read storage directly and write only through
  a message.
- The message contract is the only interface between the contexts. The service
  worker adds `lang: 'en'` to the alternatives request and checks the URL
  against the digest that the sender's tab recorded. Result images are the one
  direct backend request: a row loads `GET /v1/img` with the signed link in
  the answer.

The backend contract has three layers:

```text
route handler  →  pure function (query, fixtures)  →  adapter (fetch)
```

- A route handler validates the request and returns a status and a body.
- A pure function takes plain values and returns plain values. It reads no
  secret and makes no network call.
- An adapter wraps one external call and one timeout. A failure returns a
  value, not a thrown error.
- The production backend is outside this repository. Do not add its search,
  cache, or budget code here. The dummy server answers saved results.

**Shared code.** `packages/shared` holds the served list contract, the host and
path matching, the query cleaner, and the SHA-256 helper that keys both caches
and names the list. Both systems import it. It imports neither of them.

### Code Quality

- TypeScript strict. No `any` without a comment that gives the reason.
- One exported function per purpose. Split a file that passes 200 lines.
- A stylesheet is exempt from the 200-line rule: `ui.css` is one cascade over
  the three pages, and a split would add an import or a second `<link>` to a
  page with a 100 ms first-paint budget.
- Errors: the dummy server returns a status and a JSON body. The extension
  catches at the boundary and falls back. Never throw across a message
  boundary or an HTTP response.
- Naming: files in kebab-case, types in PascalCase, functions in camelCase.
  The message types and the storage keys live in one constants module per
  package.
- User-visible text lives in one copy module. Do not copy a string into a
  second place.
- A comment explains why. The code explains what.

### Testing

- Vitest. Test files sit next to the code as `*.test.ts`.
- One runner. The root Vitest runs the shared package, the list build, the
  scripts, the dummy server, and the extension. It uses the node environment,
  and a test that needs a document starts with
  `// @vitest-environment happy-dom`.
- The fake `chrome.*` lives in `packages/extension/src/testing/fake-chrome.ts`.
  A page test retires its run with `stopBlockPage` in `afterEach`, so an answer
  or a note timer of the old run cannot paint the next shell.
- The metadata reader runs against the saved pages in `sites/fixtures/pages/`.
- The dummy server test starts the server on a free port, reads real HTTP
  answers, and closes it in `afterAll`. Never call a remote service in a test.
- The end-to-end run is Playwright, and `pnpm check` never starts the browser.
  `pnpm test:e2e` builds the development extension and drives the unpacked
  build against the dummy server and a temporary Chromium profile. Every case
  gets its own page and its own tab. Before a case runs, a readiness page on a
  listed URL must reach the block page, and the run tries it again when the
  first navigation fails open, so a case never meets a cold worker. `E2E_PORT`
  moves the run to a free port, and the build must then name the same origin in
  `DETOUR_API_BASE`.
- Three behaviors the product promises are unit tests: a framed document draws
  nothing and sends nothing, an `Open <site> anyway` press stores the tab
  allowance before the tab moves, and a `Just once` press writes a pass that
  opens one navigation and no allowance.
- Every behavior that the product promises gets a test that names the
  behavior. A bug fix starts with a test that fails for the stated reason.

### Dependency Management

- Pin exact versions. No `^` or `~`.
- Vanilla first. The extension declares one dependency, `@detour/shared`, and
  takes `tldts` and `zod` through it. The dummy server uses the standard
  library.
- `@playwright/test` is a root development dependency for the end-to-end run
  only. It stays out of the extension bundle.
- Reputable, maintained packages only. Do not add a niche package.
- Justify every addition in the change description.
- Take the latest stable version from the registry, not from memory.
- **Rationale**: fewer dependencies reduce the security surface, the bundle
  size, and the maintenance cost.

### Configuration & Documentation

Extension configuration:

- One manifest, `packages/extension/manifest.json`. It declares Manifest V3,
  the permissions `["alarms", "storage"]`, and no `tabs`. `chrome.tabs.update`,
  `chrome.tabs.onRemoved`, and `sender.tab.openerTabId` need no permission,
  and `*://*/*` covers page access.
- The manifest carries `action` with `popup.html`, `default_title` `Detour`,
  and `default_icon`, `options_ui` with `options.html` and `open_in_tab`
  `true`, and the `icons` set `icon-16.png` to `icon-128.png`. The action sets a
  second, gray icon set while Detour stops no page.
- The three pages share one stylesheet, `ui.css`, and one page mark,
  `src/logo-mark.png`. The build copies both beside the bundles, with the four
  toolbar icons `src/icon-16.png` to `src/icon-128.png` and the gray set
  `src/icon-off-16.png` to `src/icon-off-128.png`.
- The popup is a fixed 340 pixels wide, so the `max-width: 520px` block of
  `ui.css` always matches it. A narrow-screen rule that names a shared control
  is scoped to the block page's `[data-role='actions']`, or it widens the popup
  window past its frame.
- The manifest carries one fixed public key, which gives the development id
  `jcncblagncbpbamfnekhdkomffdpehpk`, and no private key is in the repository.
  A store upload refuses a package that carries `key`, so the release build
  drops the field, and the store grants the item its own id and key. After the
  first upload, copy the store key into the manifest if the unpacked build
  should share the published id.
- The build reads `DETOUR_API_BASE`. The value is one origin with no path, no
  query, and no credentials. The release default is
  `https://detour-api.meshkov.info`, and the development default is
  `http://127.0.0.1:8787`.
- The build defines `API_BASE` and `DEV`. The release build drops every
  `[detour]` log line. The development build writes linked source maps beside
  the bundles, and the release build writes none, so a page load never parses a
  map.
- The build adds the backend origin to the manifest `host_permissions`. The
  broad page permission already covers it, and the explicit entry records the
  server that this build uses.
- Extension settings live in `chrome.storage.local` under one key: `enabled`,
  `autoOpenBest`, `imagesEnabled`, and `walls`. `walls` groups the chosen wall
  categories by the type that presents them, so the reader picks a type first
  and then its categories. The default stops the `adblock` category of the
  `hard` and `soft` types and nothing else.

Dummy server configuration:

- `dev/dummy-server.ts` answers the backend contract on
  `http://127.0.0.1:8787`. `--port` selects another port, `--delay <ms>` sets
  the wait of the `/walled/slow` fixture, and `--fail` fails every
  alternatives answer.
- It serves the fixture pages on the same origin, including `/walled/slow` and
  `/walled/fail`. The local overlay lists `127.0.0.1` under `/walled/*`.
- The list comes from `packages/extension/src/sites.json`, which
  `pnpm list:build` writes. Its ETag is the SHA-256 of the served body.
- The image signing key is the fixed development value
  `local-development-only-key`. It is not a secret and it must not become one.
- It answers every local caller with `Access-Control-Allow-Origin: *`.

Local development configuration:

- `pnpm list:sync` fetches `dist/sites.json` at `master` from the detour-list
  remote into `sites/sites.release.json`. It clones into a temporary directory,
  so a local checkout plays no part and no branch of it can leak into the copy.
  `DETOUR_LIST_REMOTE` names another remote, and `DETOUR_LIST_REF` names a tag
  or a branch instead of `master`.
- `pnpm list:build` validates `sites/sites.release.json`, then writes
  `packages/extension/src/sites.json` and its identifier in `sites-id.ts`.
- `pnpm list:build:dev` also reads `sites/sites.dev.yaml` and appends its
  entries in the shape of the served list.
- `pnpm dev` builds the dev list, starts the dummy server on
  `http://127.0.0.1:8787`, and starts `watch:dev` into
  `packages/extension/dist`. `DETOUR_PORT` moves the server, and
  `DETOUR_API_BASE` must then name the same origin.
- The end-to-end run starts the same dummy server on the same port. Its
  browser profile maps `forbes.test` to `127.0.0.1`. `E2E_PORT` moves the run
  to a free port.

Store configuration:

- `store/` is the one directory of the release. It holds the listing, the images, the
  package, the upload, and their tests. A store value lives nowhere else.
- `store/meta/listing.json` is the source of every dashboard field, and
  `store/meta/listing.md` is generated from it by `pnpm store:sheet`. Both are committed, and a test compares them.
- The ZIP holds exactly the files that the release build writes, with `manifest.json` at
  its root. `pnpm store:pack` refuses a development build, a stray file, and an icon of
  the wrong size.
- The manifest version is the release version. Every upload raises it, because the store
  refuses a version that it already has.
- The store item id is `gjmlbmcaklcbificepnkpenfhelngklo`, `store/release.ts` names it in
  `DEFAULT_ITEM_ID`, and `CWS_ITEM_ID` overrides it. The id is not a secret. The publisher
  id, the OAuth client, and the refresh token come from the `chrome-web-store`
  environment. Never commit one.
- A `v*` tag packs and keeps the ZIP. A manual run submits it from the environment that
  asks a reviewer for approval.
- `pnpm store:capture` draws the images from the real pages and the local fixtures. The
  PNGs stay in `store/assets`.

Website configuration:

- `website/` is the public page of the extension. `pnpm site:build` writes `website/dist`,
  and the pages workflow publishes it to GitHub Pages.
- The privacy page renders `docs/privacy.md`, so the policy has one source and the site
  cannot state something that the document does not.
- Every address of the site is relative, because Pages serves it from a subdirectory.

Documents and their update triggers:

| Document               | Update when                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `README.md`            | Behavior, the backend URL, or install steps change                |
| `DEVELOPMENT.md`       | A script, an environment value, the build, or the release changes |
| `CONTRIBUTING.md`      | How to contribute to the extension changes                        |
| `docs/architecture.md` | The architecture, a storage key, a route, or a flow changes       |
| `docs/privacy.md`      | Data that leaves the device, retention, or the provider changes   |
| `docs/brand.md`        | The mark, the palette, or the license changes                     |
| `store/README.md`      | The listing, the images, or the release steps change              |
| `AGENTS.md`            | The structure, a command, or a convention changes                 |

### Other

- The list is editorial data that lives in `detour-list`, not code. Do not add
  a publisher here and do not edit the artifact copy. Run `pnpm list:sync`, then
  `pnpm list:build`, and commit both.
- The copy is the fallback for a worker with no stored list. A backend serves
  the current list at `GET /v1/list`, so the copy may age between releases.
- `sites/sites.dev.yaml` is the local overlay, and no publisher enters it. Only
  `pnpm list:build:dev` reads it; `pnpm list:build` writes the release list
  alone.
- The block page states the practice in plain words. Do not soften it and do
  not moralize.
