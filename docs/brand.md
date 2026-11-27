# Brand

Detour is the working name of the extension. This page holds its name, its mark, its wordmark,
its palette, its type, its sizes, and its licence. The extension pages, the public site, and the
store listing draw from this page.

## Name

Detour is a working name. The final name needs a decision from the owner before the release, and
one change replaces it here, in the page titles, in the copy module, and in both manifests.

## Mark

The mark is a route that leaves its first line behind: an amber line, a blue line that turns away
from it, and a blue arrowhead at the end. It was drawn for the project, and its geometry lives in
`scripts/icons.ts`, so one command draws every image that carries it. The glyph is two thirds of
the width of its tile, and the tile is a rounded square in `#0F172A` with the glyph centred on it.

The three pages ship the glyph as `packages/extension/src/logo-mark.png`, inside the mark tile of
the header:

| Page         | Image size | Tile size |
| ------------ | ---------- | --------- |
| Block page   | 16 px      | 24 px     |
| Options page | 16 px      | 24 px     |
| Popup        | 14 px      | 22 px     |

The image carries the two colours of the route, and the sheet paints the tile under it with
`--mark`.

The manifest carries the same tile as `icon-16.png`, `icon-32.png`, `icon-48.png`, and
`icon-128.png`, so the toolbar button and the extensions page show the mark of the header. The
icon is the whole tile and not the bare glyph, because the browser draws it on a surface the page
does not control.

The toolbar carries three sets of the same tile. `icon-*` is the coloured route, for a page that
Detour will stop. `icon-plain-*` is the same route in `--faint`, for a page that Detour lets load.
`icon-off-*` is a white glyph on a `--muted` tile, for a Detour that is off. The colour of the
toolbar says what the product will do before the reader opens anything.

The manifest names the coloured set as the default, so the extensions page shows the brand.

The mark never appears inside the explanation. It marks the product in a header and in the
toolbar, and it marks nothing else.

## Wordmark

- **Typeface**: the interface sans, `'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif`
- **Weight**: 600
- **Letter spacing**: -0.025em
- **Size**: 13.5 px on every page

The sheet sets the wordmark in `ui.css`, and this page and the sheet carry the same tracking
value. The block page, the popup, and the options page write the wordmark as text, so no image
carries it.

## Asset set

| Asset                                            | Ships   | Location                                                           |
| ------------------------------------------------ | ------- | ------------------------------------------------------------------ |
| Mark source, TypeScript geometry                 | Now     | `scripts/icons.ts`                                                 |
| Page mark, PNG                                   | Now     | `packages/extension/src/logo-mark.png`                             |
| Interface font, Inter variable WOFF2, latin      | Now     | `packages/extension/src/inter.woff2`                               |
| Inter SIL OFL licence, text                      | Now     | `packages/extension/src/inter-OFL.txt`                             |
| Manifest icon set, PNG at 16, 32, 48, and 128 px | Now     | `packages/extension/src/icon-16.png` to `icon-128.png`             |
| Plain toolbar set, PNG at the same four sizes    | Now     | `packages/extension/src/icon-plain-16.png` to `icon-plain-128.png` |
| Gray toolbar set, PNG at the same four sizes     | Now     | `packages/extension/src/icon-off-16.png` to `icon-off-128.png`     |
| Store icon, 96 px in a 128 px canvas             | Release | `store/assets/icon-128.png`                                        |
| Store screenshots, 1280 by 800 px                | Release | `store/assets/screenshot-*.png`                                    |
| Store tile, 440 by 280 px                        | Release | `store/assets/tile-440x280.png`                                    |
| Store marquee, 1400 by 560 px                    | Release | `store/assets/marquee-1400x560.png`                                |

`pnpm icons` draws the page mark and the three sets of four toolbar icons from that one
geometry. The page mark is the only image that the pages load. The manifest icon set is the tile of
the header at four sizes, and the manifest names those four files. The store icon is the 128 px
tile, and the screenshots and the store tile come from `pnpm store:capture`, with
`pnpm store:shot` drawing the block page and the popup from one real article.

## Palette

The sheet declares every colour once, and no other colour is written in it. Prettier lowercases
each hexadecimal value in the sheet, so `ui.css` holds `#f8fafc` where this table holds `#F8FAFC`.
The two spellings are one colour.

