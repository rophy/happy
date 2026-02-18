import { test, expect } from '@playwright/test';

test('server API responds', async ({ request }) => {
  const response = await request.get('http://localhost:3005');
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain('Welcome to Happy Server!');
});

test('webapp loads and shows welcome page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Create account')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Login with mobile app')).toBeVisible();
});
