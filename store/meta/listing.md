# Store listing

The dashboard takes these values once per item. This file is generated from
`store/meta/listing.json` by `pnpm store:sheet`, so edit the JSON and run
that command again. The `Assets` section of `store/README.md` names the images
that go with it.

## Store listing tab

Paste these on the Store listing tab of the dashboard.

- Name: `Detour`, 6 of 75 characters
- Summary: `Stops a page walled by an ad blocker, a paywall, a sign-in, a region check, or an age check, and shows the same story elsewhere.`, 128 of 132 characters
- Category: `News & Weather`
- Language: `en`
- Homepage: https://github.com/ameshkov/detour-extension
- Support: https://github.com/ameshkov/detour-extension/issues

## Detailed description

```text
Detour stops a story that a publisher walls, and shows the same story from publishers that do not.

A wall is any refusal of the article: an ad-blocker wall, a paywall, a registration prompt, a consent dialog, a region check, a VPN check, or an age check. The list records the walls that a publisher uses, and each wall has a type: hard, soft, or metered. The default stops the ad-blocker wall, the one that meets a reader who installed nothing but a blocker.

What it does

The toolbar icon carries a coloured route on a page that Detour will stop, a faint route on a page it lets load, and a gray mark while Detour is off.

- Names every wall that the list records for a site, on the block page and in the popup.
- Shows the same story from publishers that do not wall it, with the title, the publisher, and a short description.
- Opens a result from any part of its row.
- Stops a page only for the walls that you chose, one row per kind of wall and one column per type.
- Opens the site anyway, for this tab only, or never, and remembers the choice.
- Keeps the list and the last answers on the device, so the block page draws at once.

What it does not do

- No account, and nothing to sign in to.
- No ads, no analytics, and no tracking.
- It does not read the article.
- It does not remove a wall, unlock a paywall, or sign in for you. It shows another publisher that carries the same story.

How it works

When Detour stops a page, it sends the address and the title of that page to the Detour service. The service searches for the same story and returns links. It keeps one answer per article for 30 days, and every reader of that article gets the same answer. The privacy policy states what leaves the browser and what the service keeps.

The list of publishers lives in a separate repository, so a wall can be added or removed without an extension update. You can report a missing wall from the block page.
```

## Privacy practices tab

Paste these on the Privacy practices tab of the dashboard. The single purpose
description is the first field of that tab.

### Single purpose description

```text
Detour stops a visit to a publisher that walls a story, whatever the wall, and shows the same story from publishers that do not. It does nothing else.
```

### Remote code

```text
No. Every script ships in the package, and the extension never evaluates a string and never loads a script from the network.
```

### Privacy policy

https://ameshkov.github.io/detour-extension/privacy.html

### Data usage

Tick these data types:

- `personallyIdentifiable`: clear
- `health`: clear
- `financial`: clear
- `authentication`: clear
- `personalCommunications`: clear
- `location`: clear
- `webHistory`: ticked
- `userActivity`: clear
- `websiteContent`: ticked

### Certifications

- `notSoldToThirdParties`: ticked
- `notUsedForUnrelatedPurposes`: ticked
- `notUsedForCreditworthiness`: ticked

### Mature content

No

## Permission justifications

### `alarms`

The extension refreshes its site list from the backend every six hours. An alarm wakes the service worker for that refresh, because Chrome stops an idle worker.

### `storage`

The extension keeps your settings, your allowances, the site list, and the cached answers in chrome.storage. All of it stays in the browser.

## Host permission justifications

### `*://*/*`

The guard runs at document_start on every page to decide whether the list walls it. That decision needs the page address, and a content script cannot read the address of its own page without this permission. The guard reads no page content and draws nothing.

### `https://detour-api.meshkov.info/*`

The extension sends the address and the title of a page that it stops to this one backend, and it reads the site list and the result images from the same origin. The manifest names the origin that this build uses.
