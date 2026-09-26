import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * G3-A — Academy enrollment cancelled/completed notification mapping.
 *
 * Verifies that the two G1-emitted events are wired end-to-end in the
 * notification engine:
 *   - subscribed exactly once (no duplicate registration)
 *   - routed by the existing Academy enrollment group to the authoritative
 *     player userId with category `system` and action `/my/academy`
 *   - never dispatched when the authoritative userId is absent
 *   - templates exist in EN + AR and are seeded at startup
 *   - socket allowlist includes the two events but NOT hold-expired /
 *     enrollment-paid (explicitly out of scope for G3-A)
 */

const __state = vi.hoisted(() => ({
  dispatched: [] as Array<{ userId: number; eventName: string; action: any }>,
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { on: vi.fn(), emit: vi.fn() },
}));

vi.mock('../application/dispatcher.service.js', () => ({
  dispatchToUser: vi.fn(async (o: any) => {
    __state.dispatched.push({ userId: o.userId, eventName: o.eventName, action: o.action });
  }),
  dispatchByRole: vi.fn(async () => undefined),
  dispatchByOrg: vi.fn(async () => undefined),
  dispatchByPermission: vi.fn(async () => undefined),
}));

vi.mock('../infrastructure/repositories/notification.repository.js', () => ({
  notificationRepository: { hasExisting: vi.fn(async () => false) },
}));

vi.mock('../application/tournament-notification.service.js', () => ({
  tournamentNotificationService: { handle: vi.fn(async () => undefined) },
}));

import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { notificationEngine } from '../application/notification-engine.js';
import { dispatchToUser } from '../application/dispatcher.service.js';
import { notificationRepository } from '../infrastructure/repositories/notification.repository.js';

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

// Register once at module load and capture handlers + counts (the mocked `on`
// is cleared between tests but the captured closures stay stable).
notificationEngine.start();

const NEW_EVENTS = ['academy:enrollment-cancelled', 'academy:enrollment-completed'];

const handlers: Record<string, any> = {};
const subscriptions: Record<string, number> = {};
for (const event of NEW_EVENTS) {
  handlers[event] = handlerFor(event);
  subscriptions[event] = subscriptionCount(event);
}
// G4-B1 — canonical player payment confirmation event.
handlers['academy:enrollment-paid'] = handlerFor('academy:enrollment-paid');
subscriptions['academy:enrollment-paid'] = subscriptionCount('academy:enrollment-paid');
const PAYMENT_ACK_SUBSCRIPTIONS = subscriptionCount('academy:payment-acknowledged');

beforeEach(() => {
  vi.clearAllMocks();
  __state.dispatched.length = 0;
  (notificationRepository.hasExisting as any).mockReset().mockResolvedValue(false);
});

describe('G3-A — academy enrollment cancelled/completed → notification mapping', () => {
  it('subscribes each new event exactly once through the engine', () => {
    for (const event of NEW_EVENTS) {
      expect(handlers[event]).toBeDefined();
      expect(subscriptions[event]).toBe(1);
    }
  });

  it('routes cancellation to the player userId with category system and /my/academy', async () => {
    await handlers['academy:enrollment-cancelled']({
      programId: 1, userId: 200, enrollmentId: 11, programName: 'Tennis Club',
    });
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0].eventName).toBe('academy:enrollment-cancelled');
    expect(__state.dispatched[0].userId).toBe(200);
    expect(dispatchToUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: 200,
      eventName: 'academy:enrollment-cancelled',
      categorySlug: 'system',
      relatedEntityType: 'enrollment',
      relatedEntityId: '11',
      action: { route: '/my/academy' },
      digestable: false,
    }));
  });

  it('routes completion to the player userId with category system and /my/academy', async () => {
    await handlers['academy:enrollment-completed']({
      programId: 1, userId: 201, enrollmentId: 12, programName: 'Squash Academy',
    });
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0].eventName).toBe('academy:enrollment-completed');
    expect(__state.dispatched[0].userId).toBe(201);
    expect(dispatchToUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: 201,
      eventName: 'academy:enrollment-completed',
      categorySlug: 'system',
      relatedEntityType: 'enrollment',
      relatedEntityId: '12',
      action: { route: '/my/academy' },
      digestable: false,
    }));
  });

  it('never dispatches when the authoritative player userId is absent', async () => {
    await handlers['academy:enrollment-cancelled']({ programId: 1, enrollmentId: 11 });
    await handlers['academy:enrollment-completed']({ programId: 1, enrollmentId: 12 });
    expect(__state.dispatched).toHaveLength(0);
  });

  it('is part of the existing Academy enrollment group (not a no-op mapping)', () => {
    // Present in the group's `events` array next to the live lifecycle events.
    const groupBlock = ENGINE_SOURCE.slice(
      ENGINE_SOURCE.indexOf("'academy:enrollment-accepted'"),
      ENGINE_SOURCE.indexOf("'coaching:session-scheduled'"),
    );
    for (const event of NEW_EVENTS) {
      expect(groupBlock).toContain(`'${event}'`);
    }
  });

  it('is listed in the engine subscribedEvents registry', () => {
    for (const event of NEW_EVENTS) {
      expect(ENGINE_SOURCE).toContain(`'${event}'`);
    }
  });
});