| Token            | Value                    | Use                                    |
| ---------------- | ------------------------ | -------------------------------------- |
| `--paper`        | `#F8FAFC`                | The dot canvas behind the card         |
| `--surface`      | `#FFFFFF`                | The card, a row, and a control         |
| `--sunken`       | `#F8FAFC`                | The source card and the card footer    |
| `--ink`          | `#0F172A`                | The headline and the strongest text    |
| `--body`         | `#475569`                | A paragraph, a description, a note     |
| `--muted`        | `#64748B`                | Secondary text and meta                |
| `--faint`        | `#94A3B8`                | A path, a label, and a quiet hint      |
| `--line`         | `#E2E8F0`                | Card borders and dividers between rows |
| `--line-soft`    | `#F1F5F9`                | Dividers inside the card               |
| `--hover`        | `#F8FAFC`                | The fill of a hovered row or control   |
| `--control-line` | `#CBD5E1`                | The edge of a quiet control            |
| `--mark`         | `#0F172A`                | The tile under the mark                |
| `--accent`       | `#2563EB`                | A link, a selection, and a fill        |
| `--accent-deep`  | `#1D4ED8`                | The hovered accent                     |
| `--accent-ink`   | `#1D4ED8`                | Accent text on a light surface         |
| `--accent-ring`  | `rgba(37, 99, 235, 0.2)` | The hover ring around the switch       |
| `--blocked`      | `#E11D48`                | A removal that the reader asks for     |
| `--clear-ink`    | `#047857`                | The label of a route without walls     |
| `--notice-ink`   | `#92400E`                | The text of a notice                   |
| `--notice-line`  | `#FDE68A`                | The border of a notice                 |
| `--amber-dot`    | `#F59E0B`                | The status dot and the hard-block dot  |

The public site carries the same palette and the same corner radius in `website/styles.css`. A
test compares the two files, so the site cannot drift from the sheet.

A wall pill takes one tint from its category. The category names the ink, the surface, and the
line of the tint:

| Category     | Ink       | Surface   | Line      |
| ------------ | --------- | --------- | --------- |
| adblock      | `#BE123C` | `#FFF1F2` | `#FECDD3` |
| paywall      | `#92400E` | `#FFFBEB` | `#FDE68A` |
| registration | `#5B21B6` | `#F5F3FF` | `#DDD6FE` |
| consent      | `#075985` | `#F0F9FF` | `#BAE6FD` |
| region       | `#1E40AF` | `#EFF6FF` | `#BFDBFE` |
| vpn          | `#065F46` | `#ECFDF5` | `#A7F3D0` |
| age          | `#9A3412` | `#FFF7ED` | `#FED7AA` |

The tile of a result row takes one colour from a fixed set of nine, chosen by the domain, so the
same domain keeps the same tile. Its letter is white on that colour:

`#1F2937`, `#2F4A6D`, `#3B2F63`, `#1D4ED8`, `#5C3B2E`, `#44403C`, `#4A2F3D`, `#1B3A5C`,
`#2E4A2A`.

The tile shows the favicon of the publisher when the answer carries one: the 16 px icon fills the
36 px tile, and the generated colour and letter stay behind it as the fallback. The letter is the
stand-in, so a row without a favicon reads the same as before.

Body text is at least 4.5:1 against its background.

## Dark set

The stored choice is one of `system`, `light`, and `dark`. The system choice follows
`prefers-color-scheme`, and a page paints the resolved theme on the root element. The dark set
replaces the same tokens and adds no component of its own. The tile of the mark is the one edge
that the dark set draws: a light hairline inside it, so the tile stays a step above the card.

| Token            | Value     |
| ---------------- | --------- |
| `--paper`        | `#090D16` |
| `--surface`      | `#111827` |
| `--sunken`       | `#0F172B` |
| `--ink`          | `#F1F5F9` |
| `--body`         | `#CBD5E1` |
| `--muted`        | `#94A3B8` |
| `--faint`        | `#64748B` |
| `--line`         | `#1E293B` |
| `--hover`        | `#1E293B` |
| `--control-line` | `#475569` |
| `--mark`         | `#1E293B` |
| `--accent`       | `#3B82F6` |
| `--accent-deep`  | `#60A5FA` |
| `--accent-ink`   | `#93C5FD` |
| `--blocked`      | `#FB7185` |
| `--clear-ink`    | `#34D399` |
| `--amber-dot`    | `#FBBF24` |

A wall pill keeps its category tint, and the dark set lowers its surface to a 12 % wash and
lightens its ink to a 300-level tone.

## States

The theme control is a 32 px icon button in the block page header. It shows the theme that a press
moves to: a moon while the page is light and a sun while it is dark. The settings page offers all
three choices as one segmented control, and the stored choice is the pressed segment.

