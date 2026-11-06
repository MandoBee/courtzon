import { test, expect } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../pages/DashboardPage';
import { NotificationPage } from '../../pages/NotificationPage';
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
import { api } from '../../helpers/api';
import { futureDate } from '../../helpers/time';

test.describe('Notification Deeplink', () => {

  test('trigger notification via booking and verify deeplink navigation', async ({ authenticatedPlayer }) => {
    const { page, user } = authenticatedPlayer;
    const dashboard = new DashboardPage(page);
    const notifications = new NotificationPage(page);

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

    const bookingRes = await api.createBooking({
      branchId,
      resourceId,
      bookingType: 'private_match',
      bookingDate: futureDate(3),
      startTime: '10:00',
      endTime: '11:00',
      paymentMethod: 'cash',
    });
    const bookingId = bookingRes.data?.id || bookingRes.data?.data?.id;
    expect(bookingId).toBeDefined();

    // No explicit confirm call: the authoritative booking V2 cash path already
    // confirms the booking and emits the canonical `booking:created` event.

    await dashboard.goto();
    await dashboard.openNotifications();
    await notifications.waitForNotification(`#${bookingId}`);

    const count = await notifications.getNotificationCount();
    expect(count).toBeGreaterThan(0);

    // The rendered notification must reference THIS booking (title/body carries
    // the booking id), so a notification for another entity cannot satisfy D1.
    const bookingNotification = notifications
      .getNotificationElements()
      .filter({ hasText: `#${bookingId}` })
      .first();
    await expect(bookingNotification).toBeVisible({ timeout: 10_000 });
    await bookingNotification.click();

    // Deep link must target the created booking (optional trailing slash).
    await expect(page).toHaveURL(new RegExp(`/bookings/${bookingId}/?$`), { timeout: 10_000 });
    await expect(page.locator('#root')).toBeVisible();
  });

});
