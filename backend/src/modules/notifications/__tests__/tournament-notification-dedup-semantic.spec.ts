import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * G9-D5-E — semantic idempotency of tournament notification outcomes.
 *
 * The fake dispatcher + notification store below model the REAL behaviour in a
 * single Node process: a notification row is created once per
 * (user, event, relatedEntityType, relatedEntityId); hasExisting observes that
 * row. This exercises the semantic dedup keys and recipient-overlap collapse
 * without a real DB. True cross-process races are documented in the report (the
 * schema has no unique semantic constraint; not added per the DB rule).
 */

const __store = vi.hoisted(() => ({
  notifications: new Set<string>(),
  dispatched: [] as Array<{ userId: number; eventName: string; entityType?: string; entityId?: string }>,
  optedOut: new Set<number>(),
  membersByParticipant: new Map<number, Array<{ user_id: number; status: string }>>(),
  participantById: new Map<number, { id: number; tournament_id: number; status: string; participant_type: string }>(),
  slotById: new Map<number, any>(),
  slotBySharedMatchId: new Map<number, any>(),
  matches: [] as any[],
  orgIdByTournament: new Map<number, number | null>(),
  orgStaffRows: [] as any[],
  permissionRows: [] as any[],
  refereeRows: [] as any[],
  advancedSlots: [] as any[],
}));

const key = (o: { userId: number; eventName: string; relatedEntityType?: string; relatedEntityId?: string }) =>
  `${o.userId}|${o.eventName}|${o.relatedEntityType}|${o.relatedEntityId}`;

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    query: vi.fn(async (sql: string) => {
      if (sql.includes('user_organisations')) return [__store.orgStaffRows];
      if (sql.includes('role_permissions')) return [__store.permissionRows];
      if (sql.includes('FROM referees')) return [__store.refereeRows];
      if (sql.includes('FROM tournament_matches tm')) return [__store.advancedSlots];
      return [[]];
    }),
    execute: vi.fn(async () => [[]]),
  }),
}));

vi.mock('../application/dispatcher.service.js', () => ({
  dispatchToUser: vi.fn(async (o: any) => {
    // G9-D5-C preference gate (matching the shared dispatcher).
    if (__store.optedOut.has(o.userId)) return;
    const k = key(o);
    if (!__store.notifications.has(k)) {
      __store.notifications.add(k);
      __store.dispatched.push({ userId: o.userId, eventName: o.eventName, entityType: o.relatedEntityType, entityId: o.relatedEntityId });
    }
  }),
  dispatchByRole: vi.fn(async () => undefined),
  dispatchByOrg: vi.fn(async () => undefined),
  dispatchByPermission: vi.fn(async () => undefined),
}));

vi.mock('../infrastructure/repositories/notification.repository.js', () => ({
  notificationRepository: {
    hasExisting: vi.fn(async (userId: number, eventName: string, et?: string, ei?: string) =>
      __store.notifications.has(`${userId}|${eventName}|${et}|${ei}`)),
    isCategoryAllowed: vi.fn(async (userId: number) => !__store.optedOut.has(userId)),
    filterAllowedUserIds: vi.fn(async (ids: number[]) => ids.filter((id: number) => !__store.optedOut.has(id))),
  },
}));

vi.mock('../../tournaments/infrastructure/repositories/participant-member.repository.js', () => ({
  participantMemberRepository: {
    listMembersByParticipant: vi.fn(async (participantId: number) => __store.membersByParticipant.get(participantId) ?? []),
  },
}));

vi.mock('../../tournaments/infrastructure/repositories/participant-draw.repository.js', () => ({
  participantDrawRepository: {
    findParticipantById: vi.fn(async (id: number) => __store.participantById.get(id) ?? null),
  },
}));

vi.mock('../../tournaments/infrastructure/repositories/tournament.repository.js', () => ({
  tournamentRepository: {
    findMatchById: vi.fn(async (id: number) => __store.slotById.get(id) ?? null),
    findMatchBySharedMatchId: vi.fn(async (id: number) => __store.slotBySharedMatchId.get(id) ?? null),
    findMatches: vi.fn(async () => __store.matches),
    getOrganisationId: vi.fn(async (id: number) => __store.orgIdByTournament.get(id) ?? null),
  },
}));

import { tournamentNotificationService } from '../application/tournament-notification.service.js';

function member(userId: number) {
  return { user_id: userId, status: 'active' };
}

function participant(id: number, status = 'active') {
  return { id, tournament_id: 1, status, participant_type: 'individual' };
}