Every row and the switch answer the pointer. A hovered result row takes `--hover` under a
`--control-line` edge. A quiet footer control takes `--line-soft` under the pointer, and its text
takes `--ink`; the outlined `Go back` takes `--hover` and a `--control-line` edge. The switch
takes an `--accent-ring` halo, and its track deepens to `--control-line` when it is off and to
`--accent-deep` when it is on, so the white knob never carries the state alone. A link is underlined, and it takes `--accent-deep` on hover. The focus ring stays
`--accent`, 2 px wide, at a 2 px offset.

The options page draws the same 16 px checkbox in the walls table and the reading rows. It has a
4 px radius, a `--control-line` edge, and the accent with a white check when it is on. A cell that
the list cannot hold carries a dashed square instead of a box, so the reader sees that the choice
does not exist rather than that it is off. `Clear cache` is an outlined button that takes
`--hover` and a muted edge under the pointer, and a `remove` link turns `--blocked`.

The popup names the verdict of the page in colour as well as in words: the site the list carries
takes `--accent-ink` and the site it does not takes `--muted`.

The toolbar shows what the guard will do with the page in front of the reader. It carries the
coloured route when the guard will stop the page, and the faint route on a page that Detour lets
load, which is a page that is not listed, a page whose walls are all switched off, and a site that
the reader allowed. It takes the gray mark while Detour is off. A block page answers for the
article it stopped, so the signal stays while the routes are on the page. The title names the
outcome: `Detour will stop this page on <domain>`, and `Detour will not stop this page on
<domain>`.

A wall is one pill on the block page and in the popup: the category at 600, a middot, and the
type in the same tint at 85 % opacity. The pill takes the tint of its category, a 999 px radius,
and 4 px by 10 px of padding. The block page sets it to 12 px and the popup to 11 px. The pills
wrap rather than clip, and the sentence that judges an ad-blocker wall follows them in ink.

On the block page the pill is a button. It ends with a 10 px caret, and a press opens one
description under the pills, with the category and the type and one sentence about each. The
hint at the end of the row reads `Click a badge for details`, and a second press closes the
description. The popup keeps the pill a word, because it has no room for the description.

Every result row has the same shape: a 36 px tile, the title, the description, and the domain. The meta line closes with the match that the analysis gave, after the wall verdict, with a faint middot between them: `Same story`, `Same event`, `Same topic`, or `Different story` at 11.5 px in `--muted`. A row the analysis could not place carries no label.
The answer's page image is not drawn. The search card closes a results list. It is a result card with a 36 px magnifier tile on
`--line-soft`, the fallback heading at 14 px, the last number in a 20 px key cap, and a 28 px
arrow; a phone drops the number and the arrow. The engine digits, Enter, and the query key are
named in one line under the box, at 11 px in `--faint` with the key caps of the line under the
list. The four engines are chips
with the 20 px key cap of a result row, which takes the accent edge and text with the chip, and
the chosen engine carries the accent edge and the halo. A row whose
site the list does not carry closes its meta line with a 12 px circle check and `No walls` in
`--clear-ink`.
A result row ends with its number in a 20 px key cap and a 28 px arrow on a `--line-soft` tile.
The arrow turns to `--accent` and moves a pixel up and right under the pointer, the row title
takes `--accent-ink`, and the key cap takes an `--accent-line` edge and `--accent-ink` text, so
the shortcut reads with the row it belongs to. The meta line is one centred flex row, so the
`No walls` badge and the match label sit on the line of the domain. The popup
drops the match label, because its rows stay one line in 340 px.

The line under the routes ends with the story of the article in `--muted`, at
11 px: `Topic: <story>`, at most 55 % of the line and with an ellipsis when the
story is longer. The keys stay at the near end, and an answer without a story
leaves the line as the keys alone. A selected row carries an `--accent` edge and an `--accent-ring` halo,
and the open fallback box takes the same halo as the last stop of the keyboard.

The source address is text, not a link: the host is ink, the path is grey, and the only way to
the site is the control in the card foot. The title of the page is 13 px ink, the description
is 12.5 px `--body` and takes two lines at most, and a quiet 24 px copy control sits at the
end of the address. The tile is the 36 px tile of a result row, at the top of the card and
not centred against its text: the icon of the page when the reader allows publisher icons, and
otherwise one letter on the colour of the domain.
The header names the wall count in 12 px muted text after a 1 px hairline, with a 6 px amber dot.
The open wall is a white block under the pills: a 14 px category icon, the category at 12.5 px in
ink, a type badge at 10 px uppercase with a 6 px dot, the checked date at 11 px in `--muted`, the
site's note at 12 px, and a right-aligned report link with a 12 px flag. The badge takes the type
tint: hard is rose, soft is blue, and metered is amber.
The card foot is the action bar: an outlined `Go back` with a left arrow and an `Esc` key cap at
the left end, and a quiet `Open <site> anyway` with a right arrow beside a quiet scope selector
with a shield and a caret at the right end. The selector starts on the choice that the reader kept
for the domain, `This tab` at first; its radio menu chooses a scope, and a check marks the chosen
one. A press on a scope only chooses; the main button applies it. The caret opens the four scopes
above the control. The privacy note and the report link move under the card, centred on two lines,
so the card ends with the actions.

