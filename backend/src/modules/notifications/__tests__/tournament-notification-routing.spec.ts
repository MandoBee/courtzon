import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * G9-D5 — Tournament notification deep-link routing.
 *
 * Legacy per-player events (`tournament:match-scheduled`, `tournament:result`)
 * deep-link to the match screen (`/matches/:matchId`); tournament lifecycle
 * events deep-link to `/tournaments/:tournamentId`. Every dispatched
 * notification must carry a resolvable action route.
 */

const __state = vi.hoisted(() => ({
  dispatched: [] as Array<{ userId: number; eventName: string; route?: string }>,
  hasExisting: vi.fn(async () => false),
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { on: vi.fn(), emit: vi.fn() },
}));

vi.mock('../application/dispatcher.service.js', () => ({
  dispatchToUser: vi.fn(async (o: any) => {
    __state.dispatched.push({
      userId: o.userId,
      eventName: o.eventName,
      route: o.action?.route,
    });
  }),
  dispatchByRole: vi.fn(async () => undefined),
  dispatchByOrg: vi.fn(async () => undefined),
  dispatchByPermission: vi.fn(async () => undefined),
}));

vi.mock('../infrastructure/repositories/notification.repository.js', () => ({
  notificationRepository: { hasExisting: __state.hasExisting },
}));

vi.mock('../application/tournament-notification.service.js', () => ({
  tournamentNotificationService: { handle: vi.fn(async () => undefined) },
}));

import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { notificationEngine } from '../application/notification-engine.js';

notificationEngine.start();

function handlerFor(event: string) {
  const calls = (eventBusV2.on as any).mock.calls;
  return calls.find((c: any) => c[0] === event)?.[1];
}

const matchScheduledHandler = handlerFor('tournament:match-scheduled');
const resultHandler = handlerFor('tournament:result');
const completedHandler = handlerFor('tournament:completed');
const createdHandler = handlerFor('tournament:created');
const registrationOpenHandler = handlerFor('tournament:registration-open');

beforeEach(() => {
  vi.clearAllMocks();
  __state.dispatched.length = 0;
  __state.hasExisting.mockReset().mockResolvedValue(false);
});

describe('G9-D5 — tournament notification routing', () => {
  it('G/H/I. tournament:match-scheduled deep-links to /matches/:matchId', async () => {
    await matchScheduledHandler({
      matchId: 88, userId: 1, opponent: 'Rafa', date: '2026-10-01',
    });
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0].route).toBe('/matches/88');
  });

  it('tournament:result deep-links to /matches/:matchId', async () => {
    await resultHandler({ matchId: 88, userId: 1, result: 'win' });
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0].route).toBe('/matches/88');
  });

  it('tournament:created deep-links to /tournaments/:tournamentId', async () => {
    await createdHandler({ tournamentId: 5, userId: 1, name: 'Cup' });
    expect(__state.dispatched[0].route).toBe('/tournaments/5');
  });

  it('tournament:registration-open deep-links to /tournaments/:tournamentId', async () => {
    await registrationOpenHandler({ tournamentId: 5, userId: 1, name: 'Cup' });
    expect(__state.dispatched[0].route).toBe('/tournaments/5');
  });

  it('tournament:completed deep-links to /tournaments/:tournamentId', async () => {
    await completedHandler({ tournamentId: 5, userId: 1, name: 'Cup' });
    expect(__state.dispatched[0].route).toBe('/tournaments/5');
  });

  it('J. missing userId is handled gracefully (no dispatch, no crash)', async () => {
    await matchScheduledHandler({ matchId: 88 });
    await resultHandler({ matchId: 88 });
    expect(__state.dispatched).toHaveLength(0);
  });
});