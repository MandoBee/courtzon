import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { testUsers } from '../data/users';
import { api, clearCookies } from '../helpers/api';
import { insertUser } from '../helpers/database';
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

      await insertUser({
        phoneNumber: userData.phoneNumber,
        password: userData.password,
        fullName: userData.fullName,
        email: userData.email,
        gender: userData.gender,
        timezone: userData.timezone,
        countryId: userData.countryId,
      });

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

      clearCookies();
      const loginRes = await api.login(admin.email, admin.password);
      if (loginRes.status !== 200) {
        throw new Error(`Admin login failed: ${loginRes.status} ${JSON.stringify(loginRes.data)}`);
      }

      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(admin.email, admin.password);
      await loginPage.waitForLoginSuccess();

      await use({ page });

      clearCookies();
      await page.close();
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