## Type

The product carries one family. A page title, a headline, a section label, and body text differ in
size and weight, not in face. The block page headline is 23 px and drops to 21 px below 520 px.

| Role            | Size                          | Weight           | Tracking |
| --------------- | ----------------------------- | ---------------- | -------- |
| Page title      | 23 px                         | 600              | -0.02em  |
| Headline        | 23 px, and 21 px below 520 px | 600              | -0.02em  |
| Section label   | 12.5 px, uppercase            | 600              | 0.06em   |
| Source address  | 12.5 px mono                  | 600 for host     | —        |
| Source title    | 11.5 px, muted                | 400              | —        |
| Row title       | 14 px                         | 600              | -0.01em  |
| Row description | 13 px                         | 400              | —        |
| Row domain      | 11.5 px mono                  | 500              | —        |
| Count pill      | 11 px mono                    | 500              | —        |
| Row number      | 10.5 px mono                  | 500              | —        |
| Key hint        | 11 px                         | 400              | —        |
| Wall pill       | 12 px, and 11 px in the popup | 600 for category | —        |
| Judgement       | 14 px, in ink                 | 400              | —        |
| Popup row       | 13.5 px                       | 600              | —        |
| Report link     | 11.5 px                       | 400              | —        |
| Settings label  | 12 px, uppercase              | 600              | 0.06em   |
| Wordmark        | 13.5 px                       | 600              | -0.01em  |

The interface family is
`'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif`.
The extension bundles the latin subset of the variable Inter as `inter.woff2`; the public site loads
the same face from Google Fonts.
The domain is set in
`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`.
The corner radius is 16 px for a card, 12 px for a row or the source card, and 8 px for a control.
The public site uses the same family and the same radius, and the same test compares them.

## Sizes

| Part             | Size                                                           |
| ---------------- | -------------------------------------------------------------- |
| Block page card  | 664 px at most, on a 24 px dot canvas                          |
| Options card     | 640 px at most, on the same canvas                             |
| Content area     | 24 px by 28 px of padding, and 20 px below 520 px              |
| Header strip     | 24 px mark, 14 px by 28 px of padding, a hairline under it     |
| Theme button     | 32 px square, with a 16 px icon                                |
| Source card      | 16 px of padding, a 12 px radius, a hairline and a sunken fill |
| Row tile         | 36 px square                                                   |
| Result row       | 14 px of padding, a 12 px radius, a hairline                   |
| Row number       | 20 px key cap, in a 28 px arrow tile beside it                 |
| Card footer      | 14 px by 28 px of padding, a hairline above it                 |
| Footer buttons   | 7 px by 10 px of padding, an 8 px radius, a 15 px icon         |
| Esc key cap      | 18 px by 17 px, a 4 px radius, 10 px mono                      |
| Under-card note  | 664 px at most, 14 px under the card                           |
| Popup            | 340 px wide, with 46 px rows and a 52 px header                |
| Reading checkbox | 16 px square, with a 4 px radius                               |
| Wall pill        | 4 px by 10 px of padding, and 3 px by 8 px in the popup        |
| Wall icon        | 12 px, and 11 px in the popup                                  |
| Key cap          | 17 px high, a 4 px radius, 10 px mono                          |
| Wall detail      | 12 px of padding, an 8 px radius, a white block                |
| Type badge       | 10 px uppercase, a 4 px radius, a 6 px dot                     |
| Theme segments   | 12 px labels in a 3 px inset control                           |

Below 520 px the headline drops to 21 px, the source card and the open control stack, the
description drops out, the row numbers and arrows drop out, and the key hint drops out.

## License

The mark was drawn for the project, and it carries no third-party licence and no attribution
requirement. The geometry in `scripts/icons.ts` is the whole source, and the product ships with no
attribution link on a page, in the store listing, or in the source.

The Inter font is under the SIL Open Font License, Version 1.1. The licence text ships beside the
font as `packages/extension/src/inter-OFL.txt` and in the release package.

- **Drawn**: 2026-11-27

The record of the mark stays with the project. A replacement mark needs its own record here before
a page loads it.
