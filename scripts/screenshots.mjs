// Captures the README screenshots and the sample PDF from a running production build.
//
//   npm run build && npm run preview      (in one terminal)
//   npm run screenshots                   (in another)
//
// Options: BAHI_URL (default http://localhost:4201/bahi/), SHOTS_DIR (default docs/screenshots).
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const URL = process.env.BAHI_URL ?? 'http://localhost:4201/bahi/';
const OUT = process.env.SHOTS_DIR ?? 'docs/screenshots';
const PDF = process.env.PDF_PATH ?? 'docs/sample-invoice.pdf';

/** Sample ids are deterministic; see src/domain/sample.ts. */
const INVOICE_TWO_LINES = 'sample-12';
const INVOICE_PAID = 'sample-06';

const problems = [];

async function session(browser, viewport, scale, theme) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning')
      problems.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  return { context, page };
}

async function loadSample(page) {
  await page.getByRole('button', { name: 'Explore with sample data' }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
}

async function go(page, hash, ready) {
  await page.evaluate(target => {
    window.location.hash = target;
  }, hash);
  await ready.waitFor();
  await page.waitForTimeout(400);
}

async function shot(page, name, options = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...options });
  console.log('wrote', file);
}

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
await mkdir(OUT, { recursive: true });

// ---- desktop, light
{
  const { context, page } = await session(browser, { width: 1440, height: 900 }, 1, 'light');
  await page.waitForTimeout(500);
  await shot(page, 'welcome');
  await loadSample(page);
  await page.waitForTimeout(900);
  await shot(page, 'dashboard');
  await go(page, '#/invoices', page.getByRole('heading', { name: 'Invoices', level: 1 }));
  await shot(page, 'invoices');
  await go(page, `#/invoices/${INVOICE_TWO_LINES}`, page.getByRole('button', { name: 'Download PDF' }));
  await shot(page, 'editor');
  await page.pdf({ path: PDF, format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('wrote', PDF);
  await go(page, `#/invoices/${INVOICE_PAID}`, page.getByRole('button', { name: 'Download PDF' }));
  await shot(page, 'editor-paid');
  await go(page, '#/clients', page.getByRole('heading', { name: 'Clients', level: 1 }));
  await shot(page, 'clients');
  await go(page, '#/settings', page.getByRole('heading', { name: 'Settings', level: 1 }));
  await shot(page, 'settings', { fullPage: true });
  await context.close();
}

// ---- desktop, dark
{
  const { context, page } = await session(browser, { width: 1440, height: 900 }, 1, 'dark');
  await loadSample(page);
  await page.waitForTimeout(900);
  await shot(page, 'dashboard-dark');
  await go(page, `#/invoices/${INVOICE_TWO_LINES}`, page.getByRole('button', { name: 'Download PDF' }));
  await shot(page, 'editor-dark');
  await context.close();
}

// ---- phone
{
  const { context, page } = await session(browser, { width: 390, height: 844 }, 2, 'light');
  await shot(page, 'mobile-welcome');
  await loadSample(page);
  await page.waitForTimeout(900);
  await shot(page, 'mobile-dashboard');
  await go(page, `#/invoices/${INVOICE_TWO_LINES}`, page.getByRole('button', { name: 'Download PDF' }));
  await shot(page, 'mobile-editor');
  await page.getByRole('tab', { name: 'Preview' }).click();
  await page.waitForTimeout(400);
  await shot(page, 'mobile-preview');
  await go(page, '#/invoices', page.getByRole('heading', { name: 'Invoices', level: 1 }));
  await shot(page, 'mobile-invoices');
  await context.close();
}

// ---- tablet
{
  const { context, page } = await session(browser, { width: 820, height: 1180 }, 1, 'light');
  await loadSample(page);
  await page.waitForTimeout(900);
  await shot(page, 'tablet-dashboard');
  await go(page, `#/invoices/${INVOICE_TWO_LINES}`, page.getByRole('button', { name: 'Download PDF' }));
  await shot(page, 'tablet-editor');
  await context.close();
}

await browser.close();
if (problems.length > 0) {
  console.error(`\n${problems.length} console problem(s):\n${[...new Set(problems)].join('\n')}`);
  process.exitCode = 1;
}
