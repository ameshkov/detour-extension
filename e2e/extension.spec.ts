import {
  BLOCK_PAGE,
  SITE_ORIGIN,
  expect,
  extensionId,
  openNativePopup,
  openPopupOver,
  test,
  waitForBlockPage,
} from './fixtures';

const LISTED_URL = `${SITE_ORIGIN}/walled/nvidia-custom-silicon`;
const EMPTY_URL = `${SITE_ORIGIN}/walled/empty-state`;
const SLOW_URL = `${SITE_ORIGIN}/walled/slow`;
const FAILING_URL = `${SITE_ORIGIN}/walled/fail`;
const OPEN_URL = `${SITE_ORIGIN}/open/article`;
const REDIRECT_URL = `${SITE_ORIGIN}/walled/redirect-to-open`;
const UNLISTED_URL = `http://forbes.test:${new URL(SITE_ORIGIN).port}/open/article`;

const WALLED_TITLE = "Nvidia's next move: custom silicon for its biggest customers";
const NORMAL_TITLE = 'The fixture article that is not walled';

test('blocks the listed fixture article and shows a signed result image', async ({
  context,
  page,
}) => {
  await waitForBlockPage(page, LISTED_URL);

  await expect(page).toHaveURL(BLOCK_PAGE);
  await expect(page.locator('[data-role="headline"]')).toContainText('Local fixture');
  await expect(page.locator('[data-role="headline"]')).toContainText('two walls');
  await expect(page.locator('[data-role="wall-status-text"]')).toHaveText('2 walls detected');
  await expect(page.locator('[data-role="wall-status-dot"]')).toBeVisible();

  const pills = page.locator('[data-role="wall"]');

  await expect(pills).toHaveCount(2);
  await expect(pills.first()).toContainText('Ad blocker');
  await expect(pills.nth(1)).toContainText('Paywall');
  await expect(pills.first().locator('[data-role="wall-icon"]')).toHaveCount(1);

  // The type belongs to the opened detail, not to the pill.
  await pills.first().click();
  await expect(page.locator('[data-role="wall-detail-text"]')).toContainText(
    'ad-blocker card covers the fixture page',
  );
  await expect(page.locator('[data-role="wall-type-badge"]')).toHaveText('Hard block');
  await expect(page.locator('[data-role="wall-verified"]')).toContainText('Verified');
  await expect(page.locator('[data-role="wall-report"]')).toBeVisible();
  await expect(page.locator('[data-role="lede"]')).toContainText(
    'An ad-blocker wall is an anti-user practice',
  );
  await expect(page.locator('[data-role="alternatives"]')).toHaveAttribute('data-state', 'results');
  expect(await page.locator('[data-role="list"] li').count()).toBeGreaterThan(0);

  const rows = page.locator('[data-role="list"] li');
  const favicons = rows.locator('[data-role="tile"] img');

  // The list carries none of the dummy publishers, so every row says so.
  await expect(rows.first().locator('[data-role="result-walls"]')).toHaveText('No walls');

  // The answer names the story and the match of every row, and both reach the page.
  await expect(rows.first().locator('[data-role="result-match"]')).toHaveText('Same story');
  await expect(rows.nth(3).locator('[data-role="result-match"]')).toHaveText('Different story');
  await expect(page.locator('[data-role="keyboard-hint"] [data-role="topic"]')).toHaveText(
    'Topic: Custom silicon for the biggest customers',
  );

  await expect(rows.first().locator('[data-role="tile"]')).toHaveCount(1);
  await expect(favicons).toHaveCount(await rows.count());

  const firstSource = (await favicons.first().getAttribute('src')) ?? '';
  const response = await context.request.get(firstSource);

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');

  // The tile reuses the signed backend link of the answer, never a publisher
  // URL, so the favicon request tells the publisher nothing.
  const sources = await favicons.evaluateAll((images) =>
    images.map((image) => (image instanceof HTMLImageElement ? image.src : '')),
  );

  expect(sources).toHaveLength(await rows.count());

  for (const [index, source] of sources.entries()) {
    const target = new URL(source).searchParams.get('u');
    const domain = await rows.nth(index).locator('[data-role="result-domain"]').textContent();

    expect(source.startsWith(`${SITE_ORIGIN}/v1/img?`), source).toBe(true);
    expect(source).toMatch(/[?&]sig=[0-9a-f]{16}$/);
    expect(target).toBe(`${SITE_ORIGIN}/images/favicon/${domain}.png`);
  }

  await expect
    .poll(async () =>
      favicons
        .first()
        .evaluate((image) => (image instanceof HTMLImageElement ? image.naturalWidth : 0)),
    )
    .toBeGreaterThan(0);
});

test('goes back to the page before the stopped article', async ({ page }) => {
  await page.goto(OPEN_URL);
  await page.evaluate((url) => location.assign(url), LISTED_URL).catch(() => undefined);
  await page.waitForURL(BLOCK_PAGE, { timeout: 20_000 });
  await page.locator('[data-role="alternatives"][data-state="results"]').waitFor();

  await page.locator('[data-role="back"]').click();

  await expect(page).toHaveURL(OPEN_URL);
});

test('keeps the scope menu inside a short viewport', async ({ page }) => {
  await waitForBlockPage(page, LISTED_URL);

  // The list and the source card grow when their answers arrive. Wait for the
  // answer, so the case measures where the foot of the card sits at rest.
  await expect(page.locator('[data-role="alternatives"]')).toHaveAttribute('data-state', 'results');

  // The control sits in the foot of the card, so a short window that is
  // scrolled to the bottom leaves it very little room below and the menu must
  // open above it.
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  const caret = page.locator('[data-role="open-menu"]');

  await caret.click();

  const menu = page.locator('[data-role="scope-menu"]');

  await expect(menu).toBeVisible();

  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  const flippedCaret = await caret.boundingBox();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(flippedCaret).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

  // The menu hangs off the control on whichever side has room. A window this
  // short leaves less than four items below the control, so the menu opens
  // above it, and the gap stays the 6 pixels of the sheet either way.
  const side = await menu.getAttribute('data-side');
  const gap =
    side === 'top'
      ? flippedCaret!.y - (box!.y + box!.height)
      : box!.y - (flippedCaret!.y + flippedCaret!.height);

  expect(side, 'the menu flips above the control in a short window').toBe('top');
  expect(gap).toBeGreaterThanOrEqual(4);
  expect(gap).toBeLessThanOrEqual(9);

  // A press anywhere else closes it, as a menu of the browser does.
  await page.mouse.click(20, 20);
  await expect(menu).toBeHidden();
});

test('lets a listed page load when the reader switches its wall off', async ({ context, page }) => {
  const options = await context.newPage();

  await options.goto(`chrome-extension://${extensionId}/options.html`);

  const adblockHard = options.getByLabel('Ad blocker, hard wall');
  const adblockSoft = options.getByLabel('Ad blocker, soft wall');

  await expect(adblockHard).toBeChecked();
  await adblockHard.uncheck();
  await expect(adblockHard).not.toBeChecked();
  await adblockSoft.uncheck();
  await expect(adblockSoft).not.toBeChecked();
  await expect(options.getByLabel('Paywall, metered wall')).not.toBeChecked();

  await options.close();

  // The fixture also carries a metered paywall, and the reader stops ad-blocker
  // walls alone, so the page loads and its own title is the proof.
  await page.goto(LISTED_URL);

  await expect(page.locator('h1')).toHaveText(WALLED_TITLE);
  await expect(page).not.toHaveURL(BLOCK_PAGE);
});

test('leaves a path outside the listed glob alone', async ({ page }) => {
  await page.goto(OPEN_URL);

  await expect(page).toHaveURL(OPEN_URL);
  await expect(page.locator('h1')).toHaveText(NORMAL_TITLE);
});

test('leaves an unlisted host alone', async ({ page }) => {
  await page.goto(UNLISTED_URL);

  await expect(page).toHaveURL(UNLISTED_URL);
  await expect(page.locator('h1')).toHaveText(NORMAL_TITLE);
});

test('opens the listed article after one tab allowance', async ({ page, worker }) => {
  await waitForBlockPage(page, LISTED_URL);
  await page.locator('[data-role="open-site"]').click();

  await expect(page).toHaveURL(LISTED_URL);
  await expect(page.locator('h1')).toHaveText(WALLED_TITLE);

  const stored = await worker.evaluate(() => chrome.storage.session.get('allowTabs'));

  expect(stored.allowTabs).toHaveLength(1);
  expect(stored.allowTabs?.[0]?.host).toBe('127.0.0.1');
});

test('opens the listed article once without an allowance', async ({ page, worker }) => {
  await waitForBlockPage(page, LISTED_URL);

  await page.locator('[data-role="open-menu"]').click();
  await page.locator('[data-role="scope-once"]').click();
  await page.locator('[data-role="open-site"]').click();

  await expect(page).toHaveURL(LISTED_URL);
  await expect(page.locator('h1')).toHaveText(WALLED_TITLE);

  const session = await worker.evaluate(() =>
    chrome.storage.session.get(['allowTabs', 'allowSession']),
  );
  const local = await worker.evaluate(() => chrome.storage.local.get(['allowAlways']));

  expect(session.allowTabs ?? []).toHaveLength(0);
  expect(session.allowSession ?? []).toHaveLength(0);
  expect(local.allowAlways ?? []).toHaveLength(0);

  // The pass opens one navigation, so the next visit meets the wall again.
  await waitForBlockPage(page, LISTED_URL);

  await expect(page).toHaveURL(BLOCK_PAGE);
});

test('takes the open search box back from the arrow keys and picks an engine', async ({ page }) => {
  await waitForBlockPage(page, LISTED_URL);
  await expect(page.locator('[data-role="search"]')).toBeVisible();

  await page.locator('[data-role="search"]').click();

  const engines = page.locator('[data-role="engines"] a');

  await expect(engines.first()).toBeFocused();
  await expect(engines.first()).toHaveAttribute('data-selected', 'true');

  // The focus leaves the box when an engine opens its own tab, and the arrows
  // still lead back to the box as the last stop.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ArrowUp');

  await expect(page.locator('[data-role="fallback"]')).toHaveAttribute('data-selected', 'true');

  await page.keyboard.press('Enter');

  await expect(engines.first()).toBeFocused();
  await expect(page.locator('[data-role="fallback"]')).not.toHaveAttribute('data-selected', 'true');

  // The digits pick an engine inside the box, and the ring names the choice.
  await page.keyboard.press('3');

  await expect(engines.nth(2)).toBeFocused();
  await expect(engines.nth(2)).toHaveAttribute('data-selected', 'true');
  await expect(engines.first()).not.toHaveAttribute('data-selected', 'true');
});

test('closes the search box on escape and reopens it', async ({ page }) => {
  await waitForBlockPage(page, LISTED_URL);
  await expect(page.locator('[data-role="search"]')).toBeVisible();

  await page.locator('[data-role="search"]').click();
  await expect(page.locator('[data-role="engines"] a').first()).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(page.locator('[data-role="fallback"]')).toBeHidden();
  await expect(page.locator('[data-role="fallback-note"]')).toBeHidden();
  await expect(page.locator('[data-role="search"]')).toBeVisible();
  await expect(page.locator('[data-role="search"]')).toHaveAttribute('data-selected', 'true');

  await page.keyboard.press('Enter');

  await expect(page.locator('[data-role="fallback"]')).toBeVisible();
  await expect(page.locator('[data-role="engines"] a').first()).toBeFocused();
});

test('returns to the last alternative from the query field', async ({ page }) => {
  await waitForBlockPage(page, LISTED_URL);
  await expect(page.locator('[data-role="search"]')).toBeVisible();

  await page.locator('[data-role="search"]').click();
  await expect(page.locator('[data-role="engines"] a').first()).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-role="query"]')).toBeFocused();

  await page.keyboard.press('ArrowUp');

  const rows = page.locator('[data-role="list"] li');

  await expect(rows.last()).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-role="fallback"]')).toBeHidden();
  await expect(page.locator('[data-role="search"]')).toBeVisible();
});

test('starts the scope selector on the choice kept for the site', async ({ page, worker }) => {
  await waitForBlockPage(page, LISTED_URL);

  await page.locator('[data-role="open-menu"]').click();
  await page.locator('[data-role="scope-once"]').click();

  await expect
    .poll(() => worker.evaluate(() => chrome.storage.local.get(['scopeDefaults'])))
    .toEqual({ scopeDefaults: { '127.0.0.1': 'once' } });

  await waitForBlockPage(page, LISTED_URL);

  await expect(page.locator('[data-role="open-menu-label"]')).toHaveText('Just once');

  await page.locator('[data-role="open-menu"]').click();

  await expect(page.locator('[data-role="scope-once"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-role="scope-tab"]')).toHaveAttribute('aria-checked', 'false');
});

test('opens a result from every part of its row', async ({ page }) => {
  await waitForBlockPage(page, LISTED_URL);

  const row = page.locator('[data-role="list"] > li').first();
  const link = row.locator('a');
  const rowBox = await row.boundingBox();
  const linkBox = await link.boundingBox();

  expect(rowBox).not.toBeNull();
  expect(linkBox?.width).toBe(rowBox?.width);
  expect(linkBox?.height).toBe(rowBox?.height);
  await expect(link).toHaveAttribute('href', /^https:\/\//);
});

test('shows the empty state for an article without alternatives', async ({ page }) => {
  await waitForBlockPage(page, EMPTY_URL);

  await expect(page.locator('[data-role="alternatives"]')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('[data-role="status"]')).toHaveText(
    'No alternatives found for this story',
  );
  await expect(page.locator('[data-role="engines"] a')).toHaveCount(4);
});

test('lets a document refresh to an unlisted host load after the allowance', async ({
  page,
  worker,
}) => {
  await waitForBlockPage(page, REDIRECT_URL);
  await page.locator('[data-role="open-site"]').click();

  await expect(page).toHaveURL(UNLISTED_URL);
  await expect(page.locator('h1')).toHaveText(NORMAL_TITLE);

  const stored = await worker.evaluate(() => chrome.storage.session.get('allowTabs'));

  expect(stored.allowTabs?.[0]?.host).toBe('127.0.0.1');
});

test('shows that the search is still running on the slow fixture', async ({ page }) => {
  await waitForBlockPage(page, SLOW_URL);

  await expect(page.locator('[data-role="alternatives"]')).toHaveAttribute('data-state', 'loading');
  await expect(page.locator('[data-role="slow-note"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-role="alternatives"]')).toHaveAttribute(
    'data-state',
    'results',
    { timeout: 15_000 },
  );
});

test('shows the failure state on the failing fixture', async ({ page }) => {
  await waitForBlockPage(page, FAILING_URL);

  await expect(page.locator('[data-role="alternatives"]')).toHaveAttribute('data-state', 'error', {
    timeout: 15_000,
  });
  await expect(page.locator('[data-role="retry"]')).toBeVisible();
});

test('keeps the popup inside its 340 pixel frame', async ({ worker, page }) => {
  await page.goto(UNLISTED_URL);

  const popup = await openNativePopup(worker, page);

  // Chrome sizes a popup window to its document, so a footer that overflows its
  // body widens the window past the page behind it and leaves the sections short
  // of the right edge.
  const frame = await popup.evaluate(() => {
    const footer = document.querySelector('footer');
    const edges = [...(footer?.children ?? [])].map((child) => child.getBoundingClientRect().right);

    return {
      width: window.innerWidth,
      bodyWidth: document.body.clientWidth,
      scrollWidth: document.body.scrollWidth,
      footerRight: Math.max(...edges),
    };
  });

  expect(frame.width).toBe(340);
  expect(frame.bodyWidth).toBe(340);
  expect(frame.scrollWidth).toBe(frame.bodyWidth);
  expect(frame.footerRight).toBeLessThanOrEqual(frame.bodyWidth);
});

test('paints the listed page and its routes in the popup', async ({ worker, page }) => {
  // The reader kept an allowance for the fixture host, so the page loads and the
  // popup still answers for a site that the list carries.
  await worker.evaluate(() =>
    chrome.storage.local.set({ allowAlways: [{ host: '127.0.0.1', addedAt: Date.now() }] }),
  );

  await page.goto(LISTED_URL);
  await expect(page.locator('h1')).toHaveText(WALLED_TITLE);

  const popup = await openNativePopup(worker, page);

  await expect(popup.locator('[data-role="state"]')).toHaveText('On');
  await expect(popup.locator('[data-role="source-domain"]')).toHaveText('127.0.0.1');
  await expect(popup.locator('[data-role="source-description"]')).toContainText('two walls');

  // The pills of the site, then one row per alternative and the search card as
  // the last number. The list keeps every row and scrolls past the third.
  const pills = popup.locator('[data-role="wall"]');

  await expect(pills).toHaveCount(2);
  await expect(pills.first()).toContainText('Ad blocker');
  await expect(pills.nth(1)).toContainText('Paywall');
  await expect(popup.locator('[data-role="list"] > li')).toHaveCount(4);
  await expect(popup.locator('[data-role="search"]')).toBeVisible();
  await expect(popup.locator('[data-role="search-key"]')).toHaveText('5');

  await popup.close();
});

test('paints the unlisted page with the report row and the search', async ({ worker, page }) => {
  await page.goto(UNLISTED_URL);

  const popup = await openNativePopup(worker, page);

  await expect(popup.locator('[data-role="source-domain"]')).toHaveText('forbes.test');
  await expect(popup.locator('[data-role="source-description"]')).toHaveText(
    'This site is not on the list',
  );
  await expect(popup.locator('[data-role="list"] > li')).toHaveCount(0);
  await expect(popup.locator('[data-role="site-report"]')).toBeVisible();
  await expect(popup.locator('[data-role="report-key"]')).toHaveText('1');
  await expect(popup.locator('[data-role="search"]')).toBeVisible();
  await expect(popup.locator('[data-role="search-key"]')).toHaveText('2');

  await popup.close();
});

test('switches Detour off from the popup and back on', async ({ context, worker, page }) => {
  await page.goto(UNLISTED_URL);

  // A tab keeps a document that a reload can be asserted on, which a toolbar
  // popup window does not: closing it is the end of that document.
  const popup = await openPopupOver(context, worker, page);
  const switchBox = popup.locator('[data-role="enabled"]');

  await expect(popup.locator('[data-role="state"]')).toHaveText('On');
  await expect(switchBox).toBeChecked();

  await switchBox.uncheck();

  // The worker stores the setting, and the popup asks for the state again
  // instead of trusting the press it just made.
  await expect(popup.locator('[data-role="state"]')).toHaveText('Off');
  await expect(popup.locator('[data-role="state"]')).toHaveAttribute('data-state', 'off');

  await popup.reload();

  await expect(popup.locator('[data-role="state"]')).toHaveText('Off');
  await expect(popup.locator('[data-role="enabled"]')).not.toBeChecked();

  await popup.locator('[data-role="enabled"]').check();

  await expect(popup.locator('[data-role="state"]')).toHaveText('On');

  await popup.close();
});

test('says why a page names no site', async ({ worker, page }) => {
  await page.goto('chrome://settings/');

  const popup = await openNativePopup(worker, page);

  await expect(popup.locator('[data-role="state"]')).toHaveText('On');
  await expect(popup.locator('[data-role="source"]')).toBeHidden();
  await expect(popup.locator('[data-role="search"]')).toBeHidden();
  await expect(popup.locator('[data-role="list"] > li')).toHaveCount(0);
  await expect(popup.locator('[data-role="status"]')).toHaveText(
    'Detour works on websites. Open a site, then press the icon again.',
  );
  await expect(popup.locator('[data-role="how-it-works"]')).toHaveText('How it works');

  await popup.close();
});

test('opens a route from the toolbar popup over the page it answers for', async ({
  worker,
  page,
}) => {
  await worker.evaluate(() =>
    chrome.storage.local.set({ allowAlways: [{ host: '127.0.0.1', addedAt: Date.now() }] }),
  );

  await page.goto(LISTED_URL);
  await expect(page.locator('h1')).toHaveText(WALLED_TITLE);

  const popup = await openNativePopup(worker, page);

  // The popup has no tab of its own, so the state it paints is the state of the
  // page in front of the reader, read through the worker.
  await expect(popup.locator('[data-role="source-domain"]')).toHaveText('127.0.0.1');
  await expect(popup.locator('[data-role="wall"]')).toHaveCount(2);
  await expect(popup.locator('[data-role="list"] > li')).toHaveCount(4);
  await expect(popup.locator('[data-role="search-key"]')).toHaveText('5');

  // A row press moves the page the popup answers for, then closes the popup.
  await popup.locator('[data-role="list"] > li > a').first().click();

  await expect(page).toHaveURL(/niemanlab\.org/);
  await expect.poll(() => popup.isClosed()).toBe(true);
});
