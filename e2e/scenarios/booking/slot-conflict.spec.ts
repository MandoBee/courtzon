import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../pages/LoginPage';
import { BookingPage } from '../../pages/BookingPage';
import {
  testCourts,
  organisationPayload,
  branchPayload,
} from '../../data/courts';
import {
  insertUser,
  insertOrganisation,
  insertBranch,
  insertResource,
  query,
} from '../../helpers/database';
import { testUsers } from '../../data/users';
import { futureDate } from '../../helpers/time';

test.describe.configure({ timeout: 180_000 });

/** Grant the seeded player role before sign-in (same convention as the fixture). */
async function grantPlayerRole(userId: number): Promise<void> {
  const [roleRows] = await query<any[]>(
    'SELECT id FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1',
    ['player'],
  );
  if (!roleRows.length) throw new Error('player role is not seeded in the test database');
  const playerRoleId = Number(roleRows[0].id);

  await query(
    'INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)',
    [userId, playerRoleId],
  );

  const [grantRows] = await query<any[]>(
    'SELECT COUNT(*) AS granted FROM user_roles WHERE user_id = ? AND role_id = ?',
    [userId, playerRoleId],
  );
  if (Number(grantRows[0]?.granted) !== 1) {
    throw new Error('player role grant was not applied');
  }
}

test.describe('Booking slot conflict', () => {

  test('two players racing for the same slot: exactly one booking and one conflict', async ({ authenticatedPlayer, browser }) => {
    const { page: playerAPage, user: playerA } = authenticatedPlayer;

    // ── Player A (fixture session) ───────────────────────────────────────────
    const [rowsA] = await query<any[]>(
      'SELECT id FROM users WHERE phone_number = ?',
      [playerA.phoneNumber],
    );
    const playerAId = rowsA[0]?.id;
    expect(playerAId).toBeDefined();

    const orgId = await insertOrganisation(organisationPayload(playerAId));
    const branchId = await insertBranch(branchPayload(orgId));
    const resource = testCourts.tennisCourt(branchId);
    const resourceId = await insertResource(resource);

    // ── Player B (separate user + separate browser context) ─────────────────
    const playerB = testUsers.player();
    const playerBId = await insertUser({
      phoneNumber: playerB.phoneNumber,
      password: playerB.password,
      fullName: playerB.fullName,
      email: playerB.email,
      gender: playerB.gender,
      timezone: playerB.timezone,
      countryId: playerB.countryId,
    });
    await grantPlayerRole(playerBId);

    const playerBContext = await browser.newContext();
    const playerBPage = await playerBContext.newPage();
    const playerBLogin = new LoginPage(playerBPage);
    await playerBLogin.goto();
    await playerBLogin.login(playerB.phoneNumber, playerB.password);
    await playerBLogin.waitForLoginSuccess();

    // ── Both players open the same resource and pick the same real slot ─────
    const bookingA = new BookingPage(playerAPage);
    const bookingB = new BookingPage(playerBPage);

    await Promise.all([
      bookingA.openResource(resourceId),
      bookingB.openResource(resourceId),
    ]);

    const bookingDate = futureDate(3);
    await Promise.all([
      bookingA.selectDate(bookingDate),
      bookingB.selectDate(bookingDate),
    ]);

    // Slots come from the resource grid (90-minute slots in the current data),
    // so both players must select the first slot that actually exists — never a
    // hard-coded time.
    const [slotA, slotB] = await Promise.all([
      bookingA.selectFirstAvailableSlot(),
      bookingB.selectFirstAvailableSlot(),
    ]);
    expect(slotA).toMatch(/^\d{2}:\d{2}$/);
    expect(slotB).toBe(slotA);

    // ── Submit concurrently: both flows are started in the same tick ────────
    const outcomes = await Promise.allSettled([
      (async () => {
        await bookingA.clickBookNow();
        await bookingA.waitForBookingConfirmation();
      })(),
      (async () => {
        await bookingB.clickBookNow();
        await bookingB.waitForBookingConfirmation();
      })(),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled').length;
    const rejected = outcomes.filter((o) => o.status === 'rejected').length;
    expect(fulfilled, 'exactly one booking must succeed').toBe(1);
    expect(rejected, 'the other attempt must be rejected').toBe(1);

    const winnerIsA = outcomes[0].status === 'fulfilled';
    const winnerPage = winnerIsA ? playerAPage : playerBPage;
    const loserPage = winnerIsA ? playerBPage : playerAPage;

    // Winner: confirmation page reached.
    await expect(winnerPage).toHaveURL(/\/bookings\/\d+\/confirmation/);

    // Loser: stayed on the booking form and saw the authoritative conflict
    // message. The backend returns one of two messages for this race
    // (`booking.service.ts:384` lock contention / `:397` slot no longer
    // available), rendered by `BookingFormPage.tsx:332-336`.
    await expect(loserPage).toHaveURL(new RegExp(`/book/${resourceId}$`));
    await expect(
      loserPage.getByText(/currently being booked by another user|no longer available/i),
    ).toBeVisible({ timeout: 15_000 });

    // Persisted proof: exactly one active booking exists for that slot.
    const [slotRows] = await query<any[]>(
      `SELECT COUNT(*) AS booked
         FROM bookings
        WHERE resource_id = ?
          AND booking_date = ?
          AND start_time = ?
          AND booking_status NOT IN ('cancelled', 'expired', 'no_show')`,
      [resourceId, bookingDate, slotA],
    );
    expect(Number(slotRows[0]?.booked)).toBe(1);

    await playerBContext.close();
  });

});
