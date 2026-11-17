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
