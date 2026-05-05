import { defineConfig } from '@playwright/test';

/**
 * Smoke tests need the web app (see vite port, often 3000) and API reachable (Vite proxy or VITE_API_URL).
 * First run: pnpm --filter @smartload/web exec playwright install
 * Then: pnpm --filter @smartload/web run test:e2e
 */

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
});
