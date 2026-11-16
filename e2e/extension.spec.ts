import { BLOCK_PAGE, SITE_ORIGIN, expect, test, waitForBlockPage } from './fixtures';

const LISTED_URL = `${SITE_ORIGIN}/walled/nvidia-custom-silicon`;
const EMPTY_URL = `${SITE_ORIGIN}/walled/empty-state`;
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