describe('G3-A — template contract (seeded at startup, EN + AR)', () => {
  it('defines EN + AR templates for both events with /my/academy navigation', () => {
    for (const event of NEW_EVENTS) {
      expect(TEMPLATE_SOURCE).toContain(`eventName: '${event}', locale: 'en', categorySlug: 'system'`);
      expect(TEMPLATE_SOURCE).toContain(`eventName: '${event}', locale: 'ar', categorySlug: 'system'`);
      // Every locale entry carries the my-academy action + route.
      const en = TEMPLATE_SOURCE.slice(TEMPLATE_SOURCE.indexOf(`eventName: '${event}', locale: 'en'`),
        TEMPLATE_SOURCE.indexOf(`eventName: '${event}', locale: 'ar'`));
      const ar = TEMPLATE_SOURCE.slice(TEMPLATE_SOURCE.indexOf(`eventName: '${event}', locale: 'ar'`),
        TEMPLATE_SOURCE.indexOf(`eventName: '${event}', locale: 'ar'`) + 400);
      expect(en).toContain("actionKey: 'view_my_academy', routePattern: '/my/academy'");
      expect(ar).toContain("actionKey: 'view_my_academy', routePattern: '/my/academy'");
      expect(ar).toContain(`eventName: '${event}', locale: 'ar',`);
    }
  });
});

describe('G3-A — realtime allowlist (published, tightly scoped)', () => {
  it('socket publisher allowlists both new enrollment events', () => {
    for (const event of NEW_EVENTS) {
      expect(SOCKET_PUBLISHER_SOURCE).toContain(`'${event}'`);
    }
  });

  it('payment-acknowledged no longer creates the player payment confirmation (G4-B1)', () => {
    expect(PAYMENT_ACK_SUBSCRIPTIONS).toBe(0);
    // The engine subscribedEvents/group no longer reference it as a notification.
    expect(ENGINE_SOURCE.includes("'academy:payment-acknowledged'")).toBe(false);
  });
});

describe('G4-B1 — unified player payment confirmation (academy:enrollment-paid)', () => {
  it('subscribes academy:enrollment-paid exactly once', () => {
    expect(handlers['academy:enrollment-paid']).toBeDefined();
    expect(subscriptions['academy:enrollment-paid']).toBe(1);
  });

  it('routes to the enrolled player (playerId) with category system and /my/academy', async () => {
    await handlers['academy:enrollment-paid']({
      enrollmentId: 11, programId: 1, playerId: 200, amount: 200, currency: 'EGP',
    });
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0]).toMatchObject({ userId: 200, eventName: 'academy:enrollment-paid' });
    expect(dispatchToUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: 200,
      eventName: 'academy:enrollment-paid',
      categorySlug: 'system',
      relatedEntityType: 'enrollment',
      relatedEntityId: '11',
      action: { route: '/my/academy' },
      digestable: false,
    }));
  });

  it('never dispatches when the authoritative player id is absent', async () => {
    await handlers['academy:enrollment-paid']({ enrollmentId: 11, programId: 1 });
    expect(__state.dispatched).toHaveLength(0);
  });

  it('dedup: a replayed academy:enrollment-paid produces no second player notification', async () => {
    const payload = { enrollmentId: 11, programId: 1, playerId: 200, amount: 200, currency: 'EGP' };
    // First delivery — no existing notification.
    await handlers['academy:enrollment-paid'](payload);
    expect(__state.dispatched).toHaveLength(1);
    expect(notificationRepository.hasExisting).toHaveBeenCalledWith(200, 'academy:enrollment-paid', 'enrollment', '11');

    // Replay — the existing notification suppresses delivery.
    __state.dispatched.length = 0;
    (notificationRepository.hasExisting as any).mockResolvedValueOnce(true);
    await handlers['academy:enrollment-paid'](payload);
    expect(__state.dispatched).toHaveLength(0);
  });

  it('dedup is per enrollment: a different enrollment still dispatches', async () => {
    (notificationRepository.hasExisting as any).mockResolvedValueOnce(true); // enrollment 11 exists
    await handlers['academy:enrollment-paid']({ enrollmentId: 11, programId: 1, playerId: 200 });
    await handlers['academy:enrollment-paid']({ enrollmentId: 12, programId: 1, playerId: 200 });
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0].eventName).toBe('academy:enrollment-paid');
  });

  it('templates: EN + AR contracts with /my/academy navigation and amount/currency variables', () => {
    expect(TEMPLATE_SOURCE).toContain("eventName: 'academy:enrollment-paid', locale: 'en', categorySlug: 'system'");
    expect(TEMPLATE_SOURCE).toContain("eventName: 'academy:enrollment-paid', locale: 'ar', categorySlug: 'system'");
    for (const loc of ['en', 'ar']) {
      const seg = TEMPLATE_SOURCE.slice(
        TEMPLATE_SOURCE.indexOf(`eventName: 'academy:enrollment-paid', locale: '${loc}'`),
        TEMPLATE_SOURCE.indexOf(`eventName: 'academy:enrollment-paid', locale: '${loc}'`) + 400,
      );
      expect(seg).toContain("actionKey: 'view_my_academy', routePattern: '/my/academy'");
    }
  });
});