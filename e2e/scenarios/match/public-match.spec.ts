import { test, expect } from '../../fixtures/auth';
import { MatchPage } from '../../pages/MatchPage';
import {
  testCourts,
  organisationPayload,
  branchPayload,
  bookingPayload,
} from '../../data/courts';
import {
  insertUser,
  insertOrganisation,
  insertBranch,
  insertResource,
  query,
} from '../../helpers/database';
import { api } from '../../helpers/api';
import { testUsers } from '../../data/users';

test.describe('Public Match', () => {

  test('create a public match and verify it appears', async ({ authenticatedPlayer }) => {
    const { page, user } = authenticatedPlayer;
    const matchPage = new MatchPage(page);

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
    const createRes = await api.createBooking({
      ...booking,
      bookingType: 'public_match',
    });
    const matchId = createRes.data?.id || createRes.data?.data?.id;
    expect(matchId).toBeDefined();

    await matchPage.goto();
    await expect(
      page.locator(`[data-testid="match-card-${matchId}"], [data-testid^="match-"]`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('second player can view and join a public match', async ({ page, authenticatedPlayer }) => {
    const { user } = authenticatedPlayer;
    const matchPage = new MatchPage(page);

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
    const createRes = await api.createBooking({
      ...booking,
      bookingType: 'public_match',
    });
    const matchId = createRes.data?.id || createRes.data?.data?.id;
    expect(matchId).toBeDefined();

    const secondUser = testUsers.secondPlayer();
    const secondUserId = await insertUser({
      phoneNumber: secondUser.phoneNumber,
      password: secondUser.password,
      fullName: secondUser.fullName,
      email: secondUser.email,
      gender: secondUser.gender,
    });

    const secondLoginRes = await api.login(secondUser.phoneNumber, secondUser.password);
    expect(secondLoginRes.status).toBe(200);

    await page.goto('/matches');
    await page.waitForLoadState('networkidle');
    await matchPage.joinMatch(matchId);

    await expect(
      page.locator(
        '[data-testid="join-success"], [data-testid="toast-message"], ' +
        'text=Joined, text=Request sent',
      ).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

});
