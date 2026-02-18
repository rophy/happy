import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000, // Increased timeout for live session tests
  expect: {
    timeout: 15_000, // Increased assertion timeout
  },
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'docker compose up --build -d && docker compose logs -f',
    url: 'http://localhost:3005',
    reuseExistingServer: true,
    timeout: 300_000, // 5 minutes for complex builds
  },
  projects: [
    {
      name: 'chromium-phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 667 }, // Phone viewport
      },
    },
    {
      name: 'chromium-tablet',
      use: {
        browserName: 'chromium',
        viewport: { width: 768, height: 1024 }, // Tablet viewport
      },
    },
  ],
  // Retry flaky tests
  retries: process.env.CI ? 2 : 1,

  // Run tests in parallel
  workers: process.env.CI ? 1 : undefined,

  // Global setup and teardown
  globalSetup: undefined,
  globalTeardown: undefined,

  // Test output and reporting
  outputDir: 'test-results/',
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['list']
  ],
});
