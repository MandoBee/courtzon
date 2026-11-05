import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';

/**
 * Final-simulation UI journey. Uses the persistent simulation accounts created
 * by backend/scripts/final-simulation.mjs (SIM-FINAL data set). Read-only:
 * no booking/order is created here; the harness covers mutations via the API.
 */

const PLAYER = { phone: '01111000001', password: 'SimPlayer#2026' };
const ADMIN = { phone: '01099990001', password: 'SimAdmin#2026' };

function collectErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text().slice(0, 200)}`);
  });
  return errors;
}

test.describe('Final simulation — consumer UI', () => {
  test('player desktop journey (dashboard, bookings, marketplace, profile)', async ({ page }) => {
    const errors = collectErrors(page);
    const login = new LoginPage(page);
    await login.goto();
    await login.login(PLAYER.phone, PLAYER.password);
    await login.waitForLoginSuccess();
    await expect(page).toHaveURL(/\/app/);

    for (const path of ['/bookings', '/marketplace', '/profile']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#root')).toBeVisible();
      await expect(page.getByText(/something went wrong|unexpected error/i)).toHaveCount(0);
    }

    const fatal = errors.filter((e) => !/ResizeObserver|favicon|Failed to load resource: the server responded with a status of 40[13]/i.test(e));
    expect(fatal, `unexpected console errors: ${fatal.join(' | ')}`).toHaveLength(0);
  });

  test('mobile layout keeps BottomNav and navigates to marketplace', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const login = new LoginPage(page);
    await login.goto();
    await login.login(PLAYER.phone, PLAYER.password);
    await login.waitForLoginSuccess();

    const bottomNav = page.locator('nav').filter({ hasText: /Home|Bookings|Marketplace/ }).last();
    await expect(bottomNav).toBeVisible();
    await bottomNav.getByText(/Marketplace/i).first().click();
    await page.waitForURL(/marketplace/, { timeout: 15_000 });
    await expect(page.locator('#root')).toBeVisible();
  });

  test('admin accounting and users screens load with data surfaces', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN.phone, ADMIN.password);
    await page.waitForURL(/\/admin/, { timeout: 20_000 });
    await page.waitForLoadState('networkidle');

    for (const path of ['/admin/accounting/dashboard', '/admin/accounting/journal', '/admin/users']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#root')).toBeVisible();
      await expect(page.getByText(/something went wrong|unexpected error/i)).toHaveCount(0);
    }
  });

  test('public pages and tournament listing render (logged out)', async ({ page }) => {
    for (const path of ['/', '/tournaments/public', '/login']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#root')).toBeVisible();
    }
  });
});