function withdrawal(tournamentId: number, withdrawnParticipantId: number, organisationId: number | null = null) {
  return {
    eventName: 'tournament:withdrawal-resolved',
    categorySlug: 'tournament',
    data: { tournamentId, withdrawnParticipantId, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId },
  };
}

const userIdsFor = (event?: string) =>
  __store.dispatched.filter((d) => !event || d.eventName === event).map((d) => d.userId);

beforeEach(() => {
  vi.clearAllMocks();
  __store.notifications.clear();
  __store.dispatched.length = 0;
  __store.optedOut.clear();
  __store.membersByParticipant.clear();
  __store.participantById.clear();
  __store.slotById.clear();
  __store.slotBySharedMatchId.clear();
  __store.matches = [];
  __store.orgIdByTournament.clear();
  __store.orgStaffRows = [];
  __store.permissionRows = [];
  __store.refereeRows = [];
  __store.advancedSlots = [];
});

describe('G9-D5-E — replay idempotency', () => {
  it('A/B. same semantic withdrawal replayed (even with a different eventId) → one notification', async () => {
    __store.membersByParticipant.set(5, [member(50)]);
    await tournamentNotificationService.handle(withdrawal(1, 5));
    await tournamentNotificationService.handle(withdrawal(1, 5));
    expect(userIdsFor('tournament:withdrawal-resolved').filter((id) => id === 50)).toHaveLength(1);
  });
});

describe('G9-D5-E — distinct semantic events are NOT collapsed', () => {
  it('C. two withdrawals in the same tournament → org staff receive BOTH (per-participant key)', async () => {
    __store.orgIdByTournament.set(1, 6);
    __store.orgStaffRows = [{ id: 60 }];
    __store.membersByParticipant.set(5, [member(50)]);
    __store.membersByParticipant.set(7, [member(70)]);
    const withdrawalWithOrg = (tid: number, pid: number) => ({
      eventName: 'tournament:withdrawal-resolved',
      categorySlug: 'tournament',
      data: { tournamentId: tid, withdrawnParticipantId: pid, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: 6 },
    });
    await tournamentNotificationService.handle(withdrawalWithOrg(1, 5));
    await tournamentNotificationService.handle(withdrawalWithOrg(1, 7));
    expect(userIdsFor('tournament:withdrawal-resolved').filter((id) => id === 60)).toHaveLength(2);
  });

  it('D. two different stages → participants receive BOTH', async () => {
    __store.matches = [
      { stage_id: 3, participant1_id: 5, participant2_id: 7 },
      { stage_id: 4, participant1_id: 5, participant2_id: 8 },
    ];
    for (const id of [5, 7, 8]) __store.participantById.set(id, participant(id));
    __store.membersByParticipant.set(5, [member(50)]);
    __store.membersByParticipant.set(7, [member(70)]);
    __store.membersByParticipant.set(8, [member(80)]);
    await tournamentNotificationService.handle({ eventName: 'tournament:stage-completed', categorySlug: 'tournament', data: { tournamentId: 1, stageId: 3 } });
    await tournamentNotificationService.handle({ eventName: 'tournament:stage-completed', categorySlug: 'tournament', data: { tournamentId: 1, stageId: 4 } });
    expect(userIdsFor('tournament:stage-completed').filter((id) => id === 50)).toHaveLength(2);
  });

  it('E. two different matches → participants receive BOTH', async () => {
    __store.slotById.set(31, { id: 31, participant1_id: 5, participant2_id: 7, referee_id: null });
    __store.slotById.set(32, { id: 32, participant1_id: 5, participant2_id: 8, referee_id: null });
    __store.membersByParticipant.set(5, [member(50)]);
    __store.membersByParticipant.set(7, [member(70)]);
    __store.membersByParticipant.set(8, [member(80)]);
    await tournamentNotificationService.handle({ eventName: 'tournament:match-created', categorySlug: 'tournament', data: { tournamentId: 1, tournamentMatchId: 31, matchId: 900 } });
    await tournamentNotificationService.handle({ eventName: 'tournament:match-created', categorySlug: 'tournament', data: { tournamentId: 1, tournamentMatchId: 32, matchId: 901 } });
    expect(userIdsFor('tournament:match-created').filter((id) => id === 50)).toHaveLength(2);
  });
});

