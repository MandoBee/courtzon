import type { Page, WebSocketRoute } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.fixture';
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

/**
 * F3 — reconnect and duplicate-event control.
 *
 * Approved spec (E2E matrix §3.6a): observation surface `/matches`
 * (`['public-matches', …]`); the writer is a direct API call
 * (`POST /bookings` with `bookingType: 'public_match'`, `paymentMethod: 'cash'`);
 * After an outage + reconnect the match must appear EXACTLY ONCE, and repeated
 * transport frames for the same entity must not create a second row.
 *
 * What this spec does and does not prove (read carefully):
 *   - It proves: a real socket drop, a real reconnect, the reconnect-driven
 *     `/matches` reconciliation refetch, and that the writer's match appears in
 *     the observer's Discover list exactly once after reconnect.
 *   - It proves: while connected, a newly created `public_match` yields a real
 *     `match.available` frame carrying `bookingId`, the list refetches after that
 *     frame, and the match renders exactly once.
 *   - It does NOT inject synthetic duplicate frames and therefore does NOT prove
 *     dedupe of artificially repeated transport frames. "Duplicate tolerance"
 *     here means only that if the transport does deliver the same event more than
 *     once naturally, the rendered list must still contain a single row (the spec
 *     tolerates repeats rather than manufacturing them).
 *
 * Roles in this spec (revised 2026-11-03):
 *   - OBSERVER = the fixture player. That browser session opens `/matches`, so the
 *     writer's match is a *discoverable* match (observer is not a participant).
 *     The previous run used the creator's own session, where the match is filtered
 *     out of Discover because `m.is_participant` is true (`MatchListPage.tsx:221`)
 *     and only appears under "Joined" (`:226`).
 *   - WRITER = a separate user created for this test, used only through the API.
 *
 * Outage mechanism: Playwright's documented `page.routeWebSocket()`:
 *   - the live connection is closed with `WebSocketRoute.close()`, which the page
 *     observes as a disconnect (`socket-client.ts:111-118` → `reconnecting`);
 *   - while the outage window is active new handshakes are refused, so the client
 *     keeps retrying;
 *   - restoring the flag lets the next retry reach the server through
 *     `WebSocketRoute.connectToServer()`.
 * `context.setOffline(true)` alone was proven insufficient locally (the live
 * WebSocket stayed open). Limitation: this route only covers the WebSocket
 * transport; the client is configured `['websocket','polling']`
 * (`socket-client.ts:93`), so a polling fallback fails the disconnect assertion
 * explicitly instead of passing.
 *
 * Event payload (verified in code, 2026-11-03): `match.available` carries
 * **`bookingId`** — the producer emits `{ bookingId, userId, organisationId,
 * branchId, visibility, timestamp }` (`notification-engine.ts:58-62, 85-90`) and
 * the mapper copies `matchId` from that payload, so **`matchId` is absent**
 * (`socket-event-mapper.ts:771-798`). Dedupe is therefore evaluated per
 * `bookingId`; a `matchId` is never required.
 *
 * Rate limiting: one API login for the writer plus the fixture observer login and
 * two booking POSTs, no retries; a 429 anywhere is a test failure, not a skip.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

interface ApiSession {
  cookie: string;
}

interface CapturedSocketEvent {
  name: string;
  data: any;
  at: number;
}

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

async function loginAs(phoneNumber: string, password: string): Promise<ApiSession> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, password, countryCode: '+20' }),
  });

  expect(res.status, `writer API login must return 200 (429 is a failure), got ${res.status}`).toBe(200);

  const setCookies: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? ((res.headers as any).getSetCookie() as string[])
      : [(res.headers.get('set-cookie') || '')];

  const pair = setCookies
    .map((entry) => entry.split(';')[0].trim())
    .find((entry) => entry.startsWith('session_token='));

  expect(pair, 'login must set a session_token cookie').toBeTruthy();
  return { cookie: pair as string };
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function waitForLoginSplash(page: Page): Promise<void> {
  await page.waitForFunction(() => sessionStorage.getItem('cz_show_login_splash') !== '1', undefined, {
    timeout: 15_000,
  });
  await page
    .locator('[role="dialog"]')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

test.describe.configure({ timeout: 240_000 });

test.describe('F3 - reconnect and duplicate-event control', () => {

  test('observer sees the writer match exactly once after a real socket drop', async ({ authenticatedPlayer }) => {
    const { page: observerPage, user: observer } = authenticatedPlayer;

    // ── WRITER: separate user, API only ────────────────────────────────────
    const writerData = testUsers.player();
    const writerId = await insertUser({
      phoneNumber: writerData.phoneNumber,
      password: writerData.password,
      fullName: writerData.fullName,
      email: `e2e-f3-writer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      gender: writerData.gender,
      timezone: writerData.timezone,
      countryId: writerData.countryId,
    });
    await grantPlayerRole(writerId);

    // ── Shared tenant: one organisation/branch and TWO resources ───────────
    const orgId = await insertOrganisation(organisationPayload(writerId));
    const branchId = await insertBranch(branchPayload(orgId));
    const resourceOffline = testCourts.tennisCourt(branchId);
    const resourceOnline = testCourts.tennisCourt(branchId);
    const resourceOfflineId = await insertResource(resourceOffline);
    const resourceOnlineId = await insertResource(resourceOnline);

    const [resourceRows] = await query<any[]>(
      `SELECT r.opening_time, r.slot_duration, rt.default_slot_duration
         FROM resources r
         LEFT JOIN resource_types rt ON rt.id = r.resource_type_id
        WHERE r.id = ?`,
      [resourceOfflineId],
    );
    const resourceRow = resourceRows[0];
    expect(resourceRow, 'the seeded resource must exist').toBeTruthy();

    const startTime = String(resourceRow.opening_time ?? '08:00').slice(0, 5);
    const slotMinutes = Number(resourceRow.slot_duration ?? resourceRow.default_slot_duration ?? 60);
    expect(slotMinutes).toBeGreaterThan(0);
    const endTime = addMinutes(startTime, slotMinutes);
    const bookingDate = futureDate(5);

    // ── Observability: Socket.IO payloads on the OBSERVER socket ───────────
    const socketEvents: CapturedSocketEvent[] = [];
    const ingestSocketPayload = (payload: string): void => {
      for (const chunk of String(payload).split('\x1e')) {
        const trimmed = chunk.trim();
        if (!trimmed.startsWith('42')) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(2));
          if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
            socketEvents.push({ name: parsed[0], data: parsed[1] ?? null, at: Date.now() });
          }
        } catch {
          // Non-JSON/partial packet — ignore.
        }
      }
    };

    // ── Real socket drop/restore via page.routeWebSocket() ─────────────────
    let blockSocketConnections = false;
    const livePageSockets: WebSocketRoute[] = [];

    await observerPage.routeWebSocket(/\/socket\.io\//, (ws) => {
      if (blockSocketConnections) {
        ws.close({ code: 1012, reason: 'F3 simulated network drop' });
        return;
      }

      const server = ws.connectToServer();
      livePageSockets.push(ws);

      server.onMessage((message) => {
        ingestSocketPayload(String(message));
        ws.send(String(message));
      });
    });

    const dropLiveSockets = async (): Promise<void> => {
      blockSocketConnections = true;
      await Promise.all(
        livePageSockets.splice(0).map((ws) =>
          ws.close({ code: 1012, reason: 'F3 simulated network drop' }).catch(() => {}),
        ),
      );
    };

    const restoreSockets = (): void => {
      blockSocketConnections = false;
    };

    const matchListRequests: number[] = [];
    observerPage.on('request', (request) => {
      try {
        if (new URL(request.url()).pathname === '/matches') matchListRequests.push(Date.now());
      } catch {
        // Non-URL request — ignore.
      }
    });

    const createPublicMatch = async (session: ApiSession, resourceId: number): Promise<number> => {
      const res = await fetch(`${BACKEND_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: session.cookie },
        body: JSON.stringify({
          branchId,
          resourceId,
          bookingType: 'public_match',
          bookingDate,
          startTime,
          endTime,
          paymentMethod: 'cash',
        }),
      });
      const body = await res.json().catch(() => null);
      expect(
        res.status,
        `public_match creation must return 2xx, got ${res.status}: ${JSON.stringify(body)}`,
      ).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      const bookingId = body?.id ?? body?.data?.id;
      expect(bookingId, 'booking id is required').toBeDefined();
      return Number(bookingId);
    };

    // ── Observer: open /matches once (no reload during the whole test) ─────
    void observer; // observer identity is only used for the browser session
    await waitForLoginSplash(observerPage);
    await observerPage.goto('/matches');
    await observerPage.waitForLoadState('networkidle');

    let mainFrameNavigations = 0;
    observerPage.on('framenavigated', (frame) => {
      if (frame === observerPage.mainFrame()) mainFrameNavigations += 1;
    });

    const rowFor = (resourceName: string) =>
      observerPage.getByRole('heading', { level: 3, name: resourceName });

    const writerSession = await loginAs(writerData.phoneNumber, writerData.password);

    // ══ Phase 1: REAL socket drop → writer API write during outage → restore ═
    await dropLiveSockets();
    await expect(observerPage.getByText('Reconnecting...')).toBeVisible({ timeout: 20_000 });

    await createPublicMatch(writerSession, resourceOfflineId);

    const restoreAt = Date.now();
    restoreSockets();

    // Reconnect is proven by the reconciliation refetch (only fires on the
    // disconnected/reconnecting → connected transition) and by the new row.
    await expect
      .poll(() => matchListRequests.some((at) => at > restoreAt), { timeout: 30_000, intervals: [100, 250] })
      .toBe(true);
    // The observer is NOT a participant, so the writer's match is in Discover.
    await expect(rowFor(resourceOffline.name)).toHaveCount(1, { timeout: 30_000 });

    // NOTE: a `match.available` frame for this booking may still arrive — the
    // event is produced asynchronously (Event Bus + Notification Engine) and can
    // be emitted after the socket is back. That is a late emission, not a
    // Socket.IO replay, so the spec deliberately makes NO claim about it here.

    // ══ Phase 2: ONLINE write → real frame + duplicate tolerance ═══════════
    const onlineWriteStartedAt = Date.now();
    const onlineBookingId = await createPublicMatch(writerSession, resourceOnlineId);

    await expect
      .poll(
        () =>
          socketEvents.some(
            (event) => event.name === 'match.available' && Number(event.data?.bookingId) === onlineBookingId,
          ),
        { timeout: 15_000, intervals: [100, 250] },
      )
      .toBe(true);

    const frame = socketEvents
      .filter((event) => event.name === 'match.available' && Number(event.data?.bookingId) === onlineBookingId)
      .sort((a, b) => a.at - b.at)[0];
    expect(frame, 'a match.available frame carrying the created bookingId is required').toBeDefined();

    // Payload as the running code emits it: `bookingId` present, `matchId` absent.
    expect(Number(frame!.data?.bookingId)).toBe(onlineBookingId);
    expect(frame!.data?.matchId, 'match:available currently carries no matchId').toBeUndefined();
    expect(frame!.at).toBeGreaterThanOrEqual(onlineWriteStartedAt);

    await expect
      .poll(() => matchListRequests.some((at) => at > frame!.at), { timeout: 15_000, intervals: [100, 250] })
      .toBe(true);

    // Exactly one row per match. This tolerates NATURAL repeat delivery (the
    // spec does not inject duplicate frames), and counts how many frames actually
    // arrived for transparency.
    await expect(rowFor(resourceOnline.name)).toHaveCount(1, { timeout: 15_000 });
    await expect(rowFor(resourceOffline.name)).toHaveCount(1);

    const framesForBooking = socketEvents.filter(
      (event) => event.name === 'match.available' && Number(event.data?.bookingId) === onlineBookingId,
    ).length;
    expect(framesForBooking, 'the event must be observed at least once').toBeGreaterThanOrEqual(1);

    expect(mainFrameNavigations, 'no document reload/navigation is allowed during the test').toBe(0);
  });

});
