import { defineConfig, devices } from '@playwright/test';

const PORT = 4201;

/** End-to-end tests run against the production build, served under the same /bahi/ path as GitHub Pages. */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/bahi/`,
    trace: 'retain-on-failure',
    // Locally the installed Chrome is used; CI installs Playwright's Chromium.
    channel: process.env.CI ? undefined : 'chrome',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}/bahi/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
