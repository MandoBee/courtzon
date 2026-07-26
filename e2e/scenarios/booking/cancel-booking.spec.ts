import { test, expect } from '../../fixtures/auth';
import {
  testCourts,
  organisationPayload,
  branchPayload,
  bookingPayload,
} from '../../data/courts';
import {
  insertOrganisation,
  insertBranch,
  insertResource,
  query,
} from '../../helpers/database';
import { api } from '../../helpers/api';

test.describe('Cancel Booking', () => {

  test('cancel a confirmed booking and verify cancelled state', async ({ authenticatedPlayer }) => {
    const { page, user } = authenticatedPlayer;

    const loginRes = await api.login(user.phoneNumber, user.password);
    expect(loginRes.status).toBe(200);

    const [rows] = await query<any>(
      'SELECT id FROM users WHERE phone_number = ?',
      [user.phoneNumber],
    );
    const userId = rows[0]?.id;
    expect(userId).toBeDefined();

    const orgId = await insertOrganisation(organisationPayload(userId));
    const branchId = await insertBranch(branchPayload(orgId));
    const resourceId = await insertResource(testCourts.tennisCourt(branchId));

    const booking = bookingPayload(resourceId, branchId);
    const createRes = await api.createBooking(booking);
    const bookingId = createRes.data?.id || createRes.data?.data?.id;
    expect(bookingId).toBeDefined();

    const confirmRes = await api.raw('PATCH', `/bookings/${bookingId}/confirm`);
    expect(confirmRes.status).toBe(200);

    await page.goto('/bookings');
    await page.waitForLoadState('networkidle');

    await page.goto(`/bookings/${bookingId}`);
    await page.waitForLoadState('networkidle');

    const cancelBtn = page.locator(
      '[data-testid="cancel-booking"], button:has-text("Cancel Booking"), button:has-text("Cancel")',
    ).first();
    await cancelBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await cancelBtn.click();

    const confirmDialog = page.locator(
      '[data-testid="confirm-cancel"], button:has-text("Yes, Cancel"), [role="dialog"] button:has-text("Cancel"):not(:has-text("Booking"))',
    ).first();
    if (await confirmDialog.isVisible().catch(() => false)) {
      await confirmDialog.click();
    }

    await expect(
      page.locator(
        '[data-testid="booking-status"][data-status="cancelled"], ' +
        '[data-testid="cancelled-badge"], ' +
        'text=Booking Cancelled',
      ).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

});
