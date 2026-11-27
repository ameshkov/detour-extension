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
the load. The service worker owns the list, the allowances, the metadata, the
navigation, and the toolbar state. The block page owns presentation, and the
popup and the options page show what the service worker stored.

The toolbar answers for the page in front of the reader, and for the article of
a block page while the tab holds the record of the stop. It takes the gray set
of icons while Detour is off, the faint set on a page that the guard lets load,
and the coloured set on a page that the guard will stop. A page that Detour lets
load is a page that is not listed, a page whose chosen walls do not stop it, and
a site that the reader allowed. The title names the outcome, and a new tab, a
navigation, a window that takes the focus, and a write of the settings or the
list repaint the toolbar.

| Surface        | Responsibility                                                                               | Files                                                                                                                                                                                                    | Talks to                |
| -------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Guard          | Decide fast, stop the load, report the URL.                                                  | `guard.ts`, `guard-entry.ts`                                                                                                                                                                             | Service worker          |
| Service worker | Own the list, the settings, the metadata, the answer cache, the navigation, and the toolbar. | `background.ts`, `service-worker.ts`, `handlers.ts`, `state-handlers.ts`, `state-view.ts`, `state-guard.ts`, `allowance-handlers.ts`, `capabilities.ts`, `refresh.ts`, `metadata-cache.ts`, `toolbar.ts` | Storage, backend API    |
| Block page     | Name the site and its walls, show the source, and paint the answer it is given.              | `block.html`, `block-entry.ts`, `block-page.ts`, `block-results.ts`, `block-shell.ts`, `block-actions.ts`                                                                                                | Service worker          |
| Popup          | Show the page's walls, its routes, and the search, and open a route.                         | `popup.html`, `popup-entry.ts`, `popup.ts`, `popup-sections.ts`, `popup-data.ts`, `popup-keyboard.ts`                                                                                                    | Service worker          |
| Options page   | List the allowances, set the walls and the reading settings, clear the cache.                | `options.html`, `options-entry.ts`, `options.ts`                                                                                                                                                         | Storage, service worker |

The source files sit in `packages/extension/src`. The guard keeps one
module-level marker for the document and draws at most one anchor, only for a
failed navigation. It holds no other state. The service worker is the only
writer of every storage key, `alt:<sha256(url)>` included, because an answer can
arrive after the popup that asked for it has closed. The block page and the
popup read no storage: each asks the worker for one state and paints it, and
each reach the backend only through the worker. A page renders state and sends
messages, and it never reads a page.

The options page reads storage directly, and every write goes through a
message. The popup's header carries the switch of `settings.enabled`, and a
press writes the whole settings record through `setSettings`.

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

The manifest carries one fixed public key for development, and no private key is
in the repository. The SHA-256 of that key, with each digit mapped to the letters
`a` to `p`, gives the development id `jcncblagncbpbamfnekhdkomffdpehpk`. The
release build drops the key, because a store upload refuses a package that
carries one, and the store grants the published item its own id and key:
`gjmlbmcaklcbificepnkpenfhelngklo`. A backend that checks the caller origin must
allow `chrome-extension://` followed by both ids.

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

| Message       | Request                   | Answer                                                               |
| ------------- | ------------------------- | -------------------------------------------------------------------- |
| `isBlocked`   | `{ url }`                 | `{ ok: true, blocked, site }`                                        |
| `blocked`     | `{ url, meta }`           | `{ ok: true, blockPageUrl }` or `{ ok: false, error, blockPageUrl }` |
| `popupState`  | none                      | `{ ok: true, state }` or `{ ok: false, error }`                      |
| `pageState`   | `{ url }`                 | `{ ok: true, state }` or `{ ok: false, error }`                      |
| `openRoute`   | `{ url }`                 | `{ ok: true }` or `{ ok: false, error }`                             |
| `allow`       | `{ scope, url }`          | `{ ok: true, allowances }`                                           |
| `pass`        | `{ url }`                 | `{ ok: true }`                                                       |
| `revoke`      | `{ scope, host, tabId? }` | `{ ok: true, allowances }`                                           |
| `setSettings` | `{ settings }`            | `{ ok: true, settings }`                                             |
| `clearCache`  | none                      | `{ ok: true, cleared }`                                              |

