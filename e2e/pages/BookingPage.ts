import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class BookingPage {
  constructor(public readonly page: Page) {}

  /**
   * Wait for the post-login welcome splash to finish before any full page load.
   * `LoginSplash` is a full-screen overlay shown for ~2.6 s after login and it
   * redirects to `/app` on dismissal when the landing route has not changed
   * (`LoginSplash.tsx:37-44`). Reloading a deep link while the
   * `cz_show_login_splash` flag is still set re-arms it, so the overlay swallows
   * the form and then navigates away.
   */
  async waitForLoginSplash(): Promise<void> {
    await this.page.waitForFunction(
      () => sessionStorage.getItem('cz_show_login_splash') !== '1',
      undefined,
      { timeout: 15_000 },
    );
    await this.page
      .locator('[role="dialog"]')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});
  }

  /**
   * The booking flow has no resource catalogue at `/bookings` (that route is
   * the player's booking list, `App.tsx:619`). A resource is booked by opening
   * its form directly: `/book/:resourceId` -> `BookingFormPage` (`App.tsx:618`).
   */
  async openResource(resourceId: number | string): Promise<void> {
    await this.waitForLoginSplash();
    await this.page.goto(`/book/${resourceId}`);
    await this.page.waitForURL(new RegExp(`/book/${resourceId}$`), { timeout: 15_000 });
    await this.page.waitForLoadState('networkidle');
  }

  async selectDate(date: string): Promise<void> {
    const dateInput = this.page.locator(
      '[data-testid="booking-date"] input[type="date"], input[name="bookingDate"], input[type="date"]',
    ).first();
    await dateInput.fill(date);
    await dateInput.dispatchEvent('input');
    await this.page.waitForTimeout(500);
  }

  /**
   * Slots are generated from the resource's opening hours + `slot_duration`
   * (default grid here is 90 minutes, e.g. `08:00 - 09:30`), so a fixed time is
   * not guaranteed to exist. Pick the first rendered (available) slot; the
   * page only renders stale-free slots from `/resources/:id/slots`.
   */
  async selectFirstAvailableSlot(): Promise<string> {
    const slot = this.page
      .getByRole('button', { name: /^\d{2}:\d{2} - \d{2}:\d{2}$/ })
      .first();
    await slot.click();
    const label = ((await slot.textContent()) || '').trim();
    return label.split(' - ')[0] ?? label;
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
