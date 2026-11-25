# Privacy

Detour is a Chrome extension and a backend service. The extension stops a page
that puts a wall in front of a story, for the walls that you chose, and the
backend finds the same story on a publisher that does not. This page states what the two of them do
with your data.

## What leaves your browser

When you open a page that Detour stops, the extension reads the metadata of
that page and sends the URL and the title to the backend. The block page
gives the URL and the title to the extension's own background service, which
adds the fixed language value `en` and posts the request. The request for the
metadata carries no cookie. The description of the blocked page stays on the
device and is never part of that request. The backend builds a search query
from the title and the URL. Nothing else about the page, and nothing about the
rest of your browsing, leaves the browser.

The policy took effect on 2026-11-25. Questions and requests go to the project's
issue tracker at https://github.com/ameshkov/detour-extension/issues.

The extension asks the backend for the site list as well. That request
carries no page and no reader, and the answer is the same list for everyone.

The walls that stop a page, and the other settings of the extension, stay in
the browser's local storage. They never leave the device, and the backend
receives nothing about the choices you made.

## When you choose a search engine

When Detour finds no alternative, or when the search fails, the block page
offers the query on four search engines: DuckDuckGo, Brave, Google, and Bing.
Nothing is sent to any of them while the page waits. The query stays in the
page until you press an engine, and you can edit it first. A press opens a new
tab on that engine, and the engine then receives the query under its own
policy. Detour sends nothing to the engine itself, and it sets no referrer.

## Reporting a problem

The block page carries a `Report a problem` link, and the popup carries the
sentence `If you see a wall here, report it.` as a link, which it shows for a
site the list does not carry. Each one opens a new issue form on the project's
GitHub page, with the list identifier and the extension version already in the
body. The block page's link adds the address of the page that Detour stopped,
and the popup's link adds the address of the page in front of the reader. GitHub receives that text when the form opens.
You can read and edit it before you post, and no issue exists until you press
the button that creates it.

## What the backend keeps

The backend keeps one entry per article URL, and every reader of that article
gets the same entry. An entry holds the query, the search provider, and the
alternatives that the search returned. The service keeps an answer for 30
days, and it keeps an empty answer for 1 day so that a repeat visit does not
spend another search. The deployed service counts its searches for the current
day in UTC, and that count is not tied to a reader, a browser, or an IP
address.

The local dummy server keeps no data. It answers saved results, and it writes
no file and no record.

## The search provider

The backend sends the cleaned title as the query to its search provider. The
provider is a setting of the deployment. Detour stores the query as described
above, and the provider's own retention policy also applies. The query holds
the article title and words from the article URL and nothing about you.

## Images

An alternative can carry the page image of the result. The backend reads the
`og:image` tag of the result page. The image link in an answer points at the
backend, not at the publisher. The block page appends that image to the
alternative's row as the row renders, so the backend fetches the image from
the publisher and sends the bytes to you then. Your browser makes no request
to the publisher, and the link is signed but not tied to you.

An alternative can carry the favicon of the publisher too. It is the same
arrangement: the link points at the backend, which fetches the icon and sends
it with the answer's signature. The block page reuses it as the row tile, and
the row keeps its letter tile when the answer carries no favicon, when the
favicon fails, or when you turned images off. The favicon says which publisher
a row comes from, and it tells the publisher nothing.

The source card loads no image. Detour separately requests the blocked page
for metadata without cookies.

## Limited use

Detour uses the data that leaves your browser for one purpose: to find the same
story on a publisher that does not wall it. It does not use that data for
advertising, it does not sell it, and it does not use it to decide
creditworthiness or eligibility for credit. The backend keeps one answer per
article, and it keeps no record per reader.

## What we do not do

We do not create an account, and there is nothing to sign in to.

We do not set a cookie, and the backend stores no per-user record.

We do not sell data, and we do not share it with an advertiser.

We do not read the content of a page beyond its metadata, and the metadata is
the page that you asked to read and the result pages that the backend reads.

We do not keep a log line that names a URL.
