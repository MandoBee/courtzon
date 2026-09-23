import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * G9-D5-A — Tournament notification event mapping + contract.
 *
 * Verifies that tournament events are routed to the `tournament` notification
 * category, that the previously dead/no-op tournament mappings
 * (waitlist-promoted, stage-completed, match-created, match-progressed,
 * participant-replaced, withdrawal-resolved) are now registered as real
 * handlers, and that non-tournament category routing is untouched.
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

vi.mock('../application/tournament-notification.service.js', () => ({
  tournamentNotificationService: { handle: vi.fn(async () => undefined) },
}));

import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { notificationEngine } from '../application/notification-engine.js';
import { tournamentNotificationService } from '../application/tournament-notification.service.js';
import { categorizeEvent } from '../domain/notification-aggregate.js';

const ENGINE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/notifications/application/notification-engine.ts'),
  'utf-8',
);
const TEMPLATE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/notifications/application/template.service.ts'),
  'utf-8',
);
const SOCKET_PUBLISHER_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/realtime/application/socket-publisher.ts'),
  'utf-8',
);

function handlerFor(event: string) {
  const calls = (eventBusV2.on as any).mock.calls;
  return calls.find((c: any) => c[0] === event)?.[1];
}

function subscriptionCount(event: string): number {
  return (eventBusV2.on as any).mock.calls.filter((c: any) => c[0] === event).length;
}

// Register once at module load and capture handlers + subscription counts —
// the mocked `on` is cleared between tests but the captured closures/counts
// stay stable.
notificationEngine.start();

const mappedTournamentEvents = [
  'tournament:created',
  'tournament:registration-open',
  'tournament:registration-closed',
  'tournament:starting-soon',
  'tournament:match-scheduled',
  'tournament:result',
  'tournament:bracket-generated',
  'tournament:completed',
  'tournament:waitlist-promoted',
  'tournament:stage-completed',
  'tournament:match-created',
  'tournament:match-progressed',
  'tournament:participant-replaced',
  'tournament:withdrawal-resolved',
];

const handlers: Record<string, any> = {};
const subscriptions: Record<string, number> = {};
for (const event of mappedTournamentEvents) {
  handlers[event] = handlerFor(event);
  subscriptions[event] = subscriptionCount(event);
}

const lifecycleEvents = [
  'tournament:stage-completed',
  'tournament:match-created',
  'tournament:match-progressed',
  'tournament:participant-replaced',
  'tournament:withdrawal-resolved',
];

beforeEach(() => {
  vi.clearAllMocks();
  __state.dispatched.length = 0;
  __state.hasExisting.mockReset().mockResolvedValue(false);
});

describe('G9-D5-A — tournament event → category routing', () => {
  it('routes tournament events to categorySlug "tournament" (canonical resolver)', () => {
    for (const event of mappedTournamentEvents) {
      expect(categorizeEvent(event)).toBe('tournament');
    }
  });

  it('the engine category resolver recognizes tournament events', () => {
    expect(ENGINE_SOURCE).toContain(`if (event.startsWith('tournament')) return 'tournament';`);
  });

  it('non-tournament categories remain unchanged', () => {
    expect(categorizeEvent('booking:created')).toBe('bookings');
    expect(categorizeEvent('payment:completed')).toBe('payments');
    expect(categorizeEvent('wallet:deposit')).toBe('payments');
    expect(categorizeEvent('marketplace:order-placed')).toBe('marketplace');
    expect(categorizeEvent('user:registered')).toBe('system');
    expect(categorizeEvent('unknown:event')).toBe('system');
  });

  it('booking/payment category routing is unchanged', () => {
    expect(categorizeEvent('booking:confirmed')).toBe('bookings');
    expect(categorizeEvent('booking:cancelled')).toBe('bookings');
    expect(categorizeEvent('payment:failed')).toBe('payments');
    expect(categorizeEvent('wallet:withdrawal')).toBe('payments');
  });
});

describe('G9-D5-A — tournament event subscription', () => {
  it('subscribes every mapped tournament event exactly once', () => {
    for (const event of mappedTournamentEvents) {
      expect(handlers[event]).toBeDefined();
      expect(subscriptions[event]).toBe(1);
    }
  });

  it('waitlist-promoted is subscribed once (dead mapping fixed, no duplicate)', () => {
    expect(subscriptions['tournament:waitlist-promoted']).toBe(1);
    expect(
      ENGINE_SOURCE.includes("'tournament:waitlist-promoted', 'tournament:waitlist-promoted'"),
    ).toBe(false);
  });

  it('withdrawal-resolved is recognized by the notification engine', () => {
    expect(subscriptions['tournament:withdrawal-resolved']).toBe(1);
    expect(handlers['tournament:withdrawal-resolved']).toBeDefined();
  });

  it('participant-replaced mapping is correct', () => {
    expect(subscriptions['tournament:participant-replaced']).toBe(1);
    expect(handlers['tournament:participant-replaced']).toBeDefined();
    expect(categorizeEvent('tournament:participant-replaced')).toBe('tournament');
  });
});

describe('G9-D5-A — lifecycle events are no longer no-ops', () => {
  it('stage-completed / match-created / match-progressed are mapped into the tournament group (not the no-op fallback)', () => {
    // The no-op fallback is registered per-event with an empty handler. A real
    // mapping lives inside the tournament group's `events` array in the source.
    for (const event of ['tournament:stage-completed', 'tournament:match-created', 'tournament:match-progressed']) {
      expect(handlers[event]).toBeDefined();
      expect(subscriptions[event]).toBe(1);
      // Present in the group definition (not merely in subscribedEvents).
      const groupIndex = ENGINE_SOURCE.indexOf("'tournament:created'");
      expect(groupIndex).toBeGreaterThan(-1);
      const groupBlock = ENGINE_SOURCE.slice(groupIndex, groupIndex + 1500);
      expect(groupBlock).toContain(`'${event}'`);
    }
  });

  it('G9-D5-B — lifecycle handlers delegate recipient resolution to the tournament notification service (no raw dispatch here)', async () => {
    (tournamentNotificationService.handle as any).mockClear();
    const withdrawalHandler = handlers['tournament:withdrawal-resolved'];
    const progressedHandler = handlers['tournament:match-progressed'];

    await withdrawalHandler({
      tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 2, cancelledMatches: 1, releasedCourts: 1, organisationId: 6,
    });
    await progressedHandler({
      tournamentId: 1, matchId: 10, resultId: 4, winnerId: 42, participantWinnerId: 7, stageId: 3, organisationId: 6,
    });

    // Recipient resolution is performed by the dedicated service — the engine
    // handler itself performs no raw dispatch for lifecycle events.
    expect(__state.dispatched).toHaveLength(0);
    expect(tournamentNotificationService.handle).toHaveBeenCalledWith({
      eventName: 'tournament:withdrawal-resolved',
      categorySlug: 'tournament',
      data: expect.objectContaining({ tournamentId: 1, withdrawnParticipantId: 5 }),
    });
    expect(tournamentNotificationService.handle).toHaveBeenCalledWith({
      eventName: 'tournament:match-progressed',
      categorySlug: 'tournament',
      data: expect.objectContaining({ tournamentId: 1, resultId: 4 }),
    });
  });

  it('waitlist-promoted dispatches to the promoted user once (active handler, one delivery)', async () => {
    const promotedHandler = handlers['tournament:waitlist-promoted'];
    expect(promotedHandler).toBeDefined();

    await promotedHandler({ tournamentId: 1, userId: 42, participantId: 7, name: 'Cup' });

    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0]).toEqual({ userId: 42, eventName: 'tournament:waitlist-promoted' });
  });

  it('G9-D5-E — waitlist-promoted replay is deduped (one notification)', async () => {
    const promotedHandler = handlers['tournament:waitlist-promoted'];
    expect(promotedHandler).toBeDefined();

    __state.hasExisting.mockResolvedValueOnce(false).mockResolvedValue(true);
    await promotedHandler({ tournamentId: 1, userId: 42, participantId: 7, name: 'Cup' });
    await promotedHandler({ tournamentId: 1, userId: 42, participantId: 7, name: 'Cup' });

    expect(__state.hasExisting).toHaveBeenCalledWith(42, 'tournament:waitlist-promoted', 'tournament', '1');
    expect(__state.dispatched).toHaveLength(1);
  });
});

describe('G9-D5-A — template contract', () => {
  it('no tournament template uses categorySlug "system" anymore', () => {
    // Every tournament template first line carries `eventName: 'tournament:...',
    // locale, categorySlug` — assert none resolves to 'system'.
    const regex = /eventName: 'tournament:[^']+', locale: '([^']+)', categorySlug: '([^']+)'/g;
    const violations: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(TEMPLATE_SOURCE)) !== null) {
      if (match[2] === 'system') {
        violations.push(`${match[0].slice(0, 80)}…`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('defines EN + AR template contracts for the lifecycle/progression events', () => {
    const lifecycle = [
      'tournament:withdrawal-resolved',
      'tournament:match-progressed',
      'tournament:match-created',
      'tournament:stage-completed',
      'tournament:participant-replaced',
    ];
    for (const event of lifecycle) {
      const en = new RegExp(`eventName: '${event}', locale: 'en', categorySlug: 'tournament'`);
      const ar = new RegExp(`eventName: '${event}', locale: 'ar', categorySlug: 'tournament'`);
      expect(en.test(TEMPLATE_SOURCE)).toBe(true);
      expect(ar.test(TEMPLATE_SOURCE)).toBe(true);
    }
  });

  it('defines EN + AR contracts for waitlist-promoted', () => {
    expect(TEMPLATE_SOURCE).toContain(`eventName: 'tournament:waitlist-promoted', locale: 'en', categorySlug: 'tournament'`);
    expect(TEMPLATE_SOURCE).toContain(`eventName: 'tournament:waitlist-promoted', locale: 'ar', categorySlug: 'tournament'`);
  });
});

describe('G9-D5-A — realtime separation', () => {
  it('socket/realtime tournament mapping remains unchanged (withdrawal-resolved still realtime-published)', () => {
    expect(SOCKET_PUBLISHER_SOURCE).toContain("'tournament:withdrawal-resolved'");
    expect(SOCKET_PUBLISHER_SOURCE).toContain("'tournament:participant-updated'");
  });
});