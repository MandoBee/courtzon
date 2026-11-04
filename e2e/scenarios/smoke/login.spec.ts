import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { testUsers } from '../../data/users';
import { insertUser } from '../../helpers/database';

test.describe('Login Smoke', () => {

  test('player can login with valid credentials', async ({ page }) => {
    const user = testUsers.player();
    await insertUser({
      phoneNumber: user.phoneNumber,
      password: user.password,
      fullName: user.fullName,
      email: user.email,
      gender: user.gender,
      timezone: user.timezone,
      countryId: user.countryId,
    });

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(user.phoneNumber, user.password);
    await loginPage.waitForLoginSuccess();
    await expect(page).toHaveURL(/\/app/);
  });

  test('shows error with invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('01000000000', 'wrongpassword');

    // The login error surface: explicit error hooks first, then the rendered
    // backend message ("Invalid credentials. N attempt(s) remaining.").
    // `text=...` cannot be mixed into a CSS selector list, so the text probe is
    // expressed as its own locator and combined with `.or()`.
    const loginError = page
      .locator('[data-testid="login-error"], .error-message, [role="alert"]')
      .or(page.getByText(/invalid credentials/i))
      .first();

    await expect(loginError).toBeVisible({ timeout: 10_000 });
  });

});
