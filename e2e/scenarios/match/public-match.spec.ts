import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../pages/LoginPage';
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

test.describe.configure({ timeout: 180_000 });

/**
 * `api.login` returns HTTP 429 when the per-IP rate limit is saturated (the
 * backend logs `Rate limit exceeded, retry in Ns`). Wait for the window to
 * drain instead of treating it as a credential failure.
 */
async function apiLoginWithRetry(phoneNumber: string, password: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const res = await api.login(phoneNumber, password);
    if (res.status === 200) return res;
    if (res.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 8_000));
      continue;
    }
    return res;
  }
  throw new Error('api.login kept returning 429 (rate limit)');
}

/**
 * `ProtectedRoute` renders an `AuthCheckFailed` surface ("We couldn't verify
 * your session") when `/auth/me` answers 429/5xx. Retry via its own button.
 */
async function ensureSession(page: Page): Promise<void> {
  const retry = page.getByRole('button', { name: /try again/i });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!(await retry.isVisible().catch(() => false))) return;
    await page.waitForTimeout(6_000);
    await retry.click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  if (await retry.isVisible().catch(() => false)) {
    throw new Error('Session check kept failing (rate limited or backend unavailable)');
  }
}

/** `LoginSplash` is a full-screen overlay that also redirects on dismissal. */
async function waitForLoginSplash(page: Page): Promise<void> {
  await page.waitForFunction(
    () => sessionStorage.getItem('cz_show_login_splash') !== '1',
    undefined,
    { timeout: 15_000 },
  );
  await page
    .locator('[role="dialog"]')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

/**
 * The public match row is created asynchronously from `booking:confirmed`
 * (`match.service.ts:26-126`), so poll the list endpoint until the booking is
 * visible before exercising the UI. Interval is deliberately coarse to stay
 * well inside the per-IP rate limit.
 */
async function waitForPublicMatch(bookingId: number | string): Promise<void> {
  const id = Number(bookingId);
  await expect
    .poll(
      async () => {
        const res = await api.raw<any>('GET', '/matches');
        const list: any[] = res.data?.data ?? [];
        return list.some((m) => Number(m.booking_id) === id);
      },
      { timeout: 30_000, intervals: [2_000] },
    )
    .toBe(true);
}

test.describe('Public Match', () => {

  test('create a public match and verify it appears', async ({ authenticatedPlayer }) => {
    const { page, user } = authenticatedPlayer;
    const matchPage = new MatchPage(page);

    const loginRes = await apiLoginWithRetry(user.phoneNumber, user.password);
    expect(loginRes.status).toBe(200);

    const [rows] = await query<any[]>(
      'SELECT id FROM users WHERE phone_number = ?',
      [user.phoneNumber],
    );
    const userId = rows[0]?.id;
    expect(userId).toBeDefined();

    const orgId = await insertOrganisation(organisationPayload(userId));
    const branchId = await insertBranch(branchPayload(orgId));
    const resource = testCourts.tennisCourt(branchId);
    const resourceId = await insertResource(resource);

    const booking = bookingPayload(resourceId, branchId);
    const createRes = await api.createBooking({
      ...booking,
      bookingType: 'public_match',
    });
    const bookingId = createRes.data?.id || createRes.data?.data?.id;
    expect(bookingId).toBeDefined();

    await waitForPublicMatch(bookingId);

    await waitForLoginSplash(page);
    await matchPage.goto();
    await ensureSession(page);

    // The host is already a participant, so the match is listed under "Joined".
    // `MatchListPage` renders no `data-testid`; the stable markers are the
    // unique resource-name heading (`MatchListPage.tsx:290`) and the row's
    // "View" link (`MatchListPage.tsx:349-351`).
    await page.getByRole('button', { name: /^Joined \(/ }).click();

    const card = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { level: 3, name: resource.name }) })
      .last();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByRole('link', { name: /^View$/ })).toBeVisible();
  });

  test('second player can view and join a public match', async ({ authenticatedPlayer, browser }) => {
    const { user } = authenticatedPlayer;

    const loginRes = await apiLoginWithRetry(user.phoneNumber, user.password);
    expect(loginRes.status).toBe(200);

    const [rows] = await query<any[]>(
      'SELECT id FROM users WHERE phone_number = ?',
      [user.phoneNumber],
    );
    const userId = rows[0]?.id;
    expect(userId).toBeDefined();

    const orgId = await insertOrganisation(organisationPayload(userId));
    const branchId = await insertBranch(branchPayload(orgId));
    const resource = testCourts.tennisCourt(branchId);
    const resourceId = await insertResource(resource);

    const booking = bookingPayload(resourceId, branchId);
    const createRes = await api.createBooking({
      ...booking,
      bookingType: 'public_match',
    });
    const bookingId = createRes.data?.id || createRes.data?.data?.id;
    expect(bookingId).toBeDefined();

    await waitForPublicMatch(bookingId);

    // A role-less user has no `matches.apply`, so grant the project's player
    // role before the second player signs in (same convention as
    // `auth.fixture.ts`; no shared fixture is modified).
    const secondUser = testUsers.secondPlayer();
    const secondUserId = await insertUser({
      phoneNumber: secondUser.phoneNumber,
      password: secondUser.password,
      fullName: secondUser.fullName,
      email: secondUser.email,
      gender: secondUser.gender,
    });

    const [roleRows] = await query<any[]>(
      'SELECT id FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1',
      ['player'],
    );
    if (!roleRows.length) throw new Error('player role is not seeded in the test database');
    const playerRoleId = Number(roleRows[0].id);
    await query(
      'INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)',
      [secondUserId, playerRoleId],
    );
    const [grantRows] = await query<any[]>(
      'SELECT COUNT(*) AS granted FROM user_roles WHERE user_id = ? AND role_id = ?',
      [secondUserId, playerRoleId],
    );
    expect(Number(grantRows[0]?.granted)).toBe(1);

    // Join from the SECOND player's own browser session (never the host's).
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    const secondLoginPage = new LoginPage(secondPage);
    await secondLoginPage.goto();
    await secondLoginPage.login(secondUser.phoneNumber, secondUser.password);
    await secondLoginPage.waitForLoginSuccess();

    await waitForLoginSplash(secondPage);
    await secondPage.goto('/matches');
    await secondPage.waitForLoadState('networkidle');
    await ensureSession(secondPage);

    const discoverCard = secondPage
      .locator('div')
      .filter({ has: secondPage.getByRole('heading', { level: 3, name: resource.name }) })
      .filter({ has: secondPage.getByRole('button', { name: /^Join$/ }) })
      .last();
    await expect(discoverCard).toBeVisible({ timeout: 15_000 });
    await discoverCard.getByRole('button', { name: /^Join$/ }).click();

    // Proof of the submit response (`MatchListPage.tsx:180`), then proof of the
    // persisted state: the match moves out of Discover into "Applied", where the
    // row exposes "Withdraw" instead of "Join" (`MatchListPage.tsx:340-346`).
    await expect(secondPage.getByText('Joined! Awaiting approval.')).toBeVisible({ timeout: 15_000 });

    await secondPage.getByRole('button', { name: /^Applied \(/ }).click();
    const appliedCard = secondPage
      .locator('div')
      .filter({ has: secondPage.getByRole('heading', { level: 3, name: resource.name }) })
      .last();
    await expect(appliedCard).toBeVisible({ timeout: 15_000 });
    await expect(appliedCard.getByRole('button', { name: /withdraw/i })).toBeVisible();

    await secondContext.close();
  });

});
