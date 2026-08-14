import { test, expect } from '@playwright/test';

const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@smartload.in';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'Admin@123';

test.describe('smoke', () => {
  test('login completes and dashboard loads', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@company.in').fill(adminEmail);
    await page.getByPlaceholder('••••••••').fill(adminPassword);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });
  });

  test('authenticated user can open dispatch dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@company.in').fill(adminEmail);
    await page.getByPlaceholder('••••••••').fill(adminPassword);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });

    await page.goto('/app/dispatch');
    await expect(page).toHaveURL(/\/app\/dispatch/);
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
