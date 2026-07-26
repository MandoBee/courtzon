import { test, expect } from '../../fixtures/auth';
import { BookingPage } from '../../pages/BookingPage';
import {
  testCourts,
  organisationPayload,
  branchPayload,
} from '../../data/courts';
import {
  insertOrganisation,
  insertBranch,
  insertResource,
  query,
} from '../../helpers/database';
import { futureDate } from '../../helpers/time';

test.describe('Create Booking', () => {

  test('complete booking lifecycle via UI', async ({ authenticatedPlayer }) => {
    const { page, user } = authenticatedPlayer;
    const bookingPage = new BookingPage(page);

    const [rows] = await query<any>(
      'SELECT id FROM users WHERE phone_number = ?',
      [user.phoneNumber],
    );
    const userId = rows[0]?.id;
    expect(userId).toBeDefined();

    const orgId = await insertOrganisation(organisationPayload(userId));
    const branchId = await insertBranch(branchPayload(orgId));
    const resourceId = await insertResource(testCourts.tennisCourt(branchId));

    await bookingPage.goto();
    await bookingPage.selectResource(resourceId);
    await bookingPage.selectDate(futureDate(3));
    await bookingPage.selectTimeSlot('10:00');
    await bookingPage.clickBookNow();
    await bookingPage.waitForBookingConfirmation();

    await page.goto('/bookings');
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('[data-testid="booking-card"], [data-testid^="booking-"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

});
