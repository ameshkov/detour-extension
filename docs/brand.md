# Brand

Detour is the working name of the extension. This page holds its name, its mark, its wordmark,
its palette, its type, its sizes, and its licence. Both the extension pages and the store listing
draw from this page.

## Name

Detour is a working name. The final name needs a decision from the owner before the release, and
one change replaces it here, in the page titles, in the copy module, and in both manifests.

## Mark

The mark is the icons8 roadblock glyph in the Windows 11 filled style, icon id `qUNTz1twfA8O`. The
glyph is recoloured to one white colour and set on a rounded tile in `#0B6B57`. It was chosen
from three candidates for its clarity at 16 px, the size the browser toolbar shows.

The three pages ship the mark as `packages/extension/src/logo-mark.png`, inside the accent tile of
the header:

| Page         | Image size | Tile size |
| ------------ | ---------- | --------- |
| Block page   | 15 px      | 24 px     |
| Options page | 15 px      | 24 px     |
| Popup        | 12 px      | 20 px     |

The image is white on the tile, and the sheet makes it white with
`filter: brightness(0) invert(1)`.

The manifest carries the same tile as `icon-16.png`, `icon-32.png`, `icon-48.png`, and
`icon-128.png`, so the toolbar button and the extensions page show the mark of the header. The
icon is the whole tile and not the bare glyph, because the browser draws it on a surface the page
does not control.

The mark never appears inside the explanation. It marks the product in a header and in the
toolbar, and it marks nothing else.

## Wordmark

- **Typeface**: the interface sans, `-apple-system, "Segoe UI", system-ui, sans-serif`
- **Weight**: 650
- **Letter spacing**: -0.01em
- **Size**: 14 px on the block page, and 12.5 px in the popup

The sheet sets the wordmark in `ui.css`, and this page and the sheet carry the same tracking
value. The block page, the popup, and the options page write the wordmark as text, so no image
carries it.

## Asset set

| Asset                                            | Ships   | Location                                               |
| ------------------------------------------------ | ------- | ------------------------------------------------------ |
| Page mark, PNG                                   | Now     | `packages/extension/src/logo-mark.png`                 |
| Manifest icon set, PNG at 16, 32, 48, and 128 px | Now     | `packages/extension/src/icon-16.png` to `icon-128.png` |
| Store tile, 440 by 280 px                        | Release | The store listing                                      |
| Source SVG, one colour                           | Release | `packages/extension/src/assets/logo/`                  |

The page mark is the only image that the pages load. The manifest icon set is the tile of the
header at four sizes, and the manifest names those four files. The store tile and the source SVG
stay with the release.

## Palette

The sheet declares every colour once, on `:root`, and no other colour is written in it. Prettier
lowercases each hexadecimal value in the sheet, so `ui.css` holds `#fbfaf8` where this table
holds `#FBFAF8`. The two spellings are one colour.

| Token              | Value     | Use                                                                    |
| ------------------ | --------- | ---------------------------------------------------------------------- |
| `--paper`          | `#FBFAF8` | The page background                                                    |
| `--surface`        | `#FFFFFF` | Cards and rows above the paper                                         |
| `--ink`            | `#16161A` | Body text and the headline                                             |
| `--muted`          | `#6E6C67` | Secondary text                                                         |
| `--line`           | `#E8E4DD` | Card borders                                                           |
| `--line-soft`      | `#F0ECE5` | Dividers inside a list, an action row, or a section                    |
| `--control-line`   | `#DED9D0` | The border of a quiet control, such as a pause button or a query field |
| `--accent`         | `#0B6B57` | The mark tile, the focus ring, and the primary tone                    |
| `--blocked`        | `#C0513F` | The dot of the site chip                                               |
| `--chip-ink`       | `#96382E` | The text of the site chip                                              |
| `--chip-surface`   | `#FCF0ED` | The background of the site chip                                        |
| `--chip-line`      | `#F0D9D3` | The border of the site chip                                            |
| `--notice-ink`     | `#6B5322` | The text of a notice                                                   |
| `--notice-surface` | `#FDF6E7` | The background of a notice                                             |
| `--notice-line`    | `#EFDFBC` | The border of a notice                                                 |

The tile of a result row takes one colour from a fixed set of nine, chosen by the domain, so the
same domain keeps the same tile. Its letter is white on that colour:

`#1F2937`, `#2F4A6D`, `#3B2F63`, `#0B6B57`, `#5C3B2E`, `#44403C`, `#4A2F3D`, `#1B3A5C`,
`#2E4A2A`.

The tile shows the favicon of the publisher when the answer carries one: the 16 px icon fills the
24 px tile, and the generated colour and letter stay behind it as the fallback. The letter is the
stand-in, so a row without a favicon reads the same as before.

Body text is at least 4.5:1 against its background.

## Type

The table gives the block page sizes. The popup sets the wordmark to 12.5 px.

| Role          | Family | Size                            | Weight                 | Tracking |
| ------------- | ------ | ------------------------------- | ---------------------- | -------- |
| Headline      | Serif  | 33 px, and 24 px below 520 px   | 600                    | -0.02em  |
| Source title  | Serif  | 17 px                           | 600                    | -0.01em  |
| Hero title    | Serif  | 18.5 px                         | 600                    | -0.015em |
| Row title     | Sans   | 14.5 px                         | 600                    | -0.006em |
| Practice line | Sans   | 15 px                           | 400                    | —        |
| Explanation   | Sans   | 15 px, in ink                   | 550                    | —        |
| Row meta      | Sans   | 12.5 px                         | 400, the domain at 550 | —        |
| Wordmark      | Sans   | 14 px, and 12.5 px in the popup | 650                    | -0.01em  |

The display family is `ui-serif, Georgia, "Iowan Old Style", serif`. The interface family is
`-apple-system, "Segoe UI", system-ui, sans-serif`. The corner radius is 12 px.

## Sizes

| Part              | Size                                              |
| ----------------- | ------------------------------------------------- |
| Block page header | 52 px tall, with 28 px of horizontal padding      |
| Popup header      | 46 px tall, with 15 px of horizontal padding      |
| Options header    | 52 px tall, with 22 px of horizontal padding      |
| Main column       | 700 px at most, with 40 px 28 px 26 px of padding |
| Source card       | 12 px of padding and a 1 px `--line` border       |
| Hero image        | 216 by 122 px                                     |
| Row tile          | 24 px square                                      |
| Row thumbnail     | 96 by 60 px                                       |
| Popup             | 340 px wide                                       |
| Options page      | 640 px at most                                    |

Below 520 px the headline drops to 24 px, the row thumbnails drop out, and the hero image stacks
above its text.

## License

The mark requires a paid icons8 licence, whose purchase is pending. The product ships with
no attribution link on a page, in the store listing, or in the source.

- **Purchase date**: pending

The release cannot be prepared until a date replaces that word. A licence review asks for the
date and the invoice, and this page is where the date lives.

The project does not yet hold that licence. A replacement mark needs its own record here
before a page loads it.
