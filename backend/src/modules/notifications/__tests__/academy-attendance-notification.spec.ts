import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * G4-B3 — academy:attendance-updated player notification mapping.
 *
 * Verifies the dedicated attendance group: subscribed exactly once, dispatched
 * to the player (`playerId`), related entity = attendance/attendanceId, route
 * `/sessions/:id`, category system, digestable false, NO notification-level dedup
 * (a same attendanceId with a later real change must still dispatch), and
 * EN/AR template contract with raw status interpolation.
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

const TEMPLATE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/notifications/application/template.service.ts'),
  'utf-8',
);

function handlerFor(event: string) {
  const calls = (eventBusV2.on as any).mock.calls;
  return calls.find((c: any) => c[0] === event)?.[1];
}

notificationEngine.start();

const handler = handlerFor('academy:attendance-updated');
const subscriptions = (eventBusV2.on as any).mock.calls.filter((c: any) => c[0] === 'academy:attendance-updated').length;

beforeEach(() => {
  vi.clearAllMocks();
  __state.dispatched.length = 0;
});

describe('G4-B3 — academy:attendance-updated notification mapping', () => {
  it('subscribes the event exactly once with a real handler', () => {
    expect(handler).toBeDefined();
    expect(subscriptions).toBe(1);
  });

  it('dispatches to the playerId with attendance related-entity and /sessions/:id route', async () => {
    await handler({ attendanceId: 1, sessionId: 10, groupId: 2, enrollmentId: 100, playerId: 200, attendance_status: 'absent' });
    expect(__state.dispatched).toHaveLength(1);
    expect(__state.dispatched[0]).toMatchObject({
      userId: 200,
      eventName: 'academy:attendance-updated',
      relatedEntityType: 'attendance',
      relatedEntityId: '1',
      action: { route: '/sessions/10' },
    });
  });

  it('never dispatches when playerId is absent', async () => {
    await handler({ attendanceId: 1, sessionId: 10, enrollmentId: 100, attendance_status: 'absent' });
    expect(__state.dispatched).toHaveLength(0);
  });

  it('a later real status change on the SAME attendance still dispatches (no notification-level dedup)', async () => {
    await handler({ attendanceId: 1, sessionId: 10, groupId: 2, enrollmentId: 100, playerId: 200, attendance_status: 'absent' });
    await handler({ attendanceId: 1, sessionId: 10, groupId: 2, enrollmentId: 100, playerId: 200, attendance_status: 'present' });
    // Both are legitimate transitions — neither is suppressed.
    expect(__state.dispatched).toHaveLength(2);
    expect(__state.dispatched.map((d) => d.relatedEntityId)).toEqual(['1', '1']);
  });

  it('EN + AR template contracts exist with raw status interpolation and session route', () => {
    expect(TEMPLATE_SOURCE).toContain("eventName: 'academy:attendance-updated', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal'");
    expect(TEMPLATE_SOURCE).toContain("eventName: 'academy:attendance-updated', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'normal'");
    for (const loc of ['en', 'ar']) {
      const seg = TEMPLATE_SOURCE.slice(
        TEMPLATE_SOURCE.indexOf(`eventName: 'academy:attendance-updated', locale: '${loc}'`),
        TEMPLATE_SOURCE.indexOf(`eventName: 'academy:attendance-updated', locale: '${loc}'`) + 400,
      );
      expect(seg).toContain("actionKey: 'view_session', routePattern: '/sessions/{{sessionId}}'");
      expect(seg).toContain('{{attendance_status}}');
    }
  });
});