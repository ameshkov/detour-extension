# Store

This directory holds what the Chrome Web Store needs: the listing text, the images, the
release package, and the commands that upload and publish it. The only parts outside are
the workflow that runs it and the manifest that it ships.

## What the store takes

| Part    | Fields                                                                                                                                                                                                | How it is set                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Package | `name`, `version`, `description`, `icons`, `permissions`, `host_permissions`                                                                                                                          | `pnpm store:pack` builds the ZIP, and the release workflow uploads it. |
| Listing | Detailed description, category, language, screenshots, store icon, promo tile, homepage, support URL, privacy URL, single purpose, permission justifications, remote code, data usage, content rating | The dashboard, once per item. `store/meta/listing.md` holds the text.  |

The API uploads and publishes. It cannot create an item and it cannot set the listing,
so the first upload and the whole listing go through the dashboard.

## One-time setup

1. Create a Google Cloud project and enable the Chrome Web Store API.
2. Configure the OAuth consent screen as External, then set its publishing status to
   **In production**. A refresh token from an app that stays in Testing expires after
   seven days.
3. Create an OAuth client of type Web application, and add
   `https://developers.google.com/oauthplayground` as a redirect URI.
4. Open the OAuth Playground with your own client, add the scope
   `https://www.googleapis.com/auth/chromewebstore`, and exchange the code. Keep the
   refresh token.
5. Open the dashboard and read the publisher id under Publisher, Settings. It is not the
   item id.
6. Upload version `0.1.0` by hand on the Package tab, fill every field of the Store
   listing tab from `store/meta/listing.md`, and fill the Privacy practices tab. Add the
   images from `store/assets`.
7. Add the secrets to the repository: `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`,
   `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN`. Put them in the environment
   `chrome-web-store`, and require a reviewer for it.

The store created the item with the id `gjmlbmcaklcbificepnkpenfhelngklo`. It is not a secret, and
`store/release.ts` names it in `DEFAULT_ITEM_ID`. Set `CWS_ITEM_ID` only to work on another
item.

The production backend allows this id and the pinned development id
`jcncblagncbpbamfnekhdkomffdpehpk`. A build without the key takes its id from its directory,
and that id is neither of the two, so only a keyed build and the published package speak
with an identity that the backend knows.

The release build drops the `key` field, because a package that carries one is refused.
To give the unpacked development build the published id, copy the public key from the
Package tab into `packages/extension/manifest.json`.

## The listing sheet

`store/meta/listing.json` is the source of every field on the listing and privacy tabs.
`store/meta/listing.md` is generated from it and is what a person pastes:

```bash
pnpm store:sheet
```

`store/listing.test.ts` fails when a field is missing, when the short description is
longer than 132 characters, when the long one passes 16,000, when a permission of the
manifest has no justification, or when the sheet no longer matches the JSON. Edit the
JSON and run the command again.

## The images

| File                                  | Size        | Shows                                                           |
| ------------------------------------- | ----------- | --------------------------------------------------------------- |
| `store/assets/screenshot-block.png`   | 1280 by 800 | The block page with its walls, the source card, and the results |
| `store/assets/screenshot-popup.png`   | 1280 by 800 | The popup at its own width, on the page colour                  |
| `store/assets/screenshot-options.png` | 1280 by 800 | The settings page with its walls table                          |
| `store/assets/tile-440x280.png`       | 440 by 280  | The small promo tile                                            |
| `store/assets/icon-128.png`           | 128 by 128  | The store icon: the tile at 96 px inside 16 px of clear margin  |

```bash
pnpm store:capture
```

The command builds the development extension, starts the dummy server, and draws every
image from the real pages, with the local fixtures as their data. It needs the Chromium
that `pnpm exec playwright install chromium` installs.

One shot of a real article replaces the block page image:

```bash
pnpm store:shot --live=https://www.cnet.com/tech/services-and-software/best-ai-image-generators/
```

It builds the development extension against the production backend, stops that page, and
waits for the real answers. The run uses the development build, because the development id
is one of the two ids that the backend allows, and a build without the key has neither.

The PNGs are committed, and a test checks their size.

## The release

```bash
pnpm store:pack
pnpm store:status
pnpm store:publish
pnpm store:publish --mode=live
pnpm store:publish --mode=none
pnpm store:publish --dry-run
```

- `store:pack` runs the release build, checks it, and writes
  `store/dist/detour-<version>.zip`. The check refuses a development build, a stray file,
  an icon of the wrong size, and a file that the build did not write.
- `store:status` prints the published version, the revision that the store holds, and
  the last upload state.
- `store:publish` uploads the ZIP and stages it for publishing after review.
- `--mode=live` submits it for review at once, and the store publishes it when it passes.
- `--mode=none` uploads without a submission, so a person can submit from the dashboard.
- `--dry-run` reads the status and stops before the upload.

The run names the item id `gjmlbmcaklcbificepnkpenfhelngklo`. `CWS_ITEM_ID` overrides it.

The run compares the manifest version with every version that the store published, and it
stops when the version is not higher. It also stops when the item is taken down or
warned, when another revision is under review or staged, when the last submission was
rejected or cancelled, and when a tag names another version.

Raise the version in `packages/extension/manifest.json` before every release. A version
that is already under review cannot be replaced, and a cancelled submission needs the
dashboard.

## The workflow

`.github/workflows/publish.yml` runs two ways:

- A push of a `v*` tag packs the ZIP and keeps it as an artifact. It does not upload.
- A manual run takes a mode and publishes from the `chrome-web-store` environment, which
  asks a reviewer for approval. It runs `pnpm check` first.

Both runs need the four secrets above. Without them the workflow fails before it reaches
the store.

## Before the first upload

- The privacy policy address must load for a signed-out browser. `docs/privacy.md` is the
  source, and the site in `website/` publishes it at `privacy.html` on GitHub Pages. Set
  the Pages source to GitHub Actions once, and the workflow does the rest.
- The policy must name the search provider of the production deployment. The text in
  `docs/privacy.md` says it is a setting of the deployment.
- The listing must offer consent before the first request that carries a page address.
  The block page explains the request, and a review may ask for an affirmative control.
- The icon licence carries its purchase date in `docs/brand.md`.
