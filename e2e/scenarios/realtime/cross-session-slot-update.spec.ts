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

/**
 * F1 — cross-session realtime update (slot picker).
 *
 * Approved spec (E2E matrix §3.6a): the SAME player holds two independent
 * sessions. Session A is a Playwright browser showing the slot picker for a
 * resource/date; session B is an API session that creates the booking and then
 * cancels it. A must render the slot as taken and then as free again WITHOUT any
 * reload or manual navigation.
 *
 * Realtime path under test: `booking.created` / `booking.cancelled` →
 * socket room `user:<id>` (`socket-event-mapper.ts:203-206`) →
 * `invalidateQueries(['resource-slots', resourceId, bookingDate])`
 * (`useRealtimeCacheUpdates.ts:737-750, 784-790`).
 *
 * To prove the change is caused by Socket.IO (and not by an unrelated refetch),
 * this spec records, for session A:
 *   1. the actual Socket.IO event payloads, over BOTH transports the client is
 *      configured with (`socket-client.ts:91-100`: `['websocket', 'polling']`) —
 *      `framereceived` for WebSocket frames and the HTTP response body of
 *      `/socket.io/` polling packets (engine.io packets are `\x1e`-separated and
 *      Socket.IO events are the `42[...]` packets);
 *   2. every request to the real slot endpoint the app calls
 *      (`/resources/:id/slots?date=…`, same-origin: `api.ts` baseURL resolves to
 *      '' on localhost:5173, proxied by nginx);
 * then requires: matching event → a slot refetch strictly after that event →
 * the slot button state change.
 *
 * Rate limiting: session B logs in once and no request is retried, so this spec
 * makes no claim that a 429 cannot occur; a 429 anywhere is a test failure.
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

async function loginAs(phoneNumber: string, password: string): Promise<ApiSession> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, password, countryCode: '+20' }),
  });

  expect(
    res.status,
    `session B login must return 200 (a 429 rate-limit response is a failure, not a skip), got ${res.status}`,
  ).toBe(200);

  const setCookies: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? ((res.headers as any).getSetCookie() as string[])
      : [(res.headers.get('set-cookie') || '')];

  const pairs = setCookies
    .filter(Boolean)
    .map((entry) => entry.split(';')[0].trim())
    .filter(Boolean);

  const sessionPair = pairs.find((pair) => pair.startsWith('session_token='));
  expect(sessionPair, 'login must set a session_token cookie').toBeTruthy();

  return { cookie: sessionPair as string };
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

test.describe.configure({ timeout: 180_000 });

test.describe('F1 - cross-session realtime slot update', () => {

  test('slot becomes taken then free in session A via Socket.IO events', async ({ authenticatedPlayer }) => {
    const { page: pageA, user } = authenticatedPlayer;
    const bookingPageA = new BookingPage(pageA);

    // ── Shared fixture data (owned by the same player) ─────────────────────
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

    // Slot boundaries come from the same source the UI uses
    // (`getResourceSlots`: resource opening/closing + slot duration, with the
    // resource type's default as fallback — `booking.service.ts:1402-1404`).
    const [resourceRows] = await query<any[]>(
      `SELECT r.opening_time, r.closing_time, r.slot_duration, rt.default_slot_duration
         FROM resources r
         LEFT JOIN resource_types rt ON rt.id = r.resource_type_id
        WHERE r.id = ?`,
      [resourceId],
    );
    const resourceRow = resourceRows[0];
    expect(resourceRow, 'the seeded resource must exist').toBeTruthy();

    const startTime = String(resourceRow.opening_time ?? '08:00').slice(0, 5);
    const duration = Number(
      resourceRow.slot_duration ?? resourceRow.default_slot_duration ?? 60,
    );
    expect(duration).toBeGreaterThan(0);
    const endTime = addMinutes(startTime, duration);

    // Beyond the longest cancellation window present locally (1440 minutes = 24h),
    // so a policy-driven `409` cannot legitimately occur, and the policy itself
    // is never modified.
    const bookingDate = futureDate(5);

    // The picker renders only AVAILABLE slots as buttons (`BookingFormPage.tsx:193-221`),
    // so "taken" = the button disappears and "free again" = it reappears.
    const slotButton = pageA.getByRole('button', {
      name: new RegExp(`^${startTime}\\s*-\\s*${endTime}$`),
    });

    // ── Observability for session A: Socket.IO events + slot refetches ──────
    const socketEvents: CapturedSocketEvent[] = [];
    const slotRequests: number[] = [];

    const ingestSocketPayload = (payload: string): void => {
      // engine.io/polling payloads separate packets with \x1e; Socket.IO event
      // packets are `42[<event>,<data>]`.
      for (const chunk of String(payload).split('\x1e')) {
        const trimmed = chunk.trim();
        if (!trimmed.startsWith('42')) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(2));
          if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
            socketEvents.push({ name: parsed[0], data: parsed[1] ?? null, at: Date.now() });
          }
        } catch {
          // Non-JSON or partial packet — ignore.
        }
      }
    };

    // WebSocket transport (client prefers it: `socket-client.ts:93`).
    pageA.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => ingestSocketPayload(String(frame.payload)));
    });

    // Polling transport fallback: server→client events arrive in GET response bodies.
    pageA.on('response', async (response) => {
      if (!response.url().includes('/socket.io/')) return;
      try {
        ingestSocketPayload(await response.text());
      } catch {
        // Body unavailable (redirect/aborted) — ignore.
      }
    });

    // The real slot endpoint the page calls: `api.get('/resources/:id/slots?date=…')`
    // (same-origin on :5173, proxied by nginx).
    pageA.on('request', (request) => {
      if (request.url().includes(`/resources/${resourceId}/slots`)) {
        slotRequests.push(Date.now());
      }
    });

    // ── Session A: open the picker and wait for the live slot grid ──────────
    await bookingPageA.openResource(resourceId);
    await bookingPageA.selectDate(bookingDate);
    await expect(slotButton).toHaveCount(1, { timeout: 15_000 });

    // Count main-frame document navigations from this point on. Note what this
    // proves and what it does not: `framenavigated` fires on reload / document
    // navigation, but NOT on SPA `history.pushState` changes and NOT on a
    // client-side refetch. The causal proof of the update comes from the
    // Socket.IO event → slot-refetch correlation below.
    let mainFrameNavigations = 0;
    pageA.on('framenavigated', (frame) => {
      if (frame === pageA.mainFrame()) mainFrameNavigations += 1;
    });

    const matchesSlot = (data: any): boolean =>
      data != null &&
      Number(data.resourceId) === Number(resourceId) &&
      String(data.bookingDate) === bookingDate;

    const waitForSlotEvent = async (eventName: string, since: number): Promise<CapturedSocketEvent> => {
      await expect
        .poll(
          () => socketEvents.some((event) => event.name === eventName && event.at > since && matchesSlot(event.data)),
          { timeout: 15_000, intervals: [100, 250] },
        )
        .toBe(true);

      const match = socketEvents
        .filter((event) => event.name === eventName && event.at > since && matchesSlot(event.data))
        .sort((a, b) => a.at - b.at)[0];
      expect(match, `${eventName} payload must carry the tested resourceId/bookingDate`).toBeDefined();
      return match as CapturedSocketEvent;
    };

    const waitForSlotRefetch = async (since: number): Promise<void> => {
      await expect
        .poll(() => slotRequests.some((at) => at > since), { timeout: 15_000, intervals: [100, 250] })
        .toBe(true);
    };

    // ── Session B: same player, separate API session ────────────────────────
    const sessionB = await loginAs(user.phoneNumber, user.password);

    const createStartedAt = Date.now();
    const createRes = await fetch(`${BACKEND_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionB.cookie },
      body: JSON.stringify({
        branchId,
        resourceId,
        bookingType: 'private_match',
        bookingDate,
        startTime,
        endTime,
        paymentMethod: 'cash',
      }),
    });
    const createBody = await createRes.json().catch(() => null);
    expect(
      createRes.status,
      `booking creation must return 2xx, got ${createRes.status}: ${JSON.stringify(createBody)}`,
    ).toBeGreaterThanOrEqual(200);
    expect(createRes.status).toBeLessThan(300);

    const bookingId = createBody?.id ?? createBody?.data?.id;
    expect(bookingId, 'booking id is required for the cancel step').toBeDefined();

    // ── A: event → refetch → slot becomes taken (no reload) ────────────────
    const createdEvent = await waitForSlotEvent('booking.created', createStartedAt);
    await waitForSlotRefetch(createdEvent.at);
    await expect(slotButton).toHaveCount(0, { timeout: 15_000 });

    // ── B: cancel; a 409 or any non-2xx fails the test (no policy change) ───
    const cancelStartedAt = Date.now();
    const cancelRes = await fetch(`${BACKEND_URL}/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionB.cookie },
      body: JSON.stringify({ reason: 'F1 realtime slot update check' }),
    });
    const cancelBody = await cancelRes.json().catch(() => null);
    expect(
      cancelRes.status,
      `cancellation must return 2xx (a 409 means the cancellation policy window blocks it), got ${cancelRes.status}: ${JSON.stringify(cancelBody)}`,
    ).toBe(200);

    // ── A: event → refetch → slot becomes free again (no reload) ───────────
    const cancelledEvent = await waitForSlotEvent('booking.cancelled', cancelStartedAt);
    await waitForSlotRefetch(cancelledEvent.at);
    await expect(slotButton).toHaveCount(1, { timeout: 15_000 });

    expect(
      mainFrameNavigations,
      'session A must receive both updates without any document reload/navigation',
    ).toBe(0);
  });

});
