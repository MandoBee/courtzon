import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function expectNotificationReceived(
  page: Page,
  title: string,
): Promise<void> {
  const notification = page.locator('[data-testid="notification-item"]', {
    hasText: title,
  });
  await expect(notification).toBeVisible({ timeout: 10_000 });
}

export async function expectUrlContains(
  page: Page,
  path: string,
): Promise<void> {
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

export async function expectToastMessage(
  page: Page,
  message: string,
): Promise<void> {
  const toast = page.locator('[data-testid="toast-message"]', {
    hasText: message,
  });
  await expect(toast).toBeVisible({ timeout: 8_000 });
}

export async function expectBookingConfirmed(
  page: Page,
): Promise<void> {
  const confirmed = page.locator(
    '[data-testid="booking-status"][data-status="confirmed"], ' +
    '[data-testid="booking-confirmed"], ' +
    'text=Booking Confirmed',
  ).first();
  await expect(confirmed).toBeVisible({ timeout: 15_000 });
}
