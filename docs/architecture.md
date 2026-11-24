# Architecture

Detour is two systems. The extension runs in Chrome and stops a load. A
backend server finds the alternatives. This repository holds the extension,
the shared package, and a dummy backend. It does not hold the production
backend.

## Two systems

```text
extension  →  packages/shared  ←  dummy server
```

`packages/shared` holds the served list contract, the host and path matching,
the query cleaner, and the SHA-256 helper that keys the caches and names the
list. The extension and the dummy server import it. It imports neither of
them, so the dependency points at the shared package.

The production backend is outside this repository. It implements the
[backend contract](#backend-contract). `dev/dummy-server.ts` is a local
implementation of that contract.

## Extension

The extension has three contexts and three pages. The guard decides and stops
the load. The service worker owns the list, the allowances, the metadata, and
the navigation. The block page owns presentation, and the popup and the
options page show what the service worker stored.

| Surface        | Responsibility                                                                | Files                                                                                                                                                         | Talks to                |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Guard          | Decide fast, stop the load, report the URL.                                   | `guard.ts`, `guard-entry.ts`                                                                                                                                  | Service worker          |
| Service worker | Own the list, the allowances, the metadata, and the navigation.               | `background.ts`, `service-worker.ts`, `handlers.ts`, `allowance-handlers.ts`, `alternatives-handler.ts`, `capabilities.ts`, `refresh.ts`, `metadata-fetch.ts` | Storage, backend API    |
| Block page     | Name the site and its walls, show the source, load the alternatives.          | `block.html`, `block-entry.ts`, `block-page.ts`                                                                                                               | Storage, service worker |
| Popup          | Show the state, the page's verdict and walls, the pause, and settings.        | `popup.html`, `popup-entry.ts`, `popup.ts`, `popup-sections.ts`                                                                                               | Storage, service worker |
| Options page   | List the allowances, set the walls and the reading settings, clear the cache. | `options.html`, `options-entry.ts`, `options.ts`                                                                                                              | Storage, service worker |

The source files sit in `packages/extension/src`. The guard keeps one
module-level marker for the document and draws at most one anchor, only for a
failed navigation. It holds no other state. The service worker writes every
storage key except `alt:<sha256(url)>`, and the block page writes that one.
The block page reads `list`, `settings`, and its `alt:` entry from storage
directly, and it reaches the backend only through the service worker. A page
renders state and sends messages, and it never reads a page.

The popup and the options page read storage directly, and every write goes
through a message. The popup's header carries the switch of
`settings.enabled`, and a press writes all three settings through
`setSettings`.

### Manifest and build

`packages/extension/manifest.json` is the one manifest. It declares Manifest
V3, the permissions `["alarms", "storage"]`, one service worker at
`background.js`, one content script at `guard.js` on `*://*/*` that runs at
`document_start` in the top frame, and `block.html` as a web accessible
resource. It carries `action` with `popup.html` and `default_icon`,
`options_ui` with `options.html`, and the `icons` set `icon-16.png` to
`icon-128.png`.

The build copies the manifest and adds the backend origin to
`host_permissions`. The manifest carries `*://*/*`, which already covers the
origin. The explicit entry records the server that this build uses and keeps
the permission if the broad rule is narrowed.

The extension does not request `tabs`. `chrome.tabs.update`,
`chrome.tabs.onRemoved`, and `sender.tab.openerTabId` work without it, and
`*://*/*` already gives the guard its page access.

The manifest carries one fixed public key, and no private key is in the
repository. The SHA-256 of that key, with each digit mapped to the letters `a`
to `p`, gives the extension id `jcncblagncbpbamfnekhdkomffdpehpk`. That key
and id are the provisional development identity. A backend that checks the
caller origin must allow `chrome-extension://` followed by that id.

`pnpm build` writes the release build, and `pnpm build:dev` writes the
development build. Both write `packages/extension/dist`: the bundles
`background.js`, `guard.js`, `block.js`, `popup.js`, and `options.js`, a copy
of the manifest, and a copy of `block.html`, `popup.html`, `options.html`,
`ui.css`, `logo-mark.png`, and the four toolbar icons `icon-16.png`,
`icon-32.png`, `icon-48.png`, and `icon-128.png`.

The build defines two values. `API_BASE` is the backend origin, and `DEV` is
the development flag. `DETOUR_API_BASE` sets `API_BASE`. The release default
is `https://detour-api.meshkov.info`, and the development default is
`http://127.0.0.1:8787`. The release build drops every `[detour]` log line.

### Message contract

The message contract is the only interface between the contexts. Every answer
is `{ ok: true, … }` or `{ ok: false, error }`. The error is `bad_message`,
`missing_tab`, `navigation_failed`, or `unknown_message`, and no handler
throws across the boundary.

| Message            | Request                   | Answer                                                               |
| ------------------ | ------------------------- | -------------------------------------------------------------------- |
| `isBlocked`        | `{ url }`                 | `{ ok: true, blocked, site }`                                        |
| `blocked`          | `{ url }`                 | `{ ok: true, blockPageUrl }` or `{ ok: false, error, blockPageUrl }` |
| `getMeta`          | `{ url }`                 | `{ ok: true, meta }`                                                 |
| `getAlternatives`  | `{ url, title }`          | `{ ok: true, answer }` or `{ ok: false, error }`                     |
| `showAlternatives` | `{ tabId, url }`          | `{ ok: true, blockPageUrl }` or `{ ok: false, error }`               |
| `allow`            | `{ scope, url }`          | `{ ok: true, allowances }`                                           |
| `pass`             | `{ url }`                 | `{ ok: true }`                                                       |
| `revoke`           | `{ scope, host, tabId? }` | `{ ok: true, allowances }`                                           |
| `setSettings`      | `{ settings }`            | `{ ok: true, settings }`                                             |
| `pause`            | `{ until, session }`      | `{ ok: true, pauseUntil, session }`                                  |
| `clearCache`       | none                      | `{ ok: true, cleared }`                                              |

`site` is `{ domain, name, walls }` from the list, or `null`, and each wall is
`{ category, type }`. `meta` is `null`
or `{ title, description }`, and each field is a string or `null`. `answer`
is `null` or the backend's alternatives answer. `scope` is `tab`, `session`,
or `always`. `cleared` is the number of storage keys that `clearCache`
removed. `session` is `true` for the pause that the browser ends, and that
pause carries `until: 0`.

`showAlternatives` is the popup's own request. It takes the tab the popup was
opened from and the page it holds, and the worker refuses both a caller that is
not one of the extension's pages and a tab that has since moved to another
page. It records `capability:<tabId>`, warms the metadata, and moves the tab to
`block.html?u=<url>`, so the reader lands on the page the guard would have
shown. The popup sends it instead of navigating itself, because only the worker
holds the tab and the capability record.

### Guard

The guard hides the document before its first `await`. It sets
`visibility: hidden` with the `important` priority on `documentElement`, so a
publisher rule cannot override the hidden state. It sends `isBlocked` and
waits at most 400 ms, which covers a worker that is still starting. A worker
that never answers costs the rest of that wait, and the page loads.

On `{ blocked: true }` the guard calls `window.stop()` and sends `blocked`.
The service worker records `{ tabId → sha256(url) }` in the session store
before it navigates the tab, so the block page that replaces the stopped
document is the only page allowed to act for that tab and URL. On a false
answer, a rejection, a timeout, or a late answer, the guard removes the rule
and lets the page load. A second run on one document does nothing.

The guard draws one element, and only in one case. When the navigation answer
is `{ ok: false }` and carries a string `blockPageUrl`, the guard restores
visibility and appends one anchor to the page, with that URL and the text
`Open the Detour page`. Every other answer appends nothing.

### Storage

The service worker writes every key below except `alt:<sha256(url)>`. The
block page writes that one, and it writes only a finished backend answer.
`clearCache` breaks the rule in one direction only: the service worker removes
`list`, every `alt:` key, and every `meta:` key at the reader's request, and it
never writes an `alt:` entry. The settings, the allowances, and the tab records
stay.

| Key                  | Store   | Writer         | Lifetime                     |
| -------------------- | ------- | -------------- | ---------------------------- |
| `list`               | local   | service worker | Until the next refresh       |
| `settings`           | local   | service worker | Until the user changes it    |
| `pauseUntil`         | local   | service worker | Until the time passes        |
| `pauseSession`       | session | service worker | Browser restart              |
| `allowAlways`        | local   | service worker | Until the user removes it    |
| `allowSession`       | session | service worker | Browser restart              |
| `allowTabs`          | session | service worker | Tab close                    |
| `capability:<tabId>` | session | service worker | Tab close, or a new block    |
| `pass:<tabId>`       | session | service worker | One navigation, or tab close |
| `meta:<sha256(url)>` | local   | service worker | 7 days, 500 entries          |
| `alt:<sha256(url)>`  | local   | block page     | 24 hours                     |

`settings` holds `enabled`, `autoOpenBest`, `imagesEnabled`, and `walls`, and
its default is `{ enabled: true, autoOpenBest: false, imagesEnabled: true,
walls: { hard: ['adblock'], soft: ['adblock'], metered: [] } }`. `walls` groups
the categories the reader chose by the type that presents them, so one reader
can stop an ad-blocker wall that covers the article and leave a paywall that
replaces it alone.

The decision runs in this order: the extension is enabled, the pause has
passed, the list is not `disabled`, the URL is listed, the tab holds no
one-time pass for this URL, one of the entry's walls is a wall the reader
chose, and no `allowAlways`, `allowSession`, or `allowTabs` entry covers the
host. A site whose walls are all switched off loads, exactly as an unlisted
site does. A tab entry also covers a tab that the entry's tab opened. Closing a
tab removes its entries.

A pass is the one-time counterpart of an allowance. `Just once` in the open
menu sends `pass`, the worker records `pass:<tabId>`, and the guard spends the
record on the next navigation to that URL, so the page opens once and the next
visit meets the wall again. A pass covers one tab and one URL, it is never
listed on the options page, and tab close removes it.

`capability:<tabId>` holds the digest of the URL that one stopped tab was on,
written before the navigation and replaced by the next block in that tab. The
service worker checks the sender's own tab before it answers `getMeta`,
answers `getAlternatives`, or writes an allowance or a pass. A failed
navigation keeps the key, so the guard's fallback link still opens a page whose
requests answer.

`list` holds `{ storageVersion, fetchedAt, listId, list }`. `storageVersion`
is the extension's own storage format, and it is `2`. `listId` is the SHA-256
of the stored list, and a report carries it. A stored envelope with another
`storageVersion`, or without an identifier, is discarded, and the extension
uses the bundled list.

### Metadata

The service worker reads a stopped page once for each URL that the list
carries, and only for the tab that the guard stopped on that URL. A URL that
the list does not carry, a private address, a disabled list, and a caller
without the tab record all answer `null` metadata without a cache read and
without a fetch. The service worker fetches a listed page with
`credentials: 'omit'`, a 4-second deadline, and a 524,288-byte cap. A service
worker has no DOM, so the reader is a regular-expression reader over the text.

The reader answers `{ title, description }`. It reads `og:title` and falls
back to `<title>`, and it reads `og:description` and falls back to
`<meta name="description">`. A successful read is cached under
`meta:<sha256(url)>` for 7 days, with at most 500 entries. A failed read is
remembered in memory for 60 seconds.

The description of the blocked page stays on the device. It never reaches the
backend.

### Refresh

The service worker fetches `GET {API_BASE}/v1/list` on install, on browser
start, and every 6 hours through the `list-refresh` alarm. The fetch has a
5-second deadline, and the schema checks the body. A failed fetch keeps the
stored list, and a worker with no stored list uses the bundled copy.
`disabled: true` stops every block.

### Block page

`block.html` carries one image, the mark inside the header's tile. The source
card and the result rows take their images from the answers and never from
the shell.

The list area carries one of four states in `data-state`: `loading`,
`results`, `empty`, and `error`. Those four values are the whole state set. A
results state renders one `<li>` per alternative: the first one is the hero,
and each later one is a row with its tile. The tile reuses the favicon the
answer sends, in place of the letter tile, and keeps the letter when the answer
carries none, when the favicon fails, or while `imagesEnabled` is off. A row's
image appears only when `imagesEnabled` is on and the answer carries one. A row
holds two lines of text under the tile: the title, then the domain in ink with
the description after it, one middot apart.

The whole row is one link: the title, the domain, the description, and the
image all open the alternative, so the reader aims at the row and not at a
line of text in it. The description takes two lines under the title, and a
phone drops it, so every row keeps the height it needs and no more.

The headline names the site and counts the walls that the list records for it,
the tab carries that name, and a row of pills follows the headline. One pill names one wall: the category in ink, a
middot, and the type in grey. A page that carries an ad-blocker wall adds one
sentence under the pills, and a page that carries another wall alone adds
none, because a paywall, a consent dialog, or an age check is the publisher's
business.

The fallback box holds an editable query and four engine links, in the order
DuckDuckGo, Brave, Google, and Bing. The query is the answer's own query when
it carries one, and otherwise the result of the shared title cleaner over the
metadata title, the URL, and the site name.

At three seconds without an answer the loading area gains `data-slow` and
shows the note, the `Open <site> instead` action, and `Keep waiting`.

The source card at the top names the page the reader tried to open, and it
holds `Open <site> anyway`. That control grants the tab allowance and opens
the site, and its caret opens a menu of the other scopes and `Just once`,
which opens the site without an allowance. The way back to the page sits
beside the page itself, not under the whole list. The menu hangs off the split
control, so the gap above or below it is the sheet's own 6 px, and it opens
above the control when there is no room below. It closes on Escape, on a
second press of the caret, on a press of a scope, and on a press anywhere else
on the page.

The foot of the page is one line: the privacy note and the report link.

The countdown starts when `autoOpenBest` is on and at least one alternative
exists. It counts 3, 2, 1, and then navigates the tab to the first
alternative.

The page sends `{ url, title }` to the service worker, and the service worker
adds the fixed `lang: 'en'` and posts `POST {API_BASE}/v1/alternatives` with
the three fields and a 15-second deadline. The request runs only for a tab
that the worker recorded on that URL. Result images are the one request the
page makes to the backend itself: a row loads the image link from the answer
as it renders. The page caches a finished answer under `alt:<sha256(url)>` for
24 hours, with at most 200 answers. A degraded answer is never stored.

`Report a problem` is a quiet link to
`https://github.com/ameshkov/detour-extension/issues/new`. The body carries the
blocked URL, the list identifier, and the extension version.

The page navigates through two injected functions, so a test drives it without
a browser navigation: `navigate` for this tab and `openTab` for a new one.

### Popup and options page

The popup is 340 px wide. Its header carries the mark tile, the wordmark, the
state, and the switch of `settings.enabled`. Below it is a block about the page
in the tab the popup was opened from: the site and whether the list carries it,
the pills of its walls, and one action. The verdict is a word and a
colour: the site takes the accent when the list carries it and the muted tone
when it does not, so no dot carries the answer. When the list carries the site,
the action is `Show alternatives` and it sends `showAlternatives`; when it does
not, the action is the sentence `If you see a wall here, report it.`, a link
that carries the page, the list identifier, and the extension version into a
prefilled issue. A page that names no site — a browser page, a store page, a
`file:` — hides the block.

Below the block sit two rows: the pause and the settings. Every row answers the
pointer, and so does the header switch. The pause row is a button that unfolds
the five durations, `5 minutes`, `30 minutes`, `1 hour`, `Today`, and `Until the
browser restarts`, and a running pause replaces its label with the time it has
left and a `Resume`. `Today` ends at the next local midnight, and `Until the
browser restarts` writes `pauseSession` instead of a timestamp. The settings row
opens the options page. The footer keeps two links, `How it works` and
`Privacy`, and the popup never grants an allowance.

The options page is 640 px at most. It lists every entry of the three
allowance stores with its scope and its `addedAt` date as a UTC `YYYY-MM-DD`,
and it removes one entry at a time. It also holds the walls table,
whose rows are the seven categories and whose columns are the three types, and
the two reading settings, which are `autoOpenBest` and `imagesEnabled`. A cell
marked as empty cannot be ticked, because only a subscription limits a count.
The table writes the whole settings record through `setSettings`, so a press
keeps the reading settings and the wall choice of every other cell. Its cache section clears the
list, the cached answers, and the cached page reads after a confirmation, and
it reports how many entries the worker removed.

## Backend contract

A backend serves five routes. The extension uses three of them, and the popup
links to two.

| Route                   | Purpose                               |
| ----------------------- | ------------------------------------- |
| `GET /v1/list`          | Serve the list                        |
| `POST /v1/alternatives` | Find the alternatives for one article |
| `GET /v1/img`           | Proxy a signed image                  |
| `GET /`                 | Explain the product                   |
| `GET /privacy`          | Serve the privacy policy              |

The backend origin comes from `DETOUR_API_BASE` at build time. It is one
origin with no path, so every request is the origin followed by one route.

### The list

`GET /v1/list` answers the `SitesJson` shape:

```json
{
  "disabled": false,
  "avoid": [],
  "prefer": [],
  "sites": []
}
```

A site carries `domain`, `name`, `walls`, `paths`, `note`, `avoid`, and
`prefer`. A wall carries `category` and `type`. `disabled` is the kill switch.
The list carries no version and no date: the commit that produced the artifact
is the version, and the SHA-256 of the body is the identifier that the `ETag`
carries.

A successful answer is stored with the time it was fetched and the SHA-256 of
the parsed list. Any schema-valid answer replaces the stored list, because a
newer body is a newer revision.

### Alternatives

`POST /v1/alternatives` takes one JSON body:

```json
{ "url": "https://example.com/story", "title": "The story title", "lang": "en" }
```

`url` is the blocked page URL. `title` is the metadata title or an empty
string. `lang` is fixed to `en`. The request never carries the description of
the blocked page.

The answer is one JSON body:

```json
{
  "query": "the search query",
  "degraded": false,
  "provider": "provider name",
  "alternatives": [
    {
      "url": "https://other.example/story",
      "title": "The same story elsewhere",
      "description": "One sentence",
      "domain": "other.example",
      "image": "http://127.0.0.1:8787/v1/img?u=...&sig=...",
      "favicon": "http://127.0.0.1:8787/v1/img?u=...&sig=..."
    }
  ]
}
```

Every row must carry an `http` or `https` `url`, a string `title`, a string
`description`, and a string `domain`. `image` and `favicon` are optional, and
each must be an `http` or `https` URL when present. A malformed row is dropped
on its own, and a favicon that is not an `http` or `https` URL is dropped
without the row. A malformed answer level answers `null` to the page, and the
page shows its error state.

`degraded: true` means the backend spent its search budget. The page shows the
error state and stores nothing.

### Images and favicons

An answer can carry one image and one favicon for each result. Both links point
at `GET /v1/img` and carry the source URL in `u` and a signature in `sig`. The
signature is the first 16 lowercase hexadecimal characters of `HMAC-SHA256` of
the source URL, keyed by the server's signing key.

The image is the page image of the result, and it is the hero picture or the
row thumbnail. The favicon is the site's icon, and the block page reuses it as
the tile of a row, in place of the generated colour and letter. A row without a
favicon, and every row while `imagesEnabled` is off, keeps the letter tile. A
favicon that fails to load falls back to the letter too, so a missing icon
never leaves a hole.

Both are links to the backend and never to the publisher, because your browser
must not tell the publisher who is reading.

The route answers 400 for a missing `u`, 403 for a missing or wrong signature
or a source that is not `http(s)`, 415 for a body that is not a raster image,
413 for a body over 512 KB, and 502 when the fetch fails. A served image stays
in the cache for one week.

The link must be absolute. A relative link resolves against the extension
origin and does not load.

### CORS and the caller

The extension has the broad host permission, so its service worker can read a
cross-origin answer. A backend can still check the caller. The reference
backend allows one origin, `chrome-extension://` followed by the extension id,
and refuses another origin before it reads the body.

Every answer on a `/v1/` path should carry `Vary: Origin`, because the body is
the same for every caller and only the headers differ. A preflight on a
`/v1/` path answers 204 with `GET, POST, OPTIONS` and `Content-Type`.

A backend keeps no reader id, sets no cookie, and serves every reader of an
article from one entry. The cache key is the article URL.

A request that fails answers a non-2xx status. The extension treats every
non-2xx status, every unparseable body, and every timeout as a failure and
shows the error state.

## The dummy server

`dev/dummy-server.ts` implements the contract on `http://127.0.0.1:8787`. It
also serves the fixture article pages on the same origin, so one process
covers a local run.

It answers the four saved results for a listed article, and an empty answer
when the path ends with `/empty-state` or the title carries `no alternatives`.
It signs image links with `HMAC-SHA256` and the fixed local key
`local-development-only-key`. It answers every local origin with
`Access-Control-Allow-Origin: *`, because a local run has no reason to refuse
one.

The list comes from `packages/extension/src/sites.json`, which
`pnpm list:build` writes. The `ETag` of `GET /v1/list` is the SHA-256 of the
served body. The fixture pages are in the same module, so a test starts one
server and reads real HTTP answers.

## The list

The list itself lives in the `detour-list` repository. This repository keeps a
copy of its artifact, because a worker with no stored list needs a list to
read, and because the extension must not fetch the list from the repository
host at run time.

`pnpm list:sync` fetches `dist/sites.json` at `master` from the detour-list
remote into `sites/sites.release.json`. It clones into a temporary directory,
so the shared checkout and its branch play no part. `DETOUR_LIST_REMOTE` names
another remote, and `DETOUR_LIST_REF` names a tag or a branch.
`pnpm list:build` validates that copy and writes two generated files:
`packages/extension/src/sites.json`, and its identifier in `sites-id.ts`. Both
are generated, and `.gitignore` keeps them out of the repository.

The dev list is `sites/sites.dev.yaml`, and only `pnpm list:build:dev` reads
it. That command appends the overlay entries to the release entries. The
release list carries no local entry, and the release build never reads the
overlay. The overlay uses the shape of the served list, so it carries no
editorial fields.

## The local stack

`pnpm dev` runs `dev/run-dev.ts`, which builds the dev list and then starts
two processes; the first one that exits stops the other:

| Process   | Address or output         | What it is                                               |
| --------- | ------------------------- | -------------------------------------------------------- |
| Server    | `http://127.0.0.1:8787`   | `dev/dummy-server.ts`, the backend and the fixture pages |
| Extension | `packages/extension/dist` | esbuild in watch mode, with the local backend            |

## Rules

- Fail open. A guard error, a timeout, a missing list, or a `disabled` list
  lets the page load.
- No per-user state. A backend keeps no reader id, sets no cookie, and serves
  every reader of an article from one entry.
- One cache entry per article URL. The search runs once, and every reader
  reads that answer.
- The service worker reads a page only after the guard stops it, only for
  metadata, and only for the listed URL that the reader requested.
- The backend origin is a build value. Do not read it from a page or from
  storage at run time.
