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

beforeEach(() => {
  vi.clearAllMocks();
  __state.dispatched.length = 0;
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

  it('hold-expired is allowlisted since G4-A (administrative); enrollment-paid stays out of the notification engine', () => {
    // G4-A moved hold-expired into the admin realtime allowlist.
    expect(SOCKET_PUBLISHER_SOURCE).toContain("'academy:session:hold-expired'");
    // enrollment-paid remains realtime (pre-existing) but is NOT subscribed by
    // the notification engine in this group.
    expect(ENGINE_SOURCE).not.toContain("'academy:enrollment-paid'");
  });
});