# Manual testing with the real backend

The automated suite proves the logic: the decision, the states, the message
contract, and the surfaces at the DOM level. It does not prove what a reader
sees with the production backend and with real publishers. This guide is that
second pass, and it pairs with the Gherkin plan in [qa/README.md](../qa/README.md):
each feature file names the behaviour, and this guide says how to reach it and
what to look at.

Run it before a release, and after a change to the block page, the popup, the
options page, the copy, or the stylesheet.

## Build and load the extension

```sh
pnpm install --frozen-lockfile
DETOUR_API_BASE=https://detour-api.meshkov.info pnpm build:dev
```

This is the development build with the production backend. It keeps the
manifest key, so the extension gets the id `jcncblagncbpbamfnekhdkomffdpehpk`,
and the alternatives endpoint accepts that id. It also carries `[detour]` log
lines and the local overlay list, which the first live list refresh replaces.

Do not load the release build (`pnpm build`) unpacked for this pass. A release
package drops the key, so Chrome derives the id from the folder, and the
alternatives endpoint answers 403 for that id. The list and the block page
still work, but every search shows the error state. The store grants the
published id, so the uploaded package is not affected.

Two things in `packages/extension/dist` confirm the build before anything else:

- `manifest.json` lists `https://detour-api.meshkov.info/*` in
  `host_permissions`.
- `background.js` contains that origin and `[detour]` lines.

Then:

1. Open `chrome://extensions`, turn on Developer mode, and choose **Load
   unpacked** at `packages/extension/dist`.
2. Use a fresh Chrome profile. A profile that carries an allowance, a cached
   answer, or an old list hides half the states below.
3. Open the service worker of the extension and its console, and wait for
   `[detour] background: the service worker is registered`. An idle worker is
   normal; DevTools keeps it awake while its console is open, and that changes
   the cold-start timings in [Caching and the worker](#caching-and-the-worker).
4. Read `chrome.storage.local` → `list` in the Application panel. It carries
   `listId` and the entries; the live list has about 160 publishers. Write the
   identifier down, because a report needs it.

Clear the cache between a rebuild and a pass: the options page has **Clear
cache**, and a stale list or answer is the most common reason a scenario looks
broken. A clear also drops the stored list, and the worker downloads it again in
the same call. If that download fails, the bundled copy serves until the next
refresh. Check the list id after a clear before you judge a wall.

## What a pass covers

| Surface    | The states to reach                                                                                  | Feature file                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Block page | results, matches, topic, empty, error, loading with the slow note, no capability, 360 px, dark theme | [block-page.feature](../qa/features/block-page.feature)     |
| Toolbar    | coloured, faint, gray, and the block page of a stop                                                  | [toolbar.feature](../qa/features/toolbar.feature)           |
| Popup      | listed, unlisted, off, loading, empty, error, no site                                                | [popup.feature](../qa/features/popup.feature)               |
| Options    | allowances, walls table, reading, theme, cache                                                       | [options-page.feature](../qa/features/options-page.feature) |
| Decision   | listed stop, unlisted load, wall off, path glob, allowance, pass                                     | [decision.feature](../qa/features/decision.feature)         |
| Lifecycle  | reload, cold worker, browser restart, second tab                                                     | [lifecycle.feature](../qa/features/lifecycle.feature)       |

Skip nothing in the block page and the popup rows: those two surfaces are what
the reader meets, and every state there has been wrong at least once.

## How to reach each state

| State              | How to reach it with the real backend                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Listed, stopped    | Open an article on a listed publisher, for example a `cnet.com` story                                                                                                    |
| Listed, loads      | Open a listed publisher whose wall type the reader does not stop, for example the `businessinsider.com` home page                                                        |
| Unlisted, loads    | Open `https://example.com`                                                                                                                                               |
| Path outside globs | Open `https://hbr.org/` (the entry covers story paths only)                                                                                                              |
| Match labels       | Open a listed article, then read the end of each row under `Alternative routes`; the live answer names the match of every row                                            |
| Topic line         | The same page names the story under the routes when the live analysis gives one: `Topic: …` at the right end of the key line                                             |
| Toolbar, will stop | Open a listed article that the guard stops, and look at the icon while the page loads and on the block page                                                              |
| Toolbar, lets load | Open `https://example.com`, or a listed page whose wall the reader does not stop                                                                                         |
| Toolbar, off       | Turn the switch off in the popup                                                                                                                                         |
| Toolbar, icon size | Pin the extension, then look at the icon on a light and on a dark toolbar                                                                                                |
| Popup, listed      | Open a listed story that loads, then press the toolbar icon                                                                                                              |
| Popup, unlisted    | Open `https://example.com`, then press the icon                                                                                                                          |
| Popup, off         | Turn the switch off in the popup                                                                                                                                         |
| Popup, no site     | Open `chrome://settings`, a new tab, or the block page, then press the icon                                                                                              |
| Search failed      | DevTools → Network → block request URL `*/v1/alternatives`, then open a listed article                                                                                   |
| Search slow        | DevTools → Network → throttling “Slow 3G”, then open a listed article                                                                                                    |
| Empty answer       | Not reachable with the live backend: the provider answers at least one route for every listed page tried. Use the dummy server at `/walled/empty-state`, or the e2e case |
| No capability      | Copy `block.html?u=<address>` from a real block page into a new tab; the page must offer `Open the article again`                                                        |
| Cold worker        | Close every extension page, wait a minute without DevTools, then open the popup                                                                                          |

A listed publisher met on a real page may carry a wall type the default does not
stop. Check the walls on the block page before deciding that the extension
failed to stop it: a paywall-only site loads until the reader ticks paywall.

## The shared visual rules

Check these on every surface before the individual sections. They are the rules
the stylesheet claims, and a break in one of them is a finding even when the
copy is right.

| What            | Rule                                                                                    | How to check                                                      |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Block page card | One card, at most 664 px wide and centred, on the page background                       | DevTools: the card's `max-width`, and the gutter on both sides    |
| Popup frame     | 340 px wide, never a horizontal scrollbar, the footer on one row                        | Inspect the popup, read `body.clientWidth` and `body.scrollWidth` |
| Header          | Block page strip 14 px by 28 px, popup strip 52 px tall                                 | Computed `padding` and `height`                                   |
| Headline        | One line of 23 px weight 600, balanced, never clipped mid-word                          | Zoom to 150 % and read it                                         |
| Tiles           | 36 px on the block page, 28 px in the popup; the letter is white on the domain's colour | Measure the tile, then look at the four corners                   |
| Pills           | Category, tint, and a 999 px radius; 12 px on the block page, 11 px in the popup        | Compare a pill with its row                                       |
| Rows            | Tile, title, description, domain, digit, arrow; the whole row is one link               | Hover anywhere in the row, the whole row reacts                   |
| Theme           | Both themes keep contrast on the card, the pills, the rows, and the footnote            | Switch the theme from the header, then read every section again   |
| Focus           | Every control shows a visible ring, and the order follows the reading order             | Press Tab only; never use the mouse                               |
| Reduced motion  | Nothing animates when the system asks for less motion                                   | macOS System Settings → Accessibility → Display → Reduce motion   |
| Empty values    | No empty line, pill, or column is drawn where a value is missing                        | Look for a gap that says nothing                                  |

## The block page

Open a listed article that the reader's walls stop. Walk the card from the top.

- **Header**: the mark, the wordmark, the printed wall count (`1 wall detected`,
  `2 walls detected`), and the theme control at the far end. The count must
  match the number of pills, not the number of walls in the list entry that the
  reader turned off.
- **Headline and judgement**: `CNET puts a wall in front of this story`, then
  the anti-user sentence for an ad-blocker wall only. A paywall-only site shows
  no sentence.
- **Source card**: the host in ink, the path in grey, one title line with an
  ellipsis, the description under it, the copy control at the end of the address
  line, and one pill per wall under `Walls on site`. Press the copy control and
  paste: the whole address, with its query, must land in the field.
- **A missing icon**: the tile keeps one letter on the domain's colour and must
  never be an empty square. If a publisher serves a blank icon, the letter is
  the expected result, not a defect.
- **Wall detail**: press a pill. The detail names the wall type and the note
  from the list, and it names the checked date only when the list carries a
  `verified` date. The live list carries one for every entry today, so the
  date appears. It
  offers `Report inaccurate wall detection`. A second press closes it, and
  another pill replaces it: the detail follows the pressed pill and never
  stacks.
- **Routes**: the heading, the count, then one row per alternative. The count
  includes the search card, so three routes read four. Every row carries its
  digit, the arrow, and `No walls` only when the list clears that exact address.
  A route on a listed domain shows no claim at all.
- **Search card**: the last row, `Search the same story elsewhere`. Press it and
  the four engines appear in place with the first one focused; a digit picks
  another engine; Escape returns to the routes.
- **Keyboard line**: `Press 1–5 or ↑↓ + ↵ to open an alternative`. The digits must
  match the rows on screen, and the arrows must move the selection with a
  visible ring.
- **Actions bar**: `Go back` with its `Esc` cap, the scope control, and
  `Open <site> anyway`. Open the scope menu and check the four choices, the
  sentence under each one, and the preselected one; on a short window the menu
  must open upwards, stay inside the window, and scroll if the sentences do not
  fit. While the answer is still loading, only `Go back` is drawn: the open
  control waits for the answer that names the site and the scope.
- **Footer note**: the data line and `Report a problem`
  ([privacy.md](privacy.md) explains the line). The report must open the issue
  form with the site, the address, the list identifier, and the build.
- **No record**: open `block.html?u=<address>` without the tab that the guard
  recorded. The source card and the notice are drawn, the routes, the actions,
  and the theme control are absent, and `Open the article again` recovers the
  page. Open the address copied from a real block page, which carries its
  `theme=`, to check the same page in the stored theme.
- **The four answer states**: results, empty, error, and the loading state with
  the note that appears after three seconds. The note names the host, not the
  site: it starts before the state arrives. The live backend reaches results,
  error, and loading. The empty state needs the dummy server. Check that the
  retry asks again and that the note disappears when the answer arrives.
- **A phone**: set the device toolbar to 360 px. The card loses its outer
  padding, a title takes two lines, the description and the digit and arrow are
  dropped, and nothing overlaps.

## The popup

Open it over a page and inspect it with DevTools (right-click inside the popup →
Inspect). Closing and reopening is the fastest way to see the loading frame
again.

- **Header**: the mark, `Detour`, the state word with its dot when the list is
  on, and the switch. The switch must read the stored setting, not a default.
- **Loading frame**: right after opening on a cold answer, the frame shows
  `Looking for the same story elsewhere…`, the two footer links, and the gear.
  The switch, the state word, and the theme control must be absent, because a
  greyed switch would say that Detour is off.
- **Listed card**: the domain, one sentence about the walls, and one pill per
  wall. The pill unfolds the same detail as on the block page, at the popup's
  density.
- **Routes**: one row per alternative with digits, arrows, and the count. With
  more than three routes the list scrolls instead of growing: check that the
  wheel scrolls it, that the fourth digit still opens the fourth route, and that
  the search card keeps the last number.
- **Unlisted card**: `This site is not on the list`, then the report row with
  digit 1 and `Search the same story elsewhere` with digit 2. The report row
  must open the issue form in a new tab.
- **No site**: on `chrome://settings` or a new tab the main area reads
  `Detour works on websites. Open a site, then press the icon again.` The
  header and the footer stay. A missing line is a finding.
- **Footer**: `How it works` and `Privacy` on the left, the theme and the gear
  on the right, on one row, inside 340 px.
- **Keys**: 1–9 open rows, the arrows move the selection, Enter opens it, Escape
  closes the popup. A focused link keeps its own Enter.
- **Off**: on a listed page the card keeps the site and its pill and offers no
  routes and no search. On an unlisted page the frame alone is left, because the
  list has no site to keep.
- **Every state**: listed, unlisted, off, loading, empty, and error. The empty
  and error states keep the engines and the retry, and the live backend reaches
  every state except empty.

## The options page

- **Allowed sites**: one row per allowance with the site, the scope, and the
  date, and a remove control whose accessible name names the site. With nothing
  allowed the section reads `No site is allowed.`
- **Walls to stop**: one row per category and one column per type. A metered
  cell exists only for the paywall row and draws a dashed square elsewhere. Read
  the table with a screen reader once: every tick box must name its category and
  type.
- **Reading**: the auto-open and the icons settings, each with its sentence.
- **Theme**: `System`, `Light`, and `Dark`, with the chosen one marked, and a
  choice that is stored for every page and applied to the one in front of you.
- **Cache**: `Clear cache` asks first, reports `Clearing…` while it works, then
  reports how many keys it dropped and downloads the list again. The button waits
  for the answer, so a slow backend cannot take a second press. With the backend
  reachable, the list id after a clear is the live one, not the bundled id.

## Dark theme and widths

Run one pass with the system in the light theme and one with it in the dark
theme, and once through the theme control on each surface. Then repeat the block
page at 360 px and at 200 % browser zoom, and the popup at its own 340 px with
the browser zoom at 100 %. A layout that only breaks at 200 % is still a defect:
the card's max width is 664 px, so it must reflow and not clip.

## Timing

The budgets are in `AGENTS.md`. Measure them with the Performance panel on a
warm worker and a cleared cache:

| What                          | How                                                                                                   | Budget       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------------ |
| Guard overhead, unlisted page | Record a navigation to `https://example.com` on a fresh profile, read the guard's task                | under 20 ms  |
| Block page first paint        | Record the navigation to the block page; the card, the header, and the source card paint with no list | under 100 ms |
| Warm alternatives             | Open the same article twice; the second open reads the cache                                          | under 150 ms |
| Cold alternatives             | The first open with an empty cache; this is the backend's time, not ours                              | under 15 s   |

A cold search shows the loading line and, after three seconds, the note. If the
answer never arrives, the error state must appear before the 15-second deadline.

## Caching and the worker

- **Reload the block page**: the routes, the source card, and the actions must
  come back, and the second paint should need no new backend answer.
- **Cold worker**: close every extension page, leave DevTools closed for a
  minute, then open the popup. It must paint the full state, and the console
  must not show an error.
- **Browser restart**: restart Chrome with “Continue where you left off”. The
  restored block page has no capability record any more. It draws the headline,
  the source card, and `Detour has no record of this tab's article.` with
  `Open the article again`, in the theme that the URL carries. Press the link:
  the article must load through the guard and stop again on a block page that
  shows its routes. A missing notice, a wrong theme, or a link that does not
  recover is a finding.
- **Two tabs**: open the same article in two tabs at once. Both stop, and each
  block page answers for its own tab; one must not show the other's routes.

## Evidence to attach to a finding

- The scenario from the feature file, by file and name, and what you expected.
- A screenshot of the popup at 2× in both themes, and the block page full page
  at 1280 px, both themes.
- The console of the page and of the service worker, with the `[detour]` lines
  if the build carries them.
- The `listId` from the Application panel, the address that was stopped, and the
  extension version from `chrome://extensions`.
- Whether the answer came from the cache, and whether the worker was cold.

## Sign-off

- [ ] Decision: listed stop, listed load, unlisted load, wall off, path glob,
      allowance, pass.
- [ ] Block page: header, headline, source card, missing icon, wall detail,
      routes, search card, keyboard, actions, footnote.
- [ ] Block page states: results, empty, error, slow note, retry, no capability.
- [ ] Popup: listed, unlisted, off, loading, empty, error, no site.
- [ ] Popup: keys, route press, report row, footer at 340 px.
- [ ] Options: allowances, walls table, reading, theme, cache.
- [ ] Light and dark, 1280 px and 360 px, 200 % zoom, Tab only.
- [ ] Timing: guard overhead, first paint, warm alternatives.
- [ ] Lifecycle: reload, cold worker, browser restart, two tabs.