`site` is `{ domain, name, walls }` from the list, or `null`, and each wall is
`{ category, type }`. `meta` is `null` or `{ title, description, icon }`, and
each field is a string or `null`. `scope` is `tab`, `session`, or `always`.
`cleared` is the number of storage keys that `clearCache` removed.

The two states are the surface's whole answer. `{ settings, view }` carries
every datum a render reads: the list as a view, the settings, the metadata, the
routes with their wall verdict, the query, the scope, and the report URL.
`state-guard.ts` checks an answer before a page paints it, so a field of the
wrong type is a refusal and never a half-painted page.

`popupState` answers only an extension page, for the tab that the worker finds
active in the last focused window. `pageState` answers only a top-frame
extension page whose tab and URL carry a capability record: `block.html` is a
web accessible resource, so a page that merely opened it asks for nothing.
`openRoute` moves the active tab to an address that is an HTTP(S) page, which
is the one navigation the popup cannot make itself.

### Guard

The guard hides the document before its first `await`. It sets
`visibility: hidden` with the `important` priority on `documentElement`, so a
publisher rule cannot override the hidden state. It sends `isBlocked` and
waits at most 400 ms, which covers a worker that is still starting. A worker
that never answers costs the rest of that wait, and the page loads.

On `{ blocked: true }` the guard waits for the head to close, then calls
`window.stop()`, then reads the head, then sends `blocked { url, meta }`. The
signal is `document.body`: that node exists only once the parser has passed
`</head>`, and a `MutationObserver` on `document` ends the wait on the task
that inserts it, so a head that already closed costs nothing. A 150 ms cap
bounds a head that never closes. The guard reads the live DOM and never fetches
a copy, so the publisher sees one document request.

The service worker records `{ tabId → sha256(url) }` in the session store and
writes `meta:<sha256(url)>` before it navigates the tab, so the block page that
replaces the stopped document is the only page allowed to act for that tab and
URL, and the card has its head at the first paint. The block page URL carries
the stored theme as `theme=`, so the frame paints in the reader's theme before
the state arrives; a page without its record keeps that theme and hides the
control that would need the settings. Eviction runs after the
navigation. On a false answer, a rejection, a timeout, or a late answer, the
guard removes the rule and lets the page load. A second run on one document
does nothing.

The guard draws one element, and only in one case. When the navigation answer
is `{ ok: false }` and carries a string `blockPageUrl`, the guard restores
visibility and appends one anchor to the page, with that URL and the text
`Open the Detour page`. Every other answer appends nothing.

### Storage

The service worker writes every key below, and it is the only writer. The
`alt:` entry is written from a finished backend answer, because an answer can
settle after the popup or the block page that asked for it has closed.
`clearCache` removes `list`, every `alt:` key, and every `meta:` key at the
reader's request. The worker then downloads the list again in the same call, so
a clear that reaches the backend does not leave the bundled copy in use. A
failed download keeps the bundled copy until the next refresh. The settings,
the allowances, the scope defaults, and the tab records stay.

| Key                  | Store   | Writer         | Lifetime                     |
| -------------------- | ------- | -------------- | ---------------------------- |
| `list`               | local   | service worker | Until the next refresh       |
| `settings`           | local   | service worker | Until the user changes it    |
| `scopeDefaults`      | local   | service worker | Until the user changes it    |
| `allowAlways`        | local   | service worker | Until the user removes it    |
| `allowSession`       | session | service worker | Browser restart              |
| `allowTabs`          | session | service worker | Tab close                    |
| `capability:<tabId>` | session | service worker | Tab close, or a new block    |
| `pass:<tabId>`       | session | service worker | One navigation, or tab close |
| `meta:<sha256(url)>` | local   | service worker | 7 days, 500 entries          |
| `alt:<sha256(url)>`  | local   | service worker | 24 hours                     |

`scopeDefaults` maps a domain to the scope that the reader chose for it, and
only a choice other than `tab` has an entry, because `tab` is the default. The
map keeps the last 100 domains. The block page reads it to start the scope
selector, and a press in the menu sends `rememberScope`; the worker checks the
sender's tab record and writes the map.

`settings` holds `enabled`, `autoOpenBest`, `imagesEnabled`, `theme`, and
`walls`, and its default is `{ enabled: true, autoOpenBest: false,
imagesEnabled: true, theme: 'system', walls: { hard: ['adblock'],
soft: ['adblock'], metered: [] } }`. `walls` groups the categories the reader
chose by the type that presents them, so one reader can stop an ad-blocker wall
that covers the article and leave a paywall that replaces it alone.

`theme` is one of `system`, `light`, and `dark`. A page resolves `system`
through `prefers-color-scheme` and paints the result on the root element, so
the sheet has one block of dark tokens. The block page reads the choice from
its URL for the first frame, and its header carries a button that moves to the
other theme once the state arrives; a page without its record has no state and
no button. The options page carries all three choices.
A value outside the three falls back to `system`, and both writers store the
whole record, so one press keeps the other four fields.

The decision runs in this order: the extension is enabled, the list is not
`disabled`, the URL is listed, the tab holds no one-time pass for this URL, one
of the entry's walls is a wall the reader chose, and no `allowAlways`,
`allowSession`, or `allowTabs` entry covers the host. A site whose walls are all switched off loads, exactly as an unlisted
site does. A tab entry also covers a tab that the entry's tab opened. Closing a
tab removes its entries.

A pass is the one-time counterpart of an allowance. `Just once` in the open
menu sends `pass`, the worker records `pass:<tabId>`, and the guard spends the
record on the next navigation to that URL, so the page opens once and the next
visit meets the wall again. A pass covers one tab and one URL, it is never
listed on the options page, and tab close removes it.

`capability:<tabId>` holds the digest of the URL that one stopped tab was on,
written before the navigation and replaced by the next block in that tab. The
service worker checks the sender's own tab before it answers `pageState` or
writes an allowance or a pass. A failed navigation keeps the key, so the
guard's fallback link still opens a page whose requests answer.

`list` holds `{ storageVersion, fetchedAt, listId, list }`. `storageVersion`
is the extension's own storage format, and it is `2`. `listId` is the SHA-256
of the stored list, and a report carries it. A stored envelope with another
`storageVersion`, or without an identifier, is discarded, and the extension
uses the bundled list.

### Metadata

The guard reads the head of the stopped document, after the stop and before it
asks the worker to navigate. `page-meta.ts` reads `og:title` and falls back to
`<title>`, reads `og:description` and falls back to
`<meta name="description">`, and takes the first `rel="icon"` link, else the
`apple-touch-icon`, else `/favicon.ico` of the page. The icon is an absolute
`http` or `https` address, the title collapses its whitespace, and every value
is capped at 2,048 characters.

The worker validates the value, treats an invalid one as absent, and writes it
with one direct write before the navigation. A cached read lives 7 days, with
at most 500 entries, and the eviction that keeps the cap runs after the
navigation or on a later write. The description of the stopped page stays on
the device. It never reaches the backend, and no code fetches a publisher page.

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

A start retires the run before it, and `stopBlockPage` retires the run that
owns the document. A retired run asks for no answer, stores none, and paints
nothing, so a page that a new run or a teardown now owns stays as it is.

A page that has no tab record keeps the source card and draws one notice under
it. The notice names the missing record and links to the article in the query.
That navigation runs the guard again, so the worker records a fresh capability
and the routes can load. Without an address the notice says the page has none
and offers no link.

The list area carries one of four states in `data-state`: `loading`,
`results`, `empty`, and `error`. Those four values are the whole state set. A
results state renders one `<li>` per alternative, and every row has the same
shape. The tile reuses the favicon the answer sends, in place of the letter
tile, and keeps the letter when the answer carries none, when the favicon
fails, or while `imagesEnabled` is off. The answer's page image is not drawn.
A row holds three lines of text under the tile: the title, the description, and
the domain in mono. The meta line adds `No walls` with a circle check when the
list in use carries no wall for that exact address: the row checks the
alternative against the same list that stopped the page, and the shared
matcher reads the host and the path globs. A site that the list carries makes
no claim, and so does a list that the page could not read. The line closes with
the match that the analysis gave: `Same story`, `Same event`, `Same topic`, or
`Different story`. A row that the analysis could not place, and a row of an
answer that did not run it, carries no label.

The whole row is one link: the title, the description, the domain, and the
tile all open the alternative in the tab that holds the block page, so the
reader aims at the row and not at a line of text in it. The description takes one line under the title, and a
phone drops it, so every row keeps the height it needs and no more.

The list head reads `Alternative routes`, with the count in one small pill.
The search card is one route, so the count includes it. Every row ends with its
number and an arrow, and the search card carries the last number and an arrow
of its own. A digit opens its route, and the arrows move a selection over the
rows and then the search card. Enter opens the selection or the first route.
The line under the list names the keys in key caps, and it ends with
`Topic: <story>` when the answer named the story of the article. A long story
ends in an ellipsis at 55 % of the line, and an answer without one leaves the
line as the keys alone. A phone drops the numbers, the arrows, and the line,
because it has no keyboard. The arrows start
the list even after a control took the focus; only a form field keeps its own
keys, and a focused button or link keeps Enter.

A search card closes the results list. It looks like a result, with a magnifier
in place of the publisher tile and the last number, so the count and the digits
include it. It is the last stop of the arrow keys, it takes the same ring as a
selected row, and Enter or its digit opens it. A press opens the fallback box,
fills the query when the reader has not edited it, and gives the focus to its
first engine, where the digits choose another. The open box then takes the
card's place as the last stop, with the same ring, so the arrows lead back to
the box after the focus has left it, as a return from the engine's own tab
leaves it; Enter or its digit returns to the first engine.

The page is one card on a dotted canvas. The header strip carries the mark, the
wordmark, the wall count after a hairline with its amber dot, and the theme
button once the answer arrives. The headline names the site and counts the
walls that the list records for it, and the tab carries that name. The source
card under it holds the mark of the stopped publisher, the host in ink, the
path in grey, the title in ink, and the description of the page under it. A
copy control beside the address writes the whole address to the clipboard and
marks itself for two seconds. The address is text and not a link, so the only
way to the site is the control in the card foot. The mark takes the 36 px size
of a result tile and starts at the top of the card: it is the icon of the
stopped page when `imagesEnabled` is on and the metadata carries one, and
otherwise one letter on the colour of the domain. An icon that fails to load,
or that loads smaller than the tile, leaves the letter in its place: CNET and
ZDNET serve a 16 px fully transparent file at `/favicon.ico`, the address the
reader guesses when the head names no icon, and that file draws an empty
square. A title that only repeats the address is dropped, because a page that
the guard stopped before it wrote its title answers with the bare host. Its last row names the walls: one pill per wall, with the category and
its icon in the tint of the category. The pill is a button on the block page,
and a press opens one detail under the row: the category and its icon, the type
as a badge, the checked date when the list carries it, the site's own note as
the description, and a link that reports a wrong detection. The hint beside
the pills names that action. A page
that carries an ad-blocker wall adds one sentence under the headline, and a
page that carries another wall alone adds none, because a paywall, a consent
dialog, or an age check is the publisher's business.

The fallback box holds an editable query and four numbered engine links, in the
order DuckDuckGo, Brave, Google, and Bing: `1` to `4` are the keys that choose
one, and the keyboard line under the box names them, in the same key caps as the
line under the list. A page whose metadata carries no title names no story, so
the query is `Sites similar to <domain>`, where the domain is the registrable
one and the host when the host has none. Otherwise the query is the answer's
own query when it carries one, and otherwise the result of the shared title
cleaner over the metadata title, the URL, and the site name. The empty and error states
show the box directly instead of the search card. The first engine takes the
focus when the box opens, and a digit selects its engine with the ring that a
selected row has; Enter on an engine opens it, and Enter in the query opens the
chosen engine, or the first one when the reader chose none. The arrows walk the
engines, Down enters them from the field, Up from the first returns to the
field, and Up in the field leaves the box for the last alternative, the step
above it in the list; Escape closes the box for the card. The box needs no
mouse. The field keeps every key that belongs to
typing, so a digit in the query stays a digit, and the engine keys stop at the
box, so they never reach the list behind it.

At three seconds without an answer the loading area gains `data-slow` and
shows the note, the `Open <site> instead` action, and `Keep waiting`.

The foot of the card is its action bar. Until the answer arrives the bar keeps
`Go back` and hides the open control, because the answer names the site and the
scope that control would apply. `Go back` leaves the block page for the page
before the stopped article, and the shortcut `Esc` does the same. `Open
<site> anyway` sits at the right end beside the scope selector and applies the
chosen scope. The scope selector starts on the choice that the reader kept for
the domain, `This tab` when the domain has none, and opens a radio menu of
`Just once`, `This tab`, `This site until restart`, and `This site always`. Each
choice carries its sentence from `SCOPE_DETAIL`, and `Just once` carries
`ONCE_DETAIL`, so the reader sees what the scope covers. The placement caps the
menu to the room on its side and lets it scroll, because the two-line menu is
taller than the labels alone. A press chooses the scope and opens nothing; the
main button applies it, and the
worker keeps the choice for the domain. The menu is
right-aligned, so it stays inside the card, and it opens above the control when
there is no room below. It closes on Escape, on a second press of the trigger,
on a press of a scope, and on a press anywhere else on the page.

The privacy note and the report link sit centred under the card, on two lines,
not in its foot, so the card ends with the way out and the way back. `Esc`
closes the search box first, from the query, an engine, or the box as the last
stop: the box and its line leave, the search card returns with its ring, and
the focus leaves the box, so the arrows walk the alternatives again. On the
list, `Esc` clears a selected row before it leaves the page; a focused control
and an open menu keep their own Escape. The empty and error states have no
card, so there the box has no way back and `Esc` leaves the page.

The countdown starts when `autoOpenBest` is on and at least one alternative
exists. It counts 3, 2, 1, and then navigates the tab to the first
alternative.

The page sends `{ url }` and paints the state that the worker answers. The
worker reads the `alt:` cache and, on a miss, posts
`POST {API_BASE}/v1/alternatives` with the URL, the title from the metadata,
and the fixed `lang: 'en'`, with a 15-second deadline. Two callers of the same
URL share one request, and a finished answer is written under
`alt:<sha256(url)>` for 24 hours, with at most 200 answers. A degraded answer is
never stored. The request runs only for a tab that the worker recorded on that
URL. A result favicon is the one direct request a surface makes to the
backend: a row loads the icon link from the answer as it renders. The source
card requests the icon of the stopped page from its publisher, and no other
image leaves the extension.

`Report a problem` is a quiet link to
`https://github.com/ameshkov/detour-extension/issues/new`. The body carries the
blocked URL, the list identifier, and the extension version.

The page navigates through one injected function, so a test drives it without
a browser navigation: `navigate` moves this tab. A route, the site, the
countdown, and the slow note all use it; only the search engines and the
report link open a new tab.

### Popup and options page

The popup is 340 px wide and renders one state that the worker built. Its
header carries the mark tile, the wordmark, the state word, and the switch of
`settings.enabled`. Below it the source card names the page: the tile letter on
the colour that the domain earns, the domain in mono, and one sentence. A
listed site carries the headline sentence and the pills of its walls, and a
pill unfolds the detail that names the checked date, the site's note, and the
report link. An unlisted site carries `This site is not on the list`.

