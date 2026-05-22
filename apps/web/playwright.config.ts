import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Assumes the app + worker + seeded DB are already running (e.g. via
 * `pnpm demo:up`) at localhost:3000. Run with `pnpm --filter @stockflow/web e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
