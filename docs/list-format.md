# Site list format

Generated from the schema. Do not edit by hand. Run pnpm docs:generate after a schema change.

## Top level

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| version | integer | yes | The list version, an integer of 1 or more that increments on every list change. |
| updated | string | yes | The calendar date of the last change. It is not before any verified date. |
| disabled | boolean | no | Stops blocking for every reader without an extension release. |
| avoid | array of object | no | Domains removed from results for every source. |
| prefer | array of object | no | Domains that score 1 for every source in the ranking. |
| sites | array of object | yes | The listed publishers, at least one. |

## Site entry

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| domain | string | yes | The registrable domain of the publisher. |
| name | string | yes | The publisher name, as the block page shows it. |
| wall | hard \| soft \| metered | yes | The kind of wall. hard replaces the article, soft covers it, and metered limits the number of articles. |
| paths | array of string | no | Path globs. An empty list covers the whole site. |
| note | string | yes | One sentence on the wall, from 1 to 200 characters. |
| verified | string | yes | The calendar date of the hand check. |
| evidence | string | yes | The evidence document under sites/evidence/, ending with .md. |
| avoid | array of object | no | Domains removed from results for this site, merged with the global avoid list. |
| prefer | array of object | no | Domains that score 2 for this site in the ranking; a global prefer domain scores 1. |

## Domain entry

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| domain | string | yes | The domain that the ranking uses. |

## Path globs

- An empty `paths` list matches every path.
- `*` matches zero or more characters except `/`.
- `**` matches zero or more characters including `/`.
- Every other character is literal.
- A glob matches the whole path.
- The path is the URL pathname, with no query and no fragment.
- The comparison is case sensitive.
- A glob starts with `/` and holds no whitespace, `?`, or `#`.

## Validation

- A site domain is unique across the list.
- A domain carries no `www.` prefix, scheme, path, or port.
- A site domain is absent from the global `avoid` and `prefer` lists.
- The evidence file exists, holds at least 200 characters, and carries a `- Checked: <YYYY-MM-DD>` line that equals `verified`.
- `updated` is not before any `verified` date.
