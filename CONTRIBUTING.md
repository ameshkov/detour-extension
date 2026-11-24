# Contributing

This repository holds the Detour extension, its shared list contract, and the
local dummy backend. The site list is editorial data, and it lives in the
[detour-list](https://github.com/ameshkov/detour-list) repository.

## The site list

Do not add or remove a publisher here. An entry enters or leaves the list in
`detour-list`, which holds the schema, the evidence rule, and the generated
reference at `docs/list-format.md`.

This repository bundles a copy of that artifact, because a worker with no
stored list needs a list to read. To update the copy:

1. Build the list in `detour-list` with `pnpm list:build`.
2. Run `pnpm list:sync` here. It fetches `dist/sites.json` at `master` from the
   detour-list remote, so a local checkout is not needed.
3. Run `pnpm list:build` and commit `sites/sites.release.json`.

Never edit `sites/sites.release.json` by hand, and never edit
`packages/extension/src/sites.json`: the build writes it.

## The local overlay

`sites/sites.dev.yaml` carries the one local entry, `127.0.0.1`, which covers
the fixture site server under the path glob `/walled/*`. The entry is not a
publisher, and it never enters the release artifact.

`pnpm list:build` writes the release list alone. `pnpm list:build:dev` appends
the overlay entries and writes the same output. An overlay domain that repeats
a release domain is a duplicate, and the build refuses the merged list.

## The extension

- Write the test first. Watch it fail for the stated reason, then write the
  code.
- Run `pnpm check` before you report the change as done. It runs the list build,
  the type check, the lint, the format check, the document checks, and the
  tests.
- Keep the bundle small. The extension declares one dependency,
  `@detour/shared`.

## Review

- The list artifact copy matches its source, and `pnpm list:build` passes.
- A behavior change carries a test that names the behavior.
- A user-visible string lives in `copy.ts`, not in a page.
- The storage envelope keeps its version, and a change to the shape of the
  stored list raises `LIST_STORAGE_VERSION`.

## Documentation

A change updates its document in the same pull request. Six triggers need this:

1. A change to behavior.
2. A change to a command.
3. A change to an endpoint.
4. A change to a storage key.
5. A change to a user-visible string.
6. A change to data handling.
