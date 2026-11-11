import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';

/** Fails a test on any console error or uncaught exception, so a broken page can never pass quietly. */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error') problems.push(`console: ${message.text()}`);
      });
      await use(problems);
      expect(problems, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function exploreSample(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Explore with sample data' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
}

export async function setUpBusiness(page: Page, gstin = '29AAGCB7383J1Z4'): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Set up my business' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set up your business' });
  await dialog.getByLabel('Business name').fill('Test Studio');
  await dialog.getByLabel('GSTIN').fill(gstin);
  await dialog.getByRole('button', { name: 'Start invoicing' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
}

/** Zero serious or critical accessibility violations on what is on screen now. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter(
    violation => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    serious.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}
