import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class DashboardPage {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app');
    await this.page.waitForLoadState('networkidle');
  }

  async isLoaded(): Promise<boolean> {
    try {
      await expect(
        this.page.locator('[data-testid="dashboard-content"], h1:has-text("Home"), [data-testid="home-hero"]').first(),
      ).toBeVisible({ timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  async getNotificationCount(): Promise<number> {
    const badge = this.page.locator('[data-testid="notification-badge"], .notification-badge').first();
    if (!(await badge.isVisible().catch(() => false))) return 0;
    const text = (await badge.textContent()) || '0';
    const cleaned = text.replace(/\D/g, '');
    return cleaned ? Number(cleaned) : 0;
  }

  async openNotifications(): Promise<void> {
    const bell = this.page.locator(
      '[data-testid="notification-bell"], button:has([title="Notifications"]), button[title="Notifications"]',
    ).first();
    await bell.click();
  }

  async navigateTo(path: string): Promise<void> {
    const link = this.page.locator(`nav a[href="${path}"], a[data-testid="nav-${path.replace(/\//g, '-')}"]`).first();
    await link.click();
    await this.page.waitForURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10_000 });
  }
}