A listed site's routes follow the card: `Alternative routes`, the count, one
row per route with its digit and arrow, and the search card as the last row. The
rows are the block page's rows, so the two surfaces cannot drift. An unlisted
site has two rows instead: the report, and the search.

The search card opens the four engines in place. The popup has no query field,
so its detail reads `Pick an engine.` and a digit picks one. The report row
opens a prefilled issue in a new tab, and it carries the page, the list
identifier, and the extension version.

Until the answer arrives the popup shows the loading line, the two footer links,
and the gear, and it holds back the switch, the state word, and the theme
control: without the settings a switch would read as off while Detour is on.
The card arrives with the state, because the site and its walls are part of it.
A page that is not a website draws the frame and one line that says Detour works
on websites, so an empty window does not read as a broken one.

A digit opens its row, and the digit is the row's position, so the results
state numbers the routes 1 to 3 and the search card 4 — the block page's
numbering for the same URL — and the unlisted state numbers the report 1 and
the search 2. The arrows move a selection, Enter opens it, and a focused
control keeps Enter. Escape stays the browser's, which closes the popup. The
popup asks for `popupState` once, sends `setSettings` for the switch and the
theme, opens the options page from the gear, and sends `openRoute` for a route:
it cannot navigate its own tab. The doors of `Off`, `no-site`, `unlisted`,
`results`, `empty`, and `error` are the whole state set, and a request that
fails paints `Detour could not read this page.`

The footer carries `How it works` and `Privacy`, which open the public site at
`https://ameshkov.github.io/detour-extension/`, then the theme control and the
gear of the options page. The popup never grants an allowance.

The options page is 640 px at most. It lists every entry of the three
allowance stores with its scope and its `addedAt` date as a UTC `YYYY-MM-DD`,
and it removes one entry at a time. It also holds the walls table,
whose rows are the seven categories and whose columns are the three types, the
two reading settings `autoOpenBest` and `imagesEnabled`, and an Appearance
section with the three theme choices as one segmented control. A cell marked as
empty cannot be ticked, because only a subscription limits a count. The table
and the theme write the whole settings record through `setSettings`, so a press
keeps every other field. Its cache section clears the
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
  "topic": "the story of the article",
  "alternatives": [
    {
      "url": "https://other.example/story",
      "title": "The same story elsewhere",
      "description": "One sentence",
      "domain": "other.example",
      "image": "http://127.0.0.1:8787/v1/img?u=...&sig=...",
      "favicon": "http://127.0.0.1:8787/v1/img?u=...&sig=...",
      "match": "same_event",
      "best": true
    }
  ]
}
```

Every row must carry an `http` or `https` `url`, a string `title`, a string
`description`, and a string `domain`. `image` and `favicon` are optional, and
each must be an `http` or `https` URL when present. `match` is one of
`same_story`, `same_event`, `same_topic`, `different`, and `unknown`, and it is
absent when the analysis did not run for that row. `best: true` marks the one
row that the analysis accepted, and the client keeps the order of the answer
and does not draw the flag. `topic` is a string of at most 120 characters, and
it is absent when the analysis gave none. A malformed row is dropped on its
own, a favicon that is not an `http` or `https` URL is dropped without the row,
and a `match` that the client does not know becomes no match at all. A
malformed answer level answers `null` to the page, and the page shows its error
state.

`degraded: true` means the backend spent its search budget. The page shows the
error state and stores nothing.

### Images and favicons

An answer can carry one image and one favicon for each result. Both links point
at `GET /v1/img` and carry the source URL in `u` and a signature in `sig`. The
signature is the first 16 lowercase hexadecimal characters of `HMAC-SHA256` of
the source URL, keyed by the server's signing key.

The image is the page image of the result; the block page does not draw it. The
favicon is the site's icon, and the block page reuses it as the tile of a row,
in place of the generated colour and letter. A row without a favicon, and every
row while `imagesEnabled` is off, keeps the letter tile. A favicon that fails
to load falls back to the letter too, so a missing icon never leaves a hole.

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
