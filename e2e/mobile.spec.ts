import { exploreSample, expect, test } from './fixtures';

test('on a phone the editor switches between editing and the preview, and nothing scrolls sideways', async ({
  page,
}) => {
  await exploreSample(page);
  await page.goto('./#/invoices/sample-12');
  await expect(page.getByLabel('Description (line 1)')).toBeVisible();
  await expect(page.locator('.editor__preview')).toBeHidden();

  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.locator('.editor__preview .sheet')).toBeVisible();
  await expect(page.getByLabel('Description (line 1)')).toBeHidden();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('on a phone the main navigation is a tab bar', async ({ page }) => {
  await exploreSample(page);
  const tabbar = page.locator('.tabbar');
  await expect(tabbar).toBeVisible();
  await tabbar.getByRole('link', { name: 'Clients' }).click();
  await expect(page.getByRole('heading', { name: 'Clients', level: 1 })).toBeVisible();
});
