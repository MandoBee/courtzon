import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Group 4 — Tournament notification idempotency regression.
 *
 * `publish()` and `openRegistration()` both emit `tournament:registration-open`
 * for the sport-matched audience (primary sport OR interest). The notification
 * engine must deliver at most ONE notification per (user, tournament, event) —
 * repeated events (publish → open-registration, or re-publish) must never
 * produce duplicate notifications. Dedup is enforced in the tournament event
 * handler via `notificationRepository.hasExisting`.
 */

const __state = vi.hoisted(() => ({
  dispatched: [] as Array<{ userId: number; eventName: string }>,
  hasExisting: vi.fn(),
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { on: vi.fn(), emit: vi.fn() },
}));

vi.mock('../application/dispatcher.service.js', () => ({
  dispatchToUser: vi.fn(async (o: any) => {
    __state.dispatched.push({ userId: o.userId, eventName: o.eventName });
  }),
  dispatchByRole: vi.fn(async () => undefined),
  dispatchByOrg: vi.fn(async () => undefined),
  dispatchByPermission: vi.fn(async () => undefined),
}));

vi.mock('../infrastructure/repositories/notification.repository.js', () => ({
  notificationRepository: { hasExisting: __state.hasExisting },
}));

import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { notificationEngine } from '../application/notification-engine.js';

function handlerFor(event: string) {
  const calls = (eventBusV2.on as any).mock.calls;
  return calls.find((c: any) => c[0] === event)?.[1];
}

// Register once at module load and capture the handlers — the mocked `on` is
// cleared between tests but the captured closures stay stable.
notificationEngine.start();
const regOpenHandler = handlerFor('tournament:registration-open');
const completedHandler = handlerFor('tournament:completed');

beforeEach(() => {
  vi.clearAllMocks();
  __state.dispatched.length = 0;
  __state.hasExisting.mockReset().mockResolvedValue(false);
});

describe('Group 4 — tournament:registration-open notification dedup', () => {
  it('dispatches ONCE per (user, tournament) — a duplicate event is a no-op', async () => {
    expect(regOpenHandler).toBeDefined();

    // First delivery: no existing notification → dispatch.
    __state.hasExisting.mockResolvedValue(false);
    await regOpenHandler({ tournamentId: 1, userId: 42, name: 'Cup' });

    // Second delivery (e.g. open-registration after publish): already exists → skip.
    __state.hasExisting.mockResolvedValue(true);
    await regOpenHandler({ tournamentId: 1, userId: 42, name: 'Cup' });

    expect(__state.hasExisting).toHaveBeenCalledWith(42, 'tournament:registration-open', 'tournament', '1');
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0]).toEqual({ userId: 42, eventName: 'tournament:registration-open' });
  });

  it('different users on the same tournament are notified independently', async () => {
    __state.hasExisting.mockResolvedValue(false);
    await regOpenHandler({ tournamentId: 1, userId: 42, name: 'Cup' });
    await regOpenHandler({ tournamentId: 1, userId: 43, name: 'Cup' });
    expect(__state.dispatched).toHaveLength(2);
  });

  it('a different tournament for the same user is a separate notification (not deduped)', async () => {
    __state.hasExisting.mockImplementation(async (userId: number, _ev: string, _et: string, relatedId: string) => relatedId === '1');
    await regOpenHandler({ tournamentId: 1, userId: 42, name: 'Cup' });
    await regOpenHandler({ tournamentId: 2, userId: 42, name: 'League' });
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0].userId).toBe(42);
  });

  it('non-registration-open tournament events are NOT deduped (existing behavior preserved)', async () => {
    await completedHandler({ tournamentId: 1, userId: 42 });
    await completedHandler({ tournamentId: 1, userId: 42 });
    expect(__state.dispatched).toHaveLength(2);
    expect(__state.hasExisting).not.toHaveBeenCalled();
  });
});