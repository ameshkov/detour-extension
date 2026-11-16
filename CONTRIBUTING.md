# Contributing

The site list is editorial data. A wrong entry is a product defect, so every entry carries
evidence from a check by hand.

## Add a site

Add an entry to `sites/sites.yaml` with these fields:

```yaml
sites:
  - domain: example.com
    name: Example
    wall: hard
    paths: []
    note: A wall that replaces the article for readers who use an ad blocker.
    verified: 2026-11-12
    evidence: sites/evidence/example.com.md
```

- `domain` is the registrable domain. It carries no `www.` prefix, no scheme, no path, and no
  port.
- `name` is the publisher name, as the block page shows it.
- `wall` is `hard`, `soft`, or `metered`. `hard` replaces the article, `soft` covers it, and
  `metered` limits the number of articles.
- `paths` holds path globs. An empty list covers the whole site.
- `note` is one sentence on what a reader sees.
- `verified` is the date of your check.
- `evidence` is the path of the evidence file.

A domain appears once. It is also absent from the global `avoid` and `prefer` lists.

Then run `pnpm list:build` to validate the list and refresh
`packages/extension/src/sites.json`.

## The evidence file

Create the file that `evidence` names. It sits under `sites/evidence/` and ends with `.md`.
Start from this template:

```md
# <Publisher name>

- Domain: <registrable domain>
- Checked: <YYYY-MM-DD>
- Page: <the URL that you checked>
- Method: <what you did and what you saw>
- Wall: <hard, soft, or metered>
- Limitation: <what this check does not establish>

<One paragraph on what appeared, on the method, and on the parts that you did not check.>
```

The template has these rules:

- The `- Checked:` line holds a date, and that date equals `verified`.
- The `- Page:` line names one URL, and every other line describes that URL.
- The `- Method:` line says how you checked the page and what you saw.
- The `- Limitation:` line says what the check does not establish.
- The file holds at least 200 characters.

Check the page in a browser with an ad blocker on, and record what appeared. Use `hard` when
the wall replaces the article, `soft` when an overlay covers it, and `metered` when the wall
limits the number of articles.

### Prototype exception

The four seed entries are user-authorized placeholders for the prototype. Each one carries a
placeholder `wall` type and unverified coverage, because its evidence file states a
limitation that denies the wall it names. Keep the four as they are. Do not add an entry that
is not checked by hand, and replace the four with observed entries before a release.

## The local overlay

`sites/sites.dev.yaml` carries the one local entry, `127.0.0.1`, which covers the fixture site
server under the path glob `/walled/*`. The entry is not a publisher, and it never enters
`sites/sites.yaml`.

`pnpm list:build` reads `sites/sites.yaml` alone and writes the release list: four sites, with no
local entry. `pnpm list:build:dev` reads both files, appends the overlay entries to the release
entries, keeps the release `version`, `disabled`, `avoid`, and `prefer`, and sets `updated` to the
latest of the release date and every overlay `verified` date. Both commands write
`packages/extension/src/sites.json`.

An overlay entry follows the same rules as a release entry: a checked date, an evidence file
under `sites/evidence/`, a unique domain, and a note on what a reader sees. An overlay domain
that repeats a release domain is a duplicate, and the build refuses the merged list. A publisher
never enters the overlay.

## Remove a site

1. Add one to `version` in `sites/sites.yaml`.
2. Remove the entry.
3. Remove its evidence file.
4. Run `pnpm list:build`.

## Review

A change needs a checked date, a reachable evidence file, and a note that describes the wall.

- The checked date equals `verified`.
- The evidence path resolves to a file that holds the rules above.
- The note says what a reader sees, in one sentence, and it does not moralize.
- The domain is unique, and it is absent from `avoid` and `prefer`.

## Documentation

A change updates its document in the same pull request. Six triggers need this:

1. A change to behavior.
2. A change to a command.
3. A change to an endpoint.
4. A change to a storage key.
5. A change to a user-visible string.
6. A change to data handling.
