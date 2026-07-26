import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class LoginPage {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async login(phone: string, password: string): Promise<void> {
    const phoneInput = this.page.locator('[data-testid="login-phone"] input, input[name="phoneNumber"], input[type="tel"]').first();
    await phoneInput.fill(phone);

    const passwordInput = this.page.locator('[data-testid="login-password"], input[name="password"], input[type="password"]').first();
    await passwordInput.fill(password);

    const submitBtn = this.page.locator('[data-testid="login-submit"], button[type="submit"]').first();
    await submitBtn.click();
  }

  async waitForLoginSuccess(): Promise<void> {
    await this.page.waitForURL(/\/app/, { timeout: 15_000 });
    await this.page.waitForLoadState('networkidle');
  }

  async logout(): Promise<void> {
    const logoutBtn = this.page.locator(
      '[data-testid="logout-button"], button[aria-label="Logout"], button:has-text("Logout")',
    ).first();
    await logoutBtn.click();
    await this.page.waitForURL(/\/login|\//, { timeout: 10_000 });
  }
}
