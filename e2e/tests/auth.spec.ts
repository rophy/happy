import { test, expect } from '@playwright/test';

test('create account and reach authenticated view', async ({ page }) => {
  await page.goto('/');

  // Wait for the welcome page
  await expect(page.getByText('Create account')).toBeVisible({ timeout: 10_000 });

  // Click "Create account" and wait for the auth API call to complete
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/v1/auth') && resp.status() === 200),
    page.getByText('Create account').click(),
  ]);

  // After account creation, the authenticated view should show
  // "connected" status and the welcome page should be gone
  await expect(page.getByText('connected')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Create account')).not.toBeVisible();
});
