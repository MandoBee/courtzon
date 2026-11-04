import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { testUsers } from '../data/users';
import { clearCookies } from '../helpers/api';
import { insertUser, query } from '../helpers/database';
import type { Page } from '@playwright/test';

type AuthFixtures = {
  authenticatedPlayer: { page: Page; user: ReturnType<typeof testUsers.player> };
  authenticatedAdmin: { page: Page };
};

export const test = base.extend<AuthFixtures>({
  authenticatedPlayer: [
    async ({ browser }, use) => {
      const page = await browser.newPage();
      const userData = testUsers.player();

      const playerId = await insertUser({
        phoneNumber: userData.phoneNumber,
        password: userData.password,
        fullName: userData.fullName,
        email: userData.email,
        gender: userData.gender,
        timezone: userData.timezone,
        countryId: userData.countryId,
      });

      // CourtZon login returns the caller's permission set, and permission-gated
      // UI (`<Can permission="bookings.create.date">` etc.) stays hidden for a
      // role-less user. Grant the player role BEFORE the login so the session
      // loads the player template's permissions.
      const [playerRoleRows] = await query<any[]>(
        'SELECT id FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1',
        ['player'],
      );
      if (!playerRoleRows.length) throw new Error('player role is not seeded in the test database');
      const [playerGrant] = await query<any>(
        'INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)',
        [playerId, Number(playerRoleRows[0].id)],
      );
      if (playerGrant && playerGrant.affectedRows === 0) {
        throw new Error('player role grant was not applied (existing/blocked row)');
      }

      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(userData.phoneNumber, userData.password);
      await loginPage.waitForLoginSuccess();

      await use({ page, user: userData });

      clearCookies();
      await page.close();
    },
    { scope: 'test' },
  ],

  authenticatedAdmin: [
    async ({ browser }, use) => {
      const page = await browser.newPage();
      const admin = testUsers.admin();

      // CourtZon login is phone + password only. Create a dedicated admin user
      // and grant the platform role with the existing inline convention.
      const adminId = await insertUser({
        phoneNumber: admin.phoneNumber,
        password: admin.password,
        fullName: admin.fullName,
        email: admin.email,
        gender: 'male',
        timezone: 'UTC',
        countryId: 1,
      });

      const [roleRows] = await query<any[]>(
        'SELECT id FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1',
        ['super_admin'],
      );
      if (!roleRows.length) throw new Error('super_admin role is not seeded in the test database');
      await query(
        'INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, 1)',
        [adminId, Number(roleRows[0].id)],
      );

      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(admin.phoneNumber, admin.password);
      // Platform staff land on /admin; accept /app for safety.
      await page.waitForURL(/\/admin|\/app/, { timeout: 15_000 });
      await page.waitForLoadState('networkidle');

      await use({ page });

      clearCookies();
      await page.close();
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
