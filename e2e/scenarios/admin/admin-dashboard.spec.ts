import { test, expect } from '../../fixtures/auth.fixture';

test.describe('Admin Dashboard', () => {

  test('admin can login and view dashboard', async ({ authenticatedAdmin }) => {
    const { page } = authenticatedAdmin;

    // A platform admin never lands on the player shell: `super_admin` maps to the
    // 'platform' workspace and to '/admin' (`workspace.store.ts:39-42,81-82`), and
    // `RouteGuards.tsx:64-67` redirects platform staff away from every other path.
    await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: 15_000 });

    // Admin dashboard heading: `AdminDashboard.tsx:77` renders the
    // `admin.dashboard.title` key ("System Dashboard").
    await expect(
      page.getByRole('heading', { level: 1, name: /system dashboard/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('admin dashboard shows admin-specific elements', async ({ authenticatedAdmin }) => {
    const { page } = authenticatedAdmin;

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // The admin navigation lives in the sidebar `<aside>`/`<nav>`
    // (`AdminSidebar.tsx:147,152`). The admin shell has no consumer "Admin" link
    // and no `admin-link` / `sidebar-admin` test id, so this asserts the real
    // navigation surface instead of a link that does not exist.
    const adminNav = page.locator('aside nav').first();
    await expect(adminNav).toBeVisible({ timeout: 15_000 });
    await expect(adminNav.locator('button').first()).toBeVisible({ timeout: 15_000 });
  });

  test('admin can navigate to admin panel', async ({ authenticatedAdmin }) => {
    const { page } = authenticatedAdmin;

    // `/admin/users` is a declared admin route (`App.tsx:725` ->
    // `UserListPage`), gated by `users.view` which `super_admin` holds.
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 15_000 });

    // `UserListPage.tsx:114` renders the `admin.users.title` key ("Users") and
    // the page body is a table (`UserListPage.tsx:119`).
    await expect(
      page.getByRole('heading', { level: 1, name: /users/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('table').first()).toBeVisible({ timeout: 20_000 });
  });

});
