import { exploreSample, expectAccessible, test } from './fixtures';

const SCREENS = [
  ['dashboard', '#/'],
  ['invoices', '#/invoices'],
  ['editor', '#/invoices/sample-12'],
  ['clients', '#/clients'],
  ['settings', '#/settings'],
] as const;

test('the welcome screen has no serious accessibility problems', async ({ page }) => {
  await page.goto('./');
  await expectAccessible(page);
});

for (const theme of ['light', 'dark'] as const) {
  for (const [name, hash] of SCREENS) {
    test(`${name} has no serious accessibility problems in the ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await exploreSample(page);
      await page.goto(`./${hash}`);
      await page.waitForTimeout(300);
      await expectAccessible(page);
    });
  }
}
