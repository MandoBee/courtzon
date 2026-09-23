import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderRecipientNotice } from '../application/template.service.js';
import { categorizeEvent } from '../domain/notification-aggregate.js';

/**
 * G9-D5-B — Tournament notification recipient resolution.
 *
 * Verifies the audience matrix for withdrawal, advancement, replacement,
 * stage completion and match lifecycle events, including pair/team rosters,
 * referees, tenant isolation, waiting-list exclusion and idempotency.
 */

const __state = vi.hoisted(() => ({
  dispatched: [] as Array<{ userId: number; eventName: string; title?: string; body?: string; orgId?: number }>,
  hasExisting: vi.fn(async () => false),
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

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    query: vi.fn(async (sql: string) => {
      if (sql.includes('user_organisations')) return [__state.orgStaffRows];
      if (sql.includes('role_permissions')) return [__state.permissionRows];
      if (sql.includes('FROM referees')) return [__state.refereeRows];
      if (sql.includes('FROM tournament_matches tm')) return [__state.advancedSlots];
      return [[]];
    }),
    execute: vi.fn(async () => [[]]),
  }),
}));

vi.mock('../application/dispatcher.service.js', () => ({
  dispatchToUser: vi.fn(async (o: any) => {
    __state.dispatched.push({ userId: o.userId, eventName: o.eventName, title: o.renderedTitle, body: o.renderedBody, orgId: o.organisationId });
  }),
  dispatchByRole: vi.fn(async () => undefined),
  dispatchByOrg: vi.fn(async () => undefined),
  dispatchByPermission: vi.fn(async () => undefined),
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
    findParticipantById: vi.fn(async (id: number) => __state.participantById.get(id) ?? null),
  },
}));

vi.mock('../../tournaments/infrastructure/repositories/tournament.repository.js', () => ({
  tournamentRepository: {
    findMatchById: vi.fn(async (id: number) => __state.slotById.get(id) ?? null),
    findMatchBySharedMatchId: vi.fn(async (id: number) => __state.slotBySharedMatchId.get(id) ?? null),
    findMatches: vi.fn(async () => __state.matches),
    getOrganisationId: vi.fn(async (id: number) => __state.orgIdByTournament.get(id) ?? null),
  },
}));

import { tournamentNotificationService } from '../application/tournament-notification.service.js';

function member(userId: number): { user_id: number; status: string } {
  return { user_id: userId, status: 'active' };
}

function participant(id: number, status = 'active'): { id: number; tournament_id: number; status: string; participant_type: string } {
  return { id, tournament_id: 1, status, participant_type: 'individual' };
}

function handle(eventName: string, data: Record<string, any>, categorySlug = 'tournament') {
  return tournamentNotificationService.handle({ eventName, categorySlug, data });
}

const dispatchedUserIds = (event?: string) =>
  __state.dispatched.filter((d) => !event || d.eventName === event).map((d) => d.userId);

beforeEach(() => {
  vi.clearAllMocks();
  __state.dispatched.length = 0;
  __state.hasExisting.mockReset().mockResolvedValue(false);
  __state.membersByParticipant.clear();
  __state.participantById.clear();
  __state.slotById.clear();
  __state.slotBySharedMatchId.clear();
  __state.matches = [];
  __state.orgIdByTournament.clear();
  __state.orgStaffRows = [];
  __state.permissionRows = [];
  __state.refereeRows = [];
  __state.advancedSlots = [];
});

describe('G9-D5-B — withdrawal confirmation', () => {
  it('A. individual withdrawal: the withdrawn user receives a confirmation', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.participantById.set(5, participant(5, 'withdrawn_after_start'));

    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: null });

    expect(dispatchedUserIds('tournament:withdrawal-resolved')).toContain(50);
    const n = __state.dispatched.find((d) => d.userId === 50);
    expect(n?.body).toContain('withdrawal');
  });

  it('B. pair withdrawal: every active pair member receives a confirmation', async () => {
    __state.membersByParticipant.set(5, [member(50), member(51)]);
    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: null });
    expect(dispatchedUserIds()).toEqual([50, 51]);
  });

  it('C. team withdrawal: every active team member receives a confirmation', async () => {
    __state.membersByParticipant.set(5, [member(50), member(51), member(52)]);
    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: null });
    expect(dispatchedUserIds()).toEqual([50, 51, 52]);
  });

  it('D. withdrawal with no resolved slots still confirms the withdrawn participant', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.advancedSlots = [];
    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: null });
    expect(dispatchedUserIds()).toContain(50);
  });
});

describe('G9-D5-B — withdrawal advancement', () => {
  it('E. advancing opponent receives ONE combined notification', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.membersByParticipant.set(7, [member(70)]);
    __state.advancedSlots = [{ id: 21, participant1_id: 5, participant2_id: 7 }];

    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 1, cancelledMatches: 0, releasedCourts: 0, organisationId: null });

    const advanceDispatches = __state.dispatched.filter((d) => d.userId === 70);
    expect(advanceDispatches).toHaveLength(1);
    expect(advanceDispatches[0].body).toContain('opponent withdrew');
    // The withdrawn participant confirmation is still delivered.
    expect(dispatchedUserIds()).toContain(50);
  });

  it('F. pair/team advancement: all active roster members of the advancing participant are notified once', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.membersByParticipant.set(7, [member(70), member(71)]);
    __state.advancedSlots = [{ id: 21, participant1_id: 7, participant2_id: 5 }];

    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 1, cancelledMatches: 0, releasedCourts: 0, organisationId: null });

    expect(dispatchedUserIds()).toEqual([50, 70, 71]);
    const adv = __state.dispatched.filter((d) => d.userId === 70 || d.userId === 71);
    expect(adv).toHaveLength(2);
    expect(adv.every((d) => d.body?.includes('advance'))).toBe(true);
  });

  it('inactive withdrawn roster members are ignored for the confirmation', async () => {
    __state.membersByParticipant.set(5, [
      { user_id: 50, status: 'active' },
      { user_id: 51, status: 'left' },
    ]);
    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: null });
    expect(dispatchedUserIds()).toEqual([50]);
  });
});

describe('G9-D5-B — referees', () => {
  it('G1. a referee does NOT receive a generic participant withdrawal notification', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.refereeRows = [{ user_id: 990 }];
    __state.advancedSlots = [{ id: 21, participant1_id: 5, participant2_id: 7 }];
    __state.membersByParticipant.set(7, [member(70)]);

    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 1, cancelledMatches: 0, releasedCourts: 0, organisationId: null });

    expect(dispatchedUserIds()).not.toContain(990);
  });

  it('G2. a referee receives a match-relevant match-progressed notification (referee user, not the roster)', async () => {
    __state.slotById.set(21, { id: 21, participant1_id: 7, participant2_id: 8, referee_id: 99 });
    __state.membersByParticipant.set(7, [member(70)]);
    __state.membersByParticipant.set(8, [member(80)]);
    __state.refereeRows = [{ user_id: 990 }];

    await handle('tournament:match-progressed', { tournamentId: 1, fromSlotId: 21, matchId: 900, resultId: 4, organisationId: null });

    expect(dispatchedUserIds()).toContain(990);
    expect(dispatchedUserIds()).toContain(70);
    expect(dispatchedUserIds()).toContain(80);
    const ref = __state.dispatched.find((d) => d.userId === 990);
    expect(ref?.body).toContain('referee');
  });

  it('match-progressed without a resultId (lone-slot/withdrawal path) does not dispatch a second notification', async () => {
    __state.slotById.set(21, { id: 21, participant1_id: 7, participant2_id: 8, referee_id: 99 });
    __state.membersByParticipant.set(7, [member(70)]);
    __state.membersByParticipant.set(8, [member(80)]);

    await handle('tournament:match-progressed', { tournamentId: 1, fromSlotId: 21, matchId: null, winnerId: 70, participantWinnerId: 7, organisationId: null });

    expect(__state.dispatched).toHaveLength(0);
  });
});

describe('G9-D5-B — organization isolation', () => {
  it('H. only the correct tournament organization staff are notified', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.orgIdByTournament.set(1, 6);
    __state.orgStaffRows = [{ id: 60 }, { id: 61 }];
    // Org 7 staff must never be resolved for tournament 1 (tenant isolation).
    __state.permissionRows = [{ id: 900 }]; // admin

    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: 6 });

    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([50, 60, 61, 900]));
    // A user who only belongs to another organisation never receives it.
    expect(dispatchedUserIds()).not.toContain(999);
  });

  it('platform tournament (no organisation) notifies players and admins only, no org staff', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: null });

    expect(dispatchedUserIds()).toContain(50);
    expect(dispatchedUserIds()).toContain(900);
    expect(dispatchedUserIds()).not.toContain(60);
  });
});

describe('G9-D5-B — waiting list', () => {
  it('I. waiting-list users receive nothing for a generic withdrawal', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.membersByParticipant.set(9, [member(90)]);
    __state.participantById.set(9, participant(9, 'waiting'));

    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: null });

    expect(dispatchedUserIds()).toEqual([50]);
    expect(dispatchedUserIds()).not.toContain(90);
  });
});

describe('G9-D5-B — participant replacement', () => {
  it('K. affected + replacement users and org staff are notified; unrelated users receive nothing', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.membersByParticipant.set(6, [member(60)]);
    __state.orgIdByTournament.set(1, 6);
    __state.orgStaffRows = [{ id: 61 }];

    await handle('tournament:participant-replaced', { tournamentId: 1, withdrawnParticipantId: 5, replacementParticipantId: 6 });

    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([50, 60, 61]));
    expect(dispatchedUserIds()).not.toContain(99);
    const outgoing = __state.dispatched.find((d) => d.userId === 50);
    const replacement = __state.dispatched.find((d) => d.userId === 60);
    expect(outgoing?.body).toContain('replaced');
    expect(replacement?.body).toContain('replacement');
  });
});

describe('G9-D5-B — match lifecycle', () => {
  it('L. match-created: only the actual participant roster is notified', async () => {
    __state.slotById.set(31, { id: 31, participant1_id: 7, participant2_id: 8, referee_id: null });
    __state.membersByParticipant.set(7, [member(70)]);
    __state.membersByParticipant.set(8, [member(80)]);
    __state.membersByParticipant.set(5, [member(50)]);

    await handle('tournament:match-created', { tournamentId: 1, tournamentMatchId: 31, matchId: 900, winnerId: 70, participantWinnerId: 7, organisationId: null });

    expect(dispatchedUserIds()).toEqual([70, 80]);
    expect(dispatchedUserIds()).not.toContain(50);
    const n = __state.dispatched.find((d) => d.userId === 70);
    expect(n?.body).toContain('match');
  });

  it('M. match-progressed: actual affected participant roster receives it', async () => {
    __state.slotById.set(21, { id: 21, participant1_id: 7, participant2_id: 8, referee_id: null });
    __state.membersByParticipant.set(7, [member(70), member(71)]);
    __state.membersByParticipant.set(8, [member(80)]);

    await handle('tournament:match-progressed', { tournamentId: 1, fromSlotId: 21, matchId: 900, resultId: 4, winnerId: 70, participantWinnerId: 7, organisationId: null });

    expect(dispatchedUserIds()).toEqual([70, 71, 80]);
  });
});

describe('G9-D5-B — stage completion', () => {
  it('N. active affected participants are notified; withdrawn/waitlisted are not', async () => {
    __state.matches = [
      { stage_id: 3, participant1_id: 7, participant2_id: 9 },
      { stage_id: 3, participant1_id: 8, participant2_id: null },
      { stage_id: 99, participant1_id: 8, participant2_id: 7 },
    ];
    __state.participantById.set(7, participant(7, 'active'));
    __state.participantById.set(8, participant(8, 'active'));
    __state.participantById.set(9, participant(9, 'withdrawn'));
    __state.membersByParticipant.set(7, [member(70)]);
    __state.membersByParticipant.set(8, [member(80)]);
    __state.membersByParticipant.set(9, [member(90)]);

    await handle('tournament:stage-completed', { tournamentId: 1, stageId: 3, organisationId: null });

    expect(dispatchedUserIds()).toEqual([70, 80]);
    expect(dispatchedUserIds()).not.toContain(90);
  });
});

describe('G9-D5-B — idempotency', () => {
  it('O. replaying the same event does not create duplicate notifications', async () => {
    __state.membersByParticipant.set(5, [member(50)]);
    __state.hasExisting.mockResolvedValueOnce(false).mockResolvedValue(true);

    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: null });
    await handle('tournament:withdrawal-resolved', { tournamentId: 1, withdrawnParticipantId: 5, resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0, organisationId: null });

    expect(dispatchedUserIds('tournament:withdrawal-resolved').filter((id) => id === 50)).toHaveLength(1);
  });
});

describe('G9-D5-B — template rendering', () => {
  it('P. recipient-specific notices render in EN and AR', () => {
    const data = { tournamentId: 1, resolvedSlots: 2, cancelledMatches: 1, stageId: 3 };
    const en = renderRecipientNotice('tournament:withdrawal-resolved', 'advancing', 'en', data);
    const ar = renderRecipientNotice('tournament:withdrawal-resolved', 'advancing', 'ar', data);
    expect(en?.body).toContain('opponent withdrew');
    expect(ar?.body).toContain('انسحب');

    const stageEn = renderRecipientNotice('tournament:stage-completed', 'participant', 'en', data);
    expect(stageEn?.body).toContain('Stage 3');
    const replacedAr = renderRecipientNotice('tournament:participant-replaced', 'replacement', 'ar', data);
    expect(replacedAr?.body).toContain('بديل');
  });
});

describe('G9-D5-B — regression', () => {
  it('Q. booking/payment/marketplace category routing is unchanged', () => {
    expect(categorizeEvent('booking:created')).toBe('bookings');
    expect(categorizeEvent('payment:completed')).toBe('payments');
    expect(categorizeEvent('wallet:deposit')).toBe('payments');
    expect(categorizeEvent('marketplace:order-placed')).toBe('marketplace');
    expect(categorizeEvent('tournament:withdrawal-resolved')).toBe('tournament');
  });
});