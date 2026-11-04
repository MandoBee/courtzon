import { test, expect } from '../../fixtures/auth.fixture';
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

    await bookingPage.openResource(resourceId);
    await bookingPage.selectDate(futureDate(3));
    await bookingPage.selectFirstAvailableSlot();
    await bookingPage.clickBookNow();
    await bookingPage.waitForBookingConfirmation();

    const bookingId = page.url().match(/\/bookings\/(\d+)\/confirmation/)?.[1];
    expect(bookingId).toBeDefined();

    await page.goto('/bookings');
    await page.waitForLoadState('networkidle');

    // MyBookingsPage renders a plain card per booking and exposes no
    // `data-testid` on it (`MyBookingsPage.tsx:160-205`). The stable,
    // language-independent markers are the page heading and the per-booking
    // confirmation link (`MyBookingsPage.tsx:178-184`).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator(`a[href="/bookings/${bookingId}/confirmation"]`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

});
