import { test, expect } from '@playwright/test';
import {
  insertUser,
  insertOrganisation,
  insertBranch,
  insertResource,
  query,
} from '../../helpers/database';
import {
  testCourts,
  organisationPayload,
  branchPayload,
} from '../../data/courts';
import { testUsers } from '../../data/users';
import { futureDate } from '../../helpers/time';

/**
 * F2 — simultaneous identical booking (API-level).
 *
 * Approved spec (E2E matrix §3.6a, "F2"): two DIFFERENT users fire
 * `POST /bookings` for the same resource/date/slot concurrently. Acceptance is
 * exactly one 2xx and exactly one `409`; any other status (400/422/429/5xx) is a
 * failure, and only one booking row may exist for that slot afterwards.
 *
 * The shared `e2e/helpers/api.ts` keeps a single module-level cookie jar and the
 * login response strips the tokens (`sanitizeAuthPayload`), so per-user sessions
 * are captured here directly from `Set-Cookie`.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

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

interface ApiSession {
  cookie: string;
}

/**
 * Log in over HTTP and keep this user's own `session_token` cookie.
 * `POST /auth/login` + `LoginSchema` (`auth.dto.ts:28-31`) require the local
 * 11-digit `phoneNumber`, a `password`, and the optional `countryCode`.
 */
async function loginAs(phoneNumber: string, password: string): Promise<ApiSession> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, password, countryCode: '+20' }),
  });

  expect(
    res.status,
    `login for an E2E player must return 200 (429 rate limiting is a failure here), got ${res.status}`,
  ).toBe(200);

  const setCookies: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? ((res.headers as any).getSetCookie() as string[])
      : [(res.headers.get('set-cookie') || '')];

  const pairs = setCookies
    .filter(Boolean)
    .map((entry) => entry.split(';')[0].trim())
    .filter(Boolean);

  // Cookie names are fixed by `auth-cookies.ts:3-4`.
  const sessionPair = pairs.find((pair) => pair.startsWith('session_token='));
  expect(sessionPair, 'login must set a session_token cookie').toBeTruthy();

  return { cookie: sessionPair as string };
}

async function postBooking(
  cookie: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BACKEND_URL}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(payload),
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { status: res.status, body };
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

test.describe('F2 - simultaneous identical booking (API)', () => {

  test('two users book the same slot concurrently: exactly one 2xx + one 409', async () => {
    // ── Two distinct players, each with the player role granted up front ────
    const playerA = testUsers.player();
    const playerB = {
      ...testUsers.player(),
      email: `e2e-player-f2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
    };

    const playerAId = await insertUser({
      phoneNumber: playerA.phoneNumber,
      password: playerA.password,
      fullName: playerA.fullName,
      email: playerA.email,
      gender: playerA.gender,
      timezone: playerA.timezone,
      countryId: playerA.countryId,
    });
    const playerBId = await insertUser({
      phoneNumber: playerB.phoneNumber,
      password: playerB.password,
      fullName: playerB.fullName,
      email: playerB.email,
      gender: playerB.gender,
      timezone: playerB.timezone,
      countryId: playerB.countryId,
    });

    await grantPlayerRole(playerAId);
    await grantPlayerRole(playerBId);

    // ── Shared resource + a slot derived from the real scheduling grid ──────
    const orgId = await insertOrganisation(organisationPayload(playerAId));
    const branchId = await insertBranch(branchPayload(orgId));
    const resource = testCourts.tennisCourt(branchId);
    const resourceId = await insertResource(resource);

    // Slot boundaries come from the same source the UI uses
    // (`getResourceSlots`: resource opening/closing + slot duration, with the
    // resource type's default duration as fallback — `booking.service.ts:1402-1404`).
    const [resourceRows] = await query<any[]>(
      `SELECT r.opening_time, r.closing_time, r.slot_duration, rt.default_slot_duration
         FROM resources r
         LEFT JOIN resource_types rt ON rt.id = r.resource_type_id
        WHERE r.id = ?`,
      [resourceId],
    );
    const resourceRow = resourceRows[0];
    expect(resourceRow, 'the seeded resource must exist').toBeTruthy();

    const opening = String(resourceRow.opening_time ?? '08:00').slice(0, 5);
    const duration = Number(
      resourceRow.slot_duration ?? resourceRow.default_slot_duration ?? 60,
    );
    expect(duration).toBeGreaterThan(0);

    const bookingDate = futureDate(3);
    const startTime = opening;
    const endTime = addMinutes(startTime, duration);

    const payload = {
      branchId,
      resourceId,
      bookingType: 'private_match',
      bookingDate,
      startTime,
      endTime,
      paymentMethod: 'cash',
    };

    // ── Separate sessions per user (never the shared helper jar) ────────────
    const sessionA = await loginAs(playerA.phoneNumber, playerA.password);
    const sessionB = await loginAs(playerB.phoneNumber, playerB.password);
    expect(sessionA.cookie).not.toBe(sessionB.cookie);

    // ── Fire both requests together ────────────────────────────────────────
    const [first, second] = await Promise.all([
      postBooking(sessionA.cookie, payload),
      postBooking(sessionB.cookie, payload),
    ]);

    const statuses = [first.status, second.status];
    const successes = [first, second].filter((r) => r.status >= 200 && r.status < 300);
    const conflicts = [first, second].filter((r) => r.status === 409);

    expect(
      successes,
      `expected exactly one 2xx; statuses were ${JSON.stringify(statuses)}`,
    ).toHaveLength(1);
    expect(
      conflicts,
      `expected exactly one 409; statuses were ${JSON.stringify(statuses)}`,
    ).toHaveLength(1);
    expect(
      statuses.some((status) => status === 429),
      'a 429 rate-limit response makes this run invalid',
    ).toBe(false);

    const winner = successes[0];
    const winnerBody = winner.body?.data ?? winner.body;
    expect(winnerBody?.id ?? winnerBody?.bookingId).toBeDefined();

    // ── Persisted proof: exactly one active booking for that slot ───────────
    const [slotRows] = await query<any[]>(
      `SELECT COUNT(*) AS booked
         FROM bookings
        WHERE resource_id = ?
          AND booking_date = ?
          AND start_time = ?
          AND booking_status NOT IN ('cancelled', 'expired', 'no_show')`,
      [resourceId, bookingDate, startTime],
    );
    expect(Number(slotRows[0]?.booked)).toBe(1);
  });

});
