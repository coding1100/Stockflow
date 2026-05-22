import { test, expect } from '@playwright/test';

/** Signs in as the Operations Lead before each test. */
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill('ops@stockflow.demo');
  await page.getByPlaceholder('Password').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

test('dashboard shows the four KPI tiles', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Stock Accuracy')).toBeVisible();
  await expect(page.getByText('Avg Pick Time')).toBeVisible();
  await expect(page.getByText('Throughput Today')).toBeVisible();
  await expect(page.getByText('Labor Hours')).toBeVisible();
});

test('inventory search and low-stock filter work', async ({ page }) => {
  await login(page);
  await page.goto('/inventory');
  await page.getByPlaceholder('Search by code or name…').fill('SKU-00001');
  await expect(page.getByText('SKU-00001')).toBeVisible();
  await page.getByRole('button', { name: 'Low stock' }).click();
  await expect(page.getByRole('cell').first()).toBeVisible();
});

test('a wave can be optimized and shows a route', async ({ page }) => {
  await login(page);
  await page.goto('/picking');
  // Open the first existing wave (seeded hero waves).
  await page.getByText(/^W-/).first().click();
  await page.waitForURL('**/picking/waves/**');
  await page.getByRole('button', { name: 'Optimize route' }).click();
  await expect(page.getByText(/Est\.\s+\d+\s+min/)).toBeVisible({ timeout: 15_000 });
});
