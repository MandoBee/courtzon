import { test, expect } from '@playwright/test';

test.describe('Smoke — public pages', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible();
  });

  test('register pre-select page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Smoke — authenticated shell', () => {
  test.skip(!process.env.E2E_LOGIN_PHONE, 'Set E2E_LOGIN_PHONE + E2E_LOGIN_PASSWORD for auth smoke tests');

  test('login redirects to dashboard or home', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="tel"], input[name="phoneNumber"]').first().fill(process.env.E2E_LOGIN_PHONE!);
    await page.locator('input[type="password"], input[name="password"]').first().fill(process.env.E2E_LOGIN_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/(home|$|dashboard)/, { timeout: 15_000 });
  });
});
