import { createHash, randomBytes } from 'node:crypto';
import { test, expect, type Browser, type APIRequestContext } from '@playwright/test';
import {
  query,
  insertUser,
  insertOrganisation,
  insertBranch,
  insertResource,
} from '../../helpers/database';
import { testUsers } from '../../data/users';
import {
  testCourts,
  organisationPayload,
  branchPayload,
  bookingPayload,
} from '../../data/courts';

/**
 * P6-04 — A6 / A7 / A8 (auth, session lifecycle, tenant isolation).
 *
 * STATUS: AUTHORED, NOT EXECUTED. All three groups write to the approved test
 * database (`courtzon_v3` @ 127.0.0.1:3307) and are gated by the approved
 * Hostinger/test window (see `docs/release/E2E_SCENARIO_MATRIX.md` §3.1a).
 *
 * SESSIONS ARE SEEDED DIRECTLY (same convention as
 * `tournament/tournament-venue-flow.spec.ts:23–31`) instead of going through
 * `/auth/login`:
 *   - the E2E `insertUser` helper stores a local `full_phone` (11 digits) while
 *     `authService.login` looks the user up by country-code-prefixed phone
 *     (`auth.service.ts:520–529`), so login would not resolve these fixtures;
 *   - the admin fixture logs in with an email, which `LoginSchema` rejects
 *     (`auth.dto.ts:28–29` — 11-digit phone only).
 * Those are pre-existing fixture/login mismatches (documented as blockers);
 * seeding hashed sessions exercises the real auth middleware, permission
 * resolution and org guards without depending on them.
 *
 * Never prints tokens: cookies are only sent, never asserted/logged by value.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const hash256 = (value: string) => createHash('sha256').update(value).digest('hex');
const rawToken = () => randomBytes(48).toString('base64url');

interface SeededSession {
  /** `Cookie` header value containing both cookies (never printed). */
  header: string;
  sessionToken: string;
  refreshToken: string;
}

/** Insert a hashed session row directly (existing E2E convention). */
async function seedSession(userId: number, opts: { refresh?: boolean } = {}): Promise<SeededSession> {
  const sessionToken = rawToken();
  const refreshToken = rawToken();
  await query(
    `INSERT INTO user_sessions
       (user_id, device_id, session_token_hash, refresh_token_hash, ip_address, user_agent, expires_at, refresh_token_expires_at)
     VALUES (?, NULL, ?, ?, '127.0.0.1', 'playwright', DATE_ADD(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
    [userId, hash256(sessionToken), hash256(refreshToken)],
  );
  const header = opts.refresh === false
    ? `session_token=${sessionToken}`
    : `session_token=${sessionToken}; refresh_token=${refreshToken}`;
  return { header, sessionToken, refreshToken };
}

async function roleId(slug: string): Promise<number> {
  const [rows] = await query<any[]>('SELECT id FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1', [slug]);
  if (!rows.length) throw new Error(`Role '${slug}' is not seeded in the test database`);
  return Number(rows[0].id);
}

/** Grant a role the same way the existing tournament specs do. */
async function grantRole(userId: number, slug: string): Promise<void> {
  await query(
    'INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, 1)',
    [userId, await roleId(slug)],
  );
}

/** Create an active player user + `player` role + a seeded session. */
async function createPlayerActor(): Promise<{ userId: number; session: SeededSession }> {
  const user = testUsers.player();
  const userId = await insertUser({
    phoneNumber: user.phoneNumber,
    password: user.password,
    fullName: user.fullName,
    email: user.email,
    gender: user.gender,
    timezone: user.timezone,
    countryId: user.countryId,
  });
  await grantRole(userId, 'player');
  return { userId, session: await seedSession(userId) };
}

/** Create an active platform admin (super_admin) + a seeded session. */
async function createAdminActor(): Promise<{ userId: number; session: SeededSession }> {
  const admin = testUsers.admin();
  const userId = await insertUser({
    phoneNumber: admin.phoneNumber,
    password: admin.password,
    fullName: admin.fullName,
    email: admin.email,
    gender: 'male',
    timezone: 'UTC',
    countryId: 1,
  });
  await grantRole(userId, 'super_admin');
  return { userId, session: await seedSession(userId) };
}

function cookieHeader(session: SeededSession): Record<string, string> {
  return { Cookie: session.header };
}

async function me(api: APIRequestContext, session: SeededSession) {
  return api.get(`${BACKEND_URL}/auth/me`, { headers: cookieHeader(session) });
}

/** Browser context with the seeded session cookies (for UI access checks). */
async function contextWithSession(browser: Browser, session: SeededSession) {
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'session_token', value: session.sessionToken, url: FRONTEND_URL },
    ...(session.header.includes('refresh_token')
      ? [{ name: 'refresh_token', value: session.refreshToken, url: FRONTEND_URL }]
      : []),
  ]);
  return context;
}

// ─────────────────────────────────────────────────────────────────────────────
// A6 — role and permission enforcement (allowed + denied)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('A6 — role and permission enforcement', () => {
  test('player: allowed booking creation, denied admin/finance/booking-status actions', async ({ request, browser }) => {
    const { userId, session } = await createPlayerActor();

    // Allowed: bookings.create (player template).
    const orgId = await insertOrganisation(organisationPayload(userId));
    const branchId = await insertBranch(branchPayload(orgId));
    const resourceId = await insertResource(testCourts.tennisCourt(branchId));
    const created = await request.post(`${BACKEND_URL}/bookings`, {
      headers: cookieHeader(session),
      data: bookingPayload(resourceId, branchId),
    });
    expect([200, 201]).toContain(created.status());
    const createdBody = await created.json();
    expect(createdBody?.id ?? createdBody?.data?.id).toBeDefined();

    // Denied: adminGuard (`rbac.routes.ts:26`).
    const adminUsers = await request.get(`${BACKEND_URL}/admin/users`, { headers: cookieHeader(session) });
    expect(adminUsers.status()).toBe(403);

    // Denied: admin.bookings.update-status | org.bookings.manage (`booking.routes.ts:16`).
    const statusChange = await request.patch(`${BACKEND_URL}/bookings/1/status`, {
      headers: cookieHeader(session),
      data: { status: 'cancelled', reason: 'A6 permission probe' },
    });
    expect(statusChange.status()).toBe(403);

    // Denied: financial.reconcile (`payment.routes.ts:13`).
    const refund = await request.post(`${BACKEND_URL}/payments/1/refund`, {
      headers: cookieHeader(session),
      data: { transactionId: 1, amount: 1, reason: 'A6 permission probe' },
    });
    expect(refund.status()).toBe(403);

    // UI: the admin workspace is denied with the explicit surface (RouteGuards.tsx:7–14).
    const playerContext = await contextWithSession(browser, session);
    const playerPage = await playerContext.newPage();
    await playerPage.goto(`${FRONTEND_URL}/admin/users`);
    await expect(playerPage.getByText('Access denied')).toBeVisible({ timeout: 15_000 });
    await playerContext.close();
  });

  test('admin: allowed admin user listing (and UI renders the admin page)', async ({ request, browser }) => {
    const { session: adminSession } = await createAdminActor();
    const res = await request.get(`${BACKEND_URL}/admin/users`, { headers: cookieHeader(adminSession) });
    expect(res.status()).toBe(200);

    const adminContext = await contextWithSession(browser, adminSession);
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${FRONTEND_URL}/admin/users`);
    await expect(adminPage.getByText('Access denied')).toHaveCount(0);
    await expect(adminPage).toHaveURL(/\/admin\/users/);
    await adminContext.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A7 — session lifecycle (refresh rotation, logout, logout-all)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('A7 — session lifecycle', () => {
  test('logout-all revokes every other session immediately', async ({ request }) => {
    const actor = await createPlayerActor();
    const sessionA = actor.session;
    // A SECOND session for the SAME user (logout-all targets the user's sessions).
    const sessionB = await seedSession(actor.userId);

    // Both sessions are valid before the call.
    const beforeA = await me(request, sessionA);
    const beforeB = await me(request, sessionB);
    expect(beforeA.status()).toBe(200);
    expect((await beforeA.json())?.user).toBeTruthy();
    expect(beforeB.status()).toBe(200);
    expect((await beforeB.json())?.user).toBeTruthy();

    // logout-all must be driven by the refresh cookie (auth.service.ts:565–583).
    const logout = await request.post(`${BACKEND_URL}/auth/logout`, {
      headers: cookieHeader(sessionA),
      data: { allDevices: true },
    });
    expect(logout.status()).toBe(200);

    // Revocation is DB-backed and immediate (app.ts:233–248).
    const afterB = await me(request, sessionB);
    expect(afterB.status()).toBe(200);
    expect((await afterB.json())?.user).toBeNull();

    const protectedAfter = await request.get(`${BACKEND_URL}/bookings`, { headers: cookieHeader(sessionB) });
    expect(protectedAfter.status()).toBe(401);
  });

  test('single logout does NOT revoke a different session', async ({ request }) => {
    const actor = await createPlayerActor();
    const sessionA = actor.session;
    const sessionB = await seedSession(actor.userId);

    const logout = await request.post(`${BACKEND_URL}/auth/logout`, {
      headers: cookieHeader(sessionA),
      data: { allDevices: false },
    });
    expect(logout.status()).toBe(200);

    const stillValid = await me(request, sessionB);
    expect(stillValid.status()).toBe(200);
    expect((await stillValid.json())?.user).toBeTruthy();
  });

  test('refresh rotates the session and rejects reuse of the old refresh token', async ({ request }) => {
    const { session } = await createPlayerActor();

    const refreshed = await request.post(`${BACKEND_URL}/auth/refresh`, { headers: cookieHeader(session) });
    expect(refreshed.status()).toBe(200);

    // The old refresh token was revoked by rotation (auth.service.ts:550–563).
    const reuse = await request.post(`${BACKEND_URL}/auth/refresh`, { headers: cookieHeader(session) });
    expect(reuse.status()).toBe(401);
  });

  test('refresh after logout-all is rejected', async ({ request }) => {
    const actor = await createPlayerActor();
    const sessionA = actor.session;
    const sessionB = await seedSession(actor.userId);

    const logout = await request.post(`${BACKEND_URL}/auth/logout`, {
      headers: cookieHeader(sessionA),
      data: { allDevices: true },
    });
    expect(logout.status()).toBe(200);

    const refreshAfter = await request.post(`${BACKEND_URL}/auth/refresh`, { headers: cookieHeader(sessionB) });
    expect(refreshAfter.status()).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8 — organization isolation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('A8 — organization isolation', () => {
  test('a user of organisation B cannot read organisation A resources; owner A can', async ({ request }) => {
    const ownerA = await createPlayerActor();
    const ownerB = await createPlayerActor();

    const orgA = await insertOrganisation(organisationPayload(ownerA.userId));
    await insertBranch(branchPayload(orgA));
    const orgB = await insertOrganisation(organisationPayload(ownerB.userId));
    await insertBranch(branchPayload(orgB));

    // Owner A: allowed (requireOrganisationAccess, route-guard.ts:21–38).
    const allowed = await request.get(`${BACKEND_URL}/organisations/${orgA}/bookings`, {
      headers: cookieHeader(ownerA.session),
    });
    expect(allowed.status()).toBe(200);

    // User B (owns B only): denied on A's bookings — and no A data in the body.
    const denied = await request.get(`${BACKEND_URL}/organisations/${orgA}/bookings`, {
      headers: cookieHeader(ownerB.session),
    });
    expect(denied.status()).toBe(403);
    const deniedBody = await denied.json();
    expect(deniedBody?.error).toBe('FORBIDDEN');
    expect(deniedBody?.data).toBeUndefined();

    // Owner A: allowed on the org-scoped accounting dashboard (owner override,
    // app.ts:346–351). User B is denied (no scope on A).
    const accountingAllowed = await request.get(`${BACKEND_URL}/org/${orgA}/accounting/dashboard`, {
      headers: cookieHeader(ownerA.session),
    });
    expect(accountingAllowed.status()).toBe(200);

    const accountingDenied = await request.get(`${BACKEND_URL}/org/${orgA}/accounting/dashboard`, {
      headers: cookieHeader(ownerB.session),
    });
    expect(accountingDenied.status()).toBe(403);
    const accountingDeniedBody = await accountingDenied.json();
    expect(accountingDeniedBody?.data).toBeUndefined();
  });
});
