import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class BookingPage {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/bookings');
    await this.page.waitForLoadState('networkidle');
  }

  async selectResource(resourceId: number | string): Promise<void> {
    const resourceCard = this.page.locator(
      `[data-testid="resource-card-${resourceId}"], a[href="/book/${resourceId}"]`,
    ).first();
    await resourceCard.click();
    await this.page.waitForURL(`/book/${resourceId}`, { timeout: 10_000 });
  }

  async selectDate(date: string): Promise<void> {
    const dateInput = this.page.locator(
      '[data-testid="booking-date"] input[type="date"], input[name="bookingDate"], input[type="date"]',
    ).first();
    await dateInput.fill(date);
    await dateInput.dispatchEvent('input');
    await this.page.waitForTimeout(500);
  }

  async selectTimeSlot(startTime: string): Promise<void> {
    const slot = this.page.locator(
      `[data-testid="timeslot-${startTime}"], button:has-text("${startTime}")`,
    ).first();
    await slot.click();
  }

  async clickBookNow(): Promise<void> {
    const submitBtn = this.page.locator(
      '[data-testid="booking-submit"], button[type="submit"]:has-text("Confirm"), button:has-text("Confirm Booking")',
    ).first();
    await submitBtn.click();
  }

  async waitForBookingConfirmation(): Promise<void> {
    await this.page.waitForURL(/\/bookings\/\d+\/confirmation/, { timeout: 15_000 });
    await expect(
      this.page.locator('[data-testid="booking-confirmed"], h1:has-text("Booking Confirmed")').first(),
    ).toBeVisible({ timeout: 15_000 });
  }
}
