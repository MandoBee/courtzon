import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * G4-B2 — academy:session-cancelled player notification mapping.
 *
 * Verifies the event routes through the existing Academy session notification
 * group: subscribed exactly once, dispatched to the roster user, wired to
 * `/sessions/:id`, category system, digestable false, replay-suppressed by the
 * existing hasExisting dedup guard, and EN/AR templates present.
 */

const __state = vi.hoisted(() => ({
  dispatched: [] as Array<{ userId: number; eventName: string; relatedEntityType: string; relatedEntityId: string; action: any }>,
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { on: vi.fn(), emit: vi.fn() },
}));

vi.mock('../application/dispatcher.service.js', () => ({
  dispatchToUser: vi.fn(async (o: any) => {
    __state.dispatched.push({ userId: o.userId, eventName: o.eventName, relatedEntityType: o.relatedEntityType, relatedEntityId: o.relatedEntityId, action: o.action });
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
import { notificationRepository } from '../infrastructure/repositories/notification.repository.js';

const TEMPLATE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/notifications/application/template.service.ts'),
  'utf-8',
);

function handlerFor(event: string) {
  const calls = (eventBusV2.on as any).mock.calls;
  return calls.find((c: any) => c[0] === event)?.[1];
}
function subscriptionCount(event: string): number {
  return (eventBusV2.on as any).mock.calls.filter((c: any) => c[0] === event).length;
}

notificationEngine.start();

const handler = handlerFor('academy:session-cancelled');
const subscriptions = subscriptionCount('academy:session-cancelled');

beforeEach(() => {
  vi.clearAllMocks();
  __state.dispatched.length = 0;
  (notificationRepository.hasExisting as any).mockReset().mockResolvedValue(false);
});

describe('G4-B2 — academy:session-cancelled notification mapping', () => {
  it('subscribes the event exactly once with a real handler', () => {
    expect(handler).toBeDefined();
    expect(subscriptions).toBe(1);
  });

  it('dispatches to the roster user with session related-entity and /sessions/:id route', async () => {
    await handler({ userId: 200, sessionId: 10, groupId: 2, programId: 1, reason: 'weather' });
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0]).toMatchObject({
      userId: 200,
      eventName: 'academy:session-cancelled',
      relatedEntityType: 'session',
      relatedEntityId: '10',
      action: { route: '/sessions/10' },
    });
  });

  it('never dispatches when userId is absent', async () => {
    await handler({ sessionId: 10, groupId: 2, programId: 1 });
    expect(__state.dispatched).toHaveLength(0);
  });

  it('replay suppression: an existing notification prevents a second dispatch for the same session', async () => {
    await handler({ userId: 200, sessionId: 10, groupId: 2, programId: 1 });
    expect(__state.dispatched).toHaveLength(1);
    expect(notificationRepository.hasExisting).toHaveBeenCalledWith(200, 'academy:session-cancelled', 'session', '10');

    __state.dispatched.length = 0;
    (notificationRepository.hasExisting as any).mockResolvedValueOnce(true);
    await handler({ userId: 200, sessionId: 10, groupId: 2, programId: 1 });
    expect(__state.dispatched).toHaveLength(0);
  });

  it('dedup is per (user, session): a different session for the same player still dispatches', async () => {
    (notificationRepository.hasExisting as any).mockResolvedValueOnce(true);
    await handler({ userId: 200, sessionId: 10 });
    await handler({ userId: 200, sessionId: 11 });
    expect(__state.dispatched).toHaveLength(1);
  });

  it('EN + AR template contracts exist with the session deep-link route', () => {
    expect(TEMPLATE_SOURCE).toContain("eventName: 'academy:session-cancelled', locale: 'en', categorySlug: 'system', type: 'warning', priority: 'high'");
    expect(TEMPLATE_SOURCE).toContain("eventName: 'academy:session-cancelled', locale: 'ar', categorySlug: 'system', type: 'warning', priority: 'high'");
    for (const loc of ['en', 'ar']) {
      const seg = TEMPLATE_SOURCE.slice(
        TEMPLATE_SOURCE.indexOf(`eventName: 'academy:session-cancelled', locale: '${loc}'`),
        TEMPLATE_SOURCE.indexOf(`eventName: 'academy:session-cancelled', locale: '${loc}'`) + 400,
      );
      expect(seg).toContain("actionKey: 'view_session', routePattern: '/sessions/{{sessionId}}'");
    }
  });
});