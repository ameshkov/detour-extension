import { BLOCK_PAGE, SITE_ORIGIN, expect, extensionId, test, waitForBlockPage } from './fixtures';

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

  const pills = page.locator('[data-role="wall"]');

  await expect(pills).toHaveCount(2);
  await expect(pills.first()).toContainText('Ad blocker');
  await expect(pills.first()).toContainText('Hard');
  await expect(pills.nth(1)).toContainText('Paywall');
  await expect(pills.nth(1)).toContainText('Metered');
  await expect(page.locator('[data-role="lede"]')).toContainText(
    'An ad-blocker wall is an anti-user practice',
  );
  await expect(page.locator('[data-role="alternatives"]')).toHaveAttribute('data-state', 'results');
  expect(await page.locator('[data-role="list"] li').count()).toBeGreaterThan(0);

  const hero = page.locator('[data-role="list"] li[data-variant="hero"] img');
  await expect(hero).toHaveCount(1);
  await hero.scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      hero.evaluate((image) => (image instanceof HTMLImageElement ? image.naturalWidth : 0)),
    )
    .toBeGreaterThan(0);

  const source = (await hero.getAttribute('src')) ?? '';

  expect(source).toContain('/v1/img?u=');

  const response = await context.request.get(source);

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');

  const rows = page.locator('[data-role="list"] li[data-variant="row"]');
  const favicons = rows.locator('[data-role="tile"] img');

  await expect(favicons).toHaveCount(await rows.count());

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

test('keeps the scope menu inside a short viewport', async ({ page }) => {
  await waitForBlockPage(page, LISTED_URL);

  await page.setViewportSize({ width: 1000, height: 520 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const caret = page.locator('[data-role="open-menu"]');

  await caret.click();

  const menu = page.locator('[data-role="scope-menu"]');

  await expect(menu).toBeVisible();
  // The control sits at the foot of this window, so the menu opens above it.
  await expect(menu).toHaveAttribute('data-side', 'top');

  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  const caretBox = await caret.boundingBox();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(caretBox).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

  // The menu hangs off the control itself, so the gap is the 6 pixels of the
  // sheet and not the padding of the row above it.
  const gap = caretBox!.y - (box!.y + box!.height);

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

test('keeps the popup inside its 340 pixel frame', async ({ context }) => {
  const popup = await context.newPage();

  await popup.setViewportSize({ width: 340, height: 620 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('[data-role="how-it-works"]')).toHaveText('How it works');

  // The browser sizes a popup window to its content, so a footer that overflows
  // its body widens the window past the papers behind it and leaves the sections
  // short of the right edge.
  const frame = await popup.evaluate(() => {
    const footer = document.querySelector('footer');
    const edges = [...(footer?.children ?? [])].map((child) => child.getBoundingClientRect().right);

    return {
      bodyWidth: document.body.clientWidth,
      scrollWidth: document.body.scrollWidth,
      footerRight: Math.max(...edges),
    };
  });

  expect(frame.bodyWidth).toBe(340);
  expect(frame.scrollWidth).toBe(frame.bodyWidth);
  expect(frame.footerRight).toBeLessThanOrEqual(frame.bodyWidth);

  await popup.close();
});

test('pauses from the popup and reports the time it has left', async ({ context }) => {
  const popup = await context.newPage();

  await popup.setViewportSize({ width: 340, height: 620 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const pause = popup.locator('[data-role="pause"]');

  await expect(pause).toHaveAttribute('aria-expanded', 'false');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-expanded', 'true');

  await popup.locator('[data-role="duration-5m"]').click();

  // The worker stores the pause, and the popup reads it back instead of trusting
  // the press it just made.
  await expect(popup.locator('[data-role="pause-label"]')).toHaveText(/^Paused · 0[45]:\d\d left$/);
  await expect(popup.locator('[data-role="state"]')).toHaveAttribute('data-state', 'paused');

  await popup.reload();

  await expect(popup.locator('[data-role="pause-label"]')).toHaveText(/^Paused · 0[45]:\d\d left$/);
  await expect(popup.locator('[data-role="resume"]')).toBeVisible();

  await popup.locator('[data-role="resume"]').click();

  await expect(popup.locator('[data-role="pause-label"]')).toHaveText('Pause the list');
  await expect(popup.locator('[data-role="state"]')).toHaveAttribute('data-state', 'on');

  await popup.close();
});

test('hides the site block on a page that names no site', async ({ context }) => {
  const popup = await context.newPage();

  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.locator('[data-role="pause"]')).toBeVisible();
  await expect(popup.locator('[data-role="site"]')).toBeHidden();

  await popup.close();
});
