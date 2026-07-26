import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class NotificationPage {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/notifications');
    await this.page.waitForLoadState('networkidle');
  }

  getNotificationElements(): Locator {
    return this.page.locator(
      '[data-testid="notification-item"], [data-testid^="notification-"]',
    );
  }

  async getNotifications(): Promise<Locator[]> {
    const elements = await this.getNotificationElements().all();
    return elements;
  }

  async clickOnNotification(index: number): Promise<void> {
    const items = this.getNotificationElements();
    await items.nth(index).click();
  }

  async waitForNotification(title: string): Promise<void> {
    await expect(
      this.page.locator(
        `[data-testid="notification-item"]:has-text("${title}")`,
      ).first(),
    ).toBeVisible({ timeout: 10_000 });
  }

  async getNotificationCount(): Promise<number> {
    return this.getNotificationElements().count();
  }
}
