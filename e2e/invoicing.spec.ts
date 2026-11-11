import { exploreSample, expect, setUpBusiness, test } from './fixtures';

test('the sample workspace opens on a populated dashboard', async ({ page }) => {
  await exploreSample(page);
  await expect(page.getByText('You are looking at sample data.')).toBeVisible();
  for (const label of ['Invoiced', 'Received', 'Outstanding', 'Overdue']) {
    await expect(page.locator('.figure dt', { hasText: label })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expect(page.getByRole('group', { name: /Invoiced and received per month/ })).toBeVisible();
});

test('a new client in Karnataka gets CGST and SGST, and a payment turns the invoice Paid', async ({ page }) => {
  await setUpBusiness(page);

  // A client whose GSTIN fills in their state
  await page.getByRole('link', { name: 'Clients' }).first().click();
  await page.getByRole('button', { name: 'New client' }).first().click();
  const clientDialog = page.getByRole('dialog', { name: 'New client' });
  await clientDialog.getByLabel('Client name').fill('Monsoon Labs');
  await clientDialog.getByLabel('GSTIN').fill('27aapfu0939f1zv');
  await expect(clientDialog.getByLabel('State')).toHaveValue('27');
  await clientDialog.getByLabel('State').selectOption('29');
  await clientDialog.getByRole('button', { name: 'Save client' }).click();
  await expect(page.getByRole('button', { name: 'Monsoon Labs' })).toBeVisible();

  // A two-line invoice for them
  await page.getByRole('button', { name: 'New invoice' }).first().click();
  await page.getByLabel('Client', { exact: true }).selectOption({ label: 'Monsoon Labs' });
  await page.getByLabel('Description (line 1)').fill('Website design');
  await page.getByLabel('Rate (line 1)').fill('40000');
  await page.getByRole('button', { name: 'Add a line' }).click();
  await page.getByLabel('Description (line 2)').fill('Hosting');
  await page.getByLabel('Qty (line 2)').fill('2');
  await page.getByLabel('Rate (line 2)').fill('5000');

  const sheet = page.locator('.editor__preview .sheet');
  await expect(sheet.locator('.sheet__row', { hasText: 'Taxable value' })).toContainText('₹50,000.00');
  await expect(sheet.locator('.sheet__row', { hasText: 'CGST 9%' })).toContainText('₹4,500.00');
  await expect(sheet.locator('.sheet__row', { hasText: 'SGST 9%' })).toContainText('₹4,500.00');
  await expect(sheet.locator('.sheet__row--total').first()).toContainText('₹59,000.00');
  await expect(sheet).toContainText('Rupees Fifty-Nine Thousand Only');
  await expect(page.getByText('Client in your own state')).toBeVisible();

  // Paid in full, with TDS
  await page.getByRole('button', { name: 'Record payment' }).click();
  const payment = page.getByRole('dialog', { name: /Payments on/ });
  await payment.getByLabel('Amount received').fill('54000');
  await payment.getByLabel('TDS your client deducted').fill('5000');
  await payment.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.locator('.editor__id .badge')).toHaveText('Paid');
  await expect(sheet.locator('.sheet__stamp')).toHaveText('PAID');
  await expect(sheet.locator('.sheet__row', { hasText: 'Balance due' })).toContainText('₹0.00');
});

test('a client in another state is charged one IGST', async ({ page }) => {
  await setUpBusiness(page);
  await page.getByRole('button', { name: 'New invoice' }).first().click();
  await page.getByRole('button', { name: 'New client' }).click();
  const dialog = page.getByRole('dialog', { name: 'New client' });
  await dialog.getByLabel('Client name').fill('Sahyadri Outdoors');
  await dialog.getByLabel('GSTIN').fill('07AAGFF2194N1Z1');
  await dialog.getByRole('button', { name: 'Save client' }).click();

  await page.getByLabel('Description (line 1)').fill('Brand identity');
  await page.getByLabel('Rate (line 1)').fill('50000');
  await expect(page.getByLabel('Place of supply')).toHaveValue('07');
  const sheet = page.locator('.editor__preview .sheet');
  await expect(sheet.locator('.sheet__row', { hasText: 'IGST 18%' })).toContainText('₹9,000.00');
  await expect(sheet.locator('.sheet__row', { hasText: 'CGST' })).toHaveCount(0);
  await expect(sheet).toContainText('Delhi (07)');
});

test('an invalid GSTIN is explained, not saved', async ({ page }) => {
  await setUpBusiness(page);
  await page.getByRole('link', { name: 'Clients' }).first().click();
  await page.getByRole('button', { name: 'New client' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New client' });
  await dialog.getByLabel('Client name').fill('Typo Traders');
  await dialog.getByLabel('GSTIN').fill('27AAPFU0939F1ZW');
  await expect(dialog.getByRole('alert')).toContainText('does not match');
  await dialog.getByRole('button', { name: 'Save client' }).click();
  await expect(dialog).toBeVisible();
});

test('the invoice prints as an A4 PDF', async ({ page }) => {
  await exploreSample(page);
  await page.goto('./#/invoices/sample-12');
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(20_000);
});

test('a backup downloads, and loading it back restores the same invoices', async ({ page }) => {
  await exploreSample(page);
  await page.getByRole('link', { name: 'Settings' }).first().click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download a backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^bahi-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();

  await page.getByRole('button', { name: 'Erase everything' }).click();
  await page.getByLabel('Type ERASE to confirm').fill('ERASE');
  await page.getByRole('dialog').getByRole('button', { name: 'Erase everything' }).click();
  await expect(page.getByRole('button', { name: 'Explore with sample data' })).toBeVisible();

  await page.getByRole('button', { name: 'Set up my business' }).click();
  await page.getByLabel('Business name').fill('Temporary');
  await page.getByRole('button', { name: 'Start invoicing' }).click();
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page.getByLabel('Backup file').setInputFiles(file);
  await expect(page.getByRole('dialog', { name: 'Replace what is on this device?' })).toContainText('15');
  await page.getByRole('button', { name: 'Replace with the backup' }).click();
  await page.getByRole('link', { name: 'Invoices' }).first().click();
  await expect(page.getByText('15 invoices', { exact: true })).toBeVisible();
});

test('a hostile file is refused with a clear message', async ({ page }) => {
  await exploreSample(page);
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page.getByLabel('Backup file').setInputFiles({
    name: 'evil.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      '{"app":"bahi","exportedAt":"x","data":{"version":1,"business":null,"clients":[{"id":"<img src=x onerror=alert(1)>"}],"invoices":[],"sample":false}}',
    ),
  });
  await expect(page.getByRole('status').filter({ hasText: 'not a Bahi backup' })).toBeVisible();
});

/** Presses Tab until the control with this accessible label has focus, and fails if it never does. */
async function tabTo(page: import('@playwright/test').Page, label: string): Promise<void> {
  for (let presses = 0; presses < 60; presses++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '',
    );
    if (focused === label) return;
  }
  throw new Error(`Tab never reached "${label}"`);
}

test('an invoice can be made with the keyboard alone', async ({ page }) => {
  await setUpBusiness(page);
  await page.keyboard.press('Tab'); // skip link
  await tabTo(page, ' New invoice');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Description (line 1)')).toBeVisible();
  await tabTo(page, 'Description (line 1)');
  await page.keyboard.type('Consulting');
  await tabTo(page, 'Rate (line 1)');
  await page.keyboard.type('1000');
  await expect(page.locator('.editor__preview .sheet__row--total').first()).toContainText('₹1,180.00');
});
