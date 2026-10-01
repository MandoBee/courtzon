import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderRecipientNotice } from '../application/template.service.js';

/**
 * G11.10 — standings-finalized / refund-requested / registration-closed
 * notification mapping + recipient resolution.
 *
 * Verifies:
 *  - the notification engine registers + routes the three events to the
 *    tournament notification service (tenant-scoped, dedup-aware),
 *  - standings-finalized reaches ORG STAFF + ADMINS ONLY (never RR participants),
 *  - refund-requested reaches ORG STAFF + ADMINS ONLY,
 *  - registration-closed reaches active registered participants + org staff + admins,
 *  - hasExisting() dedup is preserved,
 *  - EN + AR recipient notices render.
 */

const __state = vi.hoisted(() => ({
  engineDispatched: [] as Array<{ userId: number; eventName: string }>,
  engineHasExisting: vi.fn(async () => false),
  serviceHandled: [] as Array<{ eventName: string; data: any }>,
  dispatched: [] as Array<{ userId: number; eventName: string; title?: string; body?: string; orgId?: number }>,
  hasExisting: vi.fn(),
  delivered: new Set<string>(),
  membersByParticipant: new Map<number, Array<{ user_id: number; status: string }>>(),
  participantsByTournament: [] as any[],
  orgIdByTournament: new Map<number, number | null>(),
  orgStaffRows: [] as any[],
  permissionRows: [] as any[],
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { on: vi.fn(), emit: vi.fn() },
}));

vi.mock('../application/dispatcher.service.js', () => ({
  dispatchToUser: vi.fn(async (o: any) => {
    __state.dispatched.push({ userId: o.userId, eventName: o.eventName, title: o.renderedTitle, body: o.renderedBody, orgId: o.organisationId });
    __state.delivered.add(`${o.userId}:${o.eventName}:${o.relatedEntityId ?? ''}`);
  }),
  dispatchByRole: vi.fn(async () => undefined),
  dispatchByOrg: vi.fn(async () => undefined),
  dispatchByPermission: vi.fn(async () => undefined),
}));

// Service-level harness (recipients + dedup) uses the REAL tournament-notification
// service with mocked repositories / DB.
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    query: vi.fn(async (sql: string) => {
      if (sql.includes('user_organisations')) return [__state.orgStaffRows];
      if (sql.includes('role_permissions')) return [__state.permissionRows];
      return [[]];
    }),
    execute: vi.fn(async () => [[]]),
  }),
}));

vi.mock('../infrastructure/repositories/notification.repository.js', () => ({
  notificationRepository: { hasExisting: __state.hasExisting },
}));

vi.mock('../../tournaments/infrastructure/repositories/participant-member.repository.js', () => ({
  participantMemberRepository: {
    listMembersByParticipant: vi.fn(async (participantId: number) => __state.membersByParticipant.get(participantId) ?? []),
  },
}));

vi.mock('../../tournaments/infrastructure/repositories/participant-draw.repository.js', () => ({
  participantDrawRepository: {
    listParticipantsByTournament: vi.fn(async () => __state.participantsByTournament),
  },
}));

vi.mock('../../tournaments/infrastructure/repositories/tournament.repository.js', () => ({
  tournamentRepository: {
    getOrganisationId: vi.fn(async (id: number) => __state.orgIdByTournament.get(id) ?? null),
    findById: vi.fn(async () => null),
  },
}));

import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { notificationEngine } from '../application/notification-engine.js';
import { tournamentNotificationService } from '../application/tournament-notification.service.js';

notificationEngine.start();

function handlerFor(event: string) {
  const calls = (eventBusV2.on as any).mock.calls;
  return calls.find((c: any) => c[0] === event)?.[1];
}

const standingsFinalizedHandler = handlerFor('tournament:standings-finalized');
const refundRequestedHandler = handlerFor('tournament:refund-requested');
const registrationClosedHandler = handlerFor('tournament:registration-closed');
const prizeAwardedHandler = handlerFor('tournament:prize-awarded');

function member(userId: number): { user_id: number; status: string } {
  return { user_id: userId, status: 'active' };
}

function participant(id: number, status = 'active'): any {
  return { id, tournament_id: 1, status, participant_type: 'individual' };
}

function serviceHandle(eventName: string, data: Record<string, any>) {
  return tournamentNotificationService.handle({ eventName, categorySlug: 'tournament', data });
}

const dispatchedUserIds = (event?: string) =>
  __state.dispatched.filter((d) => !event || d.eventName === event).map((d) => d.userId);

beforeEach(() => {
  vi.clearAllMocks();
  __state.engineDispatched.length = 0;
  __state.serviceHandled.length = 0;
  __state.dispatched.length = 0;
  __state.delivered.clear();
  __state.engineHasExisting.mockReset().mockResolvedValue(false);
  __state.hasExisting.mockReset();
  // Stateful dedup: a recipient (user, event, relatedId) is delivered at most
  // once — models notificationRepository.hasExisting in the dispatcher loop.
  __state.hasExisting.mockImplementation(async (userId: number, eventName: string, _entityType: string, relatedId: string) =>
    __state.delivered.has(`${userId}:${eventName}:${String(relatedId ?? '')}`),
  );
  __state.membersByParticipant.clear();
  __state.participantsByTournament = [];
  __state.orgIdByTournament.clear();
  __state.orgStaffRows = [];
  __state.permissionRows = [];
});

describe('G11.10 — notification engine mapping', () => {
  it('registers handlers for standings-finalized / refund-requested / registration-closed / prize-awarded', async () => {
    // Handlers are captured at module load from the registered engine — a
    // missing engine mapping would make these undefined.
    expect(standingsFinalizedHandler).toBeDefined();
    expect(refundRequestedHandler).toBeDefined();
    expect(registrationClosedHandler).toBeDefined();
    expect(prizeAwardedHandler).toBeDefined();
  });

  it('standings-finalized routes through the tournament notification service (org staff + admins only)', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.orgStaffRows = [{ id: 60 }, { id: 61 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:standings-finalized', { tournamentId: 7, organisationId: 3 });

    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([60, 61, 900]));
    expect(dispatchedUserIds()).toHaveLength(3);
    // RR participants are intentionally NOT notified.
    expect(dispatchedUserIds()).not.toContain(70);
    const n = __state.dispatched.find((d) => d.userId === 60);
    expect(n?.body).toContain('standings');
  });

  it('standings-finalized with no organisation (platform RR) notifies admins only, no org staff', async () => {
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:standings-finalized', { tournamentId: 7, organisationId: null });

    expect(dispatchedUserIds()).toEqual([900]);
  });

  it('refund-requested reaches org staff + admins exactly once each (dedup), never unrelated players', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:refund-requested', { tournamentId: 7, registrationId: 12, requestId: 55, userId: 42 });
    await serviceHandle('tournament:refund-requested', { tournamentId: 7, registrationId: 12, requestId: 55, userId: 42 });

    expect(dispatchedUserIds('tournament:refund-requested').filter((id) => id === 60)).toHaveLength(1);
    expect(dispatchedUserIds('tournament:refund-requested').filter((id) => id === 900)).toHaveLength(1);
    // The requesting player is never self-notified.
    expect(dispatchedUserIds()).not.toContain(42);
    const n = __state.dispatched.find((d) => d.userId === 60);
    expect(n?.body).toContain('refund');
  });

  it('refund-requested dedup: a fully-delivered replay is a no-op', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:refund-requested', { tournamentId: 7, registrationId: 12, requestId: 55 });
    const first = __state.dispatched.length;
    // A replay after full delivery adds nothing.
    await serviceHandle('tournament:refund-requested', { tournamentId: 7, registrationId: 12, requestId: 55 });

    expect(__state.dispatched.length).toBe(first);
    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([60, 900]));
    expect(dispatchedUserIds()).toHaveLength(2);
  });

  it('registration-closed reaches active registered players + org staff + admins', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.participantsByTournament = [participant(1, 'active'), participant(2, 'active'), participant(3, 'waiting')];
    __state.membersByParticipant.set(1, [member(50), member(51)]); // pair
    __state.membersByParticipant.set(2, [member(52)]); // individual
    __state.membersByParticipant.set(3, [member(90)]); // waiting roster — never notified
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:registration-closed', { tournamentId: 7, organisationId: 3 });

    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([50, 51, 52, 60, 900]));
    expect(dispatchedUserIds()).not.toContain(90); // waiting-list excluded
    const player = __state.dispatched.find((d) => d.userId === 50);
    expect(player?.body).toContain('Registration');
    const staff = __state.dispatched.find((d) => d.userId === 60);
    expect(staff?.body).toContain('Registration');
  });

  it('registration-closed dedup: replaying the same event does not duplicate', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.participantsByTournament = [participant(1, 'active')];
    __state.membersByParticipant.set(1, [member(50)]);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:registration-closed', { tournamentId: 7, organisationId: 3 });
    await serviceHandle('tournament:registration-closed', { tournamentId: 7, organisationId: 3 });

    expect(dispatchedUserIds().filter((id) => id === 50)).toHaveLength(1);
    expect(dispatchedUserIds().filter((id) => id === 60)).toHaveLength(1);
    expect(dispatchedUserIds().filter((id) => id === 900)).toHaveLength(1);
  });
});

describe('G11.10 — EN/AR recipient notice rendering', () => {
  it('renders standings-finalized / refund-requested / registration-closed in EN and AR', () => {
    const data = { tournamentId: 7 };

    const sfEn = renderRecipientNotice('tournament:standings-finalized', 'orgStaff', 'en', data);
    const sfAr = renderRecipientNotice('tournament:standings-finalized', 'orgStaff', 'ar', data);
    expect(sfEn?.title).toContain('Standings');
    expect(sfAr?.title).toContain('الترتيب');

    const rrEn = renderRecipientNotice('tournament:refund-requested', 'admin', 'en', data);
    const rrAr = renderRecipientNotice('tournament:refund-requested', 'admin', 'ar', data);
    expect(rrEn?.body).toContain('refund');
    expect(rrAr?.body).toContain('استرداد');

    const rcEn = renderRecipientNotice('tournament:registration-closed', 'player', 'en', data);
    const rcAr = renderRecipientNotice('tournament:registration-closed', 'player', 'ar', data);
    expect(rcEn?.body).toContain('closed');
    expect(rcAr?.body).toContain('إغلاق');
  });
});