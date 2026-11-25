# Store listing

The dashboard takes these values once per item. This file is generated from
`store/meta/listing.json` by `pnpm store:sheet`, so edit the JSON and run
that command again. The `Assets` section of `store/README.md` names the images
that go with it.

## Store listing

- Name: `Detour`, 6 of 75 characters
- Summary: `Stops a visit to a publisher that walls readers who use an ad blocker, and shows the same story elsewhere.`, 106 of 132 characters
- Category: `News & Weather`
- Language: `en`
- Homepage: https://github.com/ameshkov/detour-extension
- Support: https://github.com/ameshkov/detour-extension/issues

## Detailed description

```text
Detour stops a story that a publisher walls from readers who use an ad blocker, and it shows the same story from publishers that do not.

Many sites refuse the article when they detect an ad blocker. The page asks you to turn the blocker off or to pay. Detour recognizes that wall, stops the page before it draws, and looks for the same story elsewhere. You choose where to read it.

What it does

- Finds an ad-blocker wall on a list of publishers that use one.
- Shows the same story from other publishers, with the title, the publisher, and a short description.
- Opens a result from any part of its row.
- Names the walls a publisher uses: ad blocker, paywall, hard, soft, or metered.
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

## Privacy practices

### Single purpose

```text
Detour stops a visit to a publisher that walls a story from readers who use an ad blocker, and it shows the same story from publishers that do not. It does nothing else.
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
