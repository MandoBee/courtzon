import { test, expect } from '../../fixtures/auth.fixture';
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

    // The post-login welcome splash (`LoginSplash.tsx:25-57`) is a full-screen
    // overlay (`z-[100]`) that intercepts pointer events, and a full page load
    // performed while its flag is set re-arms it and then redirects to `/app`.
    // Let it finish while the page is still on its post-login route.
    await page.waitForFunction(
      () => sessionStorage.getItem('cz_show_login_splash') !== '1',
      undefined,
      { timeout: 15_000 },
    );
    await page
      .locator('[role="dialog"]')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});

    await page.goto(`/bookings/${bookingId}`);
    await page.waitForLoadState('networkidle');

    // The cancel flow is inline (`BookingDetailPage.tsx:166-199`): the trigger
    // button reveals an optional reason input plus an inline confirm button.
    // There is no dialog and no `data-testid` on these controls; the labels come
    // from translation keys that fall back to their raw key, and both the
    // English label and the raw key contain "cancel".
    const cancelTrigger = page.getByRole('button', { name: /cancel/i }).first();
    await cancelTrigger.click();

    const reasonInput = page.locator('input').first();
    await reasonInput.fill('B2 automated cancellation');

    const confirmCancel = page.getByRole('button', { name: /cancel/i }).first();
    await confirmCancel.click();

    // The detail page does not invalidate its own `['booking', id]` query
    // (`BookingDetailPage.tsx:70-75`), so reload to read the persisted state.
    // The status badge is the `<span>` next to the `<h1>`
    // (`BookingDetailPage.tsx:99-102`) and renders `booking_status` verbatim.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1 + span')).toHaveText(/cancelled/i, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /cancel/i })).toHaveCount(0);
  });

});