describe('G9-D5-E — recipient overlap collapses to one', () => {
  it('G. user is both withdrawn participant AND org staff → one notification', async () => {
    __store.membersByParticipant.set(5, [member(50)]);
    __store.orgIdByTournament.set(1, 6);
    __store.orgStaffRows = [{ id: 50 }];
    await tournamentNotificationService.handle(withdrawal(1, 5, 6));
    expect(userIdsFor('tournament:withdrawal-resolved').filter((id) => id === 50)).toHaveLength(1);
  });

  it('I. user is participant + org staff + admin → one notification', async () => {
    __store.membersByParticipant.set(5, [member(50)]);
    __store.orgStaffRows = [{ id: 50 }];
    __store.permissionRows = [{ id: 50 }];
    await tournamentNotificationService.handle(withdrawal(1, 5, 6));
    expect(userIdsFor('tournament:withdrawal-resolved').filter((id) => id === 50)).toHaveLength(1);
  });

  it('H. user is both participant AND referee of a match → one match notification', async () => {
    __store.slotById.set(21, { id: 21, participant1_id: 5, participant2_id: 7, referee_id: 99 });
    __store.membersByParticipant.set(5, [member(50)]);
    __store.membersByParticipant.set(7, [member(70)]);
    __store.refereeRows = [{ user_id: 50 }];
    await tournamentNotificationService.handle({ eventName: 'tournament:match-progressed', categorySlug: 'tournament', data: { tournamentId: 1, fromSlotId: 21, matchId: 900, resultId: 4 } });
    expect(userIdsFor('tournament:match-progressed').filter((id) => id === 50)).toHaveLength(1);
    expect(userIdsFor('tournament:match-progressed')).toContain(70);
  });

  it('F. a roster containing the same user twice → one notification', async () => {
    __store.membersByParticipant.set(5, [member(50), member(50)]);
    await tournamentNotificationService.handle(withdrawal(1, 5));
    expect(userIdsFor('tournament:withdrawal-resolved').filter((id) => id === 50)).toHaveLength(1);
  });
});

describe('G9-D5-E — withdrawal + advancement semantics', () => {
  it('O. zero-count withdrawal → withdrawn participant confirmation exactly once', async () => {
    __store.membersByParticipant.set(5, [member(50)]);
    __store.advancedSlots = [];
    await tournamentNotificationService.handle(withdrawal(1, 5));
    expect(userIdsFor('tournament:withdrawal-resolved')).toEqual([50]);
  });

  it('P. withdrawal with advancement → withdrawn user 1, advancing opponent 1, no cross-duplicate', async () => {
    __store.membersByParticipant.set(5, [member(50)]);
    __store.membersByParticipant.set(7, [member(70)]);
    __store.advancedSlots = [{ id: 21, participant1_id: 5, participant2_id: 7 }];
    await tournamentNotificationService.handle({ ...withdrawal(1, 5), data: { ...withdrawal(1, 5).data, resolvedSlots: 1 } });
    const ids = userIdsFor('tournament:withdrawal-resolved');
    expect(ids.filter((id) => id === 50)).toHaveLength(1);
    expect(ids.filter((id) => id === 70)).toHaveLength(1);
    expect(ids).toHaveLength(2);
  });
});

describe('G9-D5-E — preference + retry', () => {
  it('J. Tournament preference OFF → zero notifications', async () => {
    __store.membersByParticipant.set(5, [member(50)]);
    __store.optedOut.add(50);
    await tournamentNotificationService.handle(withdrawal(1, 5));
    expect(userIdsFor('tournament:withdrawal-resolved')).toHaveLength(0);
    expect(__store.notifications.size).toBe(0);
  });

  it('K. preference OFF + retry → still zero (no fake row)', async () => {
    __store.membersByParticipant.set(5, [member(50)]);
    __store.optedOut.add(50);
    await tournamentNotificationService.handle(withdrawal(1, 5));
    await tournamentNotificationService.handle(withdrawal(1, 5));
    expect(userIdsFor('tournament:withdrawal-resolved')).toHaveLength(0);
    expect(__store.notifications.size).toBe(0);
  });

  it('L. preference ON + retry → one notification', async () => {
    __store.membersByParticipant.set(5, [member(50)]);
    await tournamentNotificationService.handle(withdrawal(1, 5));
    await tournamentNotificationService.handle(withdrawal(1, 5));
    expect(userIdsFor('tournament:withdrawal-resolved')).toEqual([50]);
  });

  it('M. preference ON after a previously suppressed event → a NEW event still delivers', async () => {
    __store.membersByParticipant.set(5, [member(50)]);
    __store.membersByParticipant.set(7, [member(70)]);
    __store.optedOut.add(50);
    await tournamentNotificationService.handle(withdrawal(1, 5)); // suppressed
    expect(userIdsFor('tournament:withdrawal-resolved')).toHaveLength(0);
    __store.optedOut.clear();
    await tournamentNotificationService.handle(withdrawal(1, 7)); // new event, now allowed
    expect(userIdsFor('tournament:withdrawal-resolved')).toEqual([70]);
  });
});