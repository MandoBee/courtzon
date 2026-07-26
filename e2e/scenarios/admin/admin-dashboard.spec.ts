import { test, expect } from '../../fixtures/auth';
import { DashboardPage } from '../../pages/DashboardPage';

test.describe('Admin Dashboard', () => {

  test('admin can login and view dashboard', async ({ authenticatedAdmin }) => {
    const { page } = authenticatedAdmin;
    const dashboard = new DashboardPage(page);

    await dashboard.goto();
    const loaded = await dashboard.isLoaded();
    expect(loaded).toBeTruthy();
  });

  test('admin dashboard shows admin-specific elements', async ({ authenticatedAdmin }) => {
    const { page } = authenticatedAdmin;
    const dashboard = new DashboardPage(page);

    await dashboard.goto();

    await expect(
      page.locator(
        'nav a[href="/admin"], [data-testid="admin-link"], ' +
        'a:has-text("Admin"), [data-testid="sidebar-admin"]',
      ).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('admin can navigate to admin panel', async ({ authenticatedAdmin }) => {
    const { page } = authenticatedAdmin;
    const dashboard = new DashboardPage(page);

    await dashboard.goto();

    const adminLink = page.locator(
      'nav a[href="/admin"], [data-testid="nav-admin"], ' +
      '[data-testid="admin-link"], a:has-text("Admin")',
    ).first();
    await adminLink.click();
    await page.waitForURL(/\/admin/, { timeout: 10_000 });

    await expect(
      page.locator(
        '[data-testid="admin-dashboard"], h1:has-text("Admin"), ' +
        '[data-testid="admin-stats"]',
      ).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

});
