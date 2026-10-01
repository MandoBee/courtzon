import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderRecipientNotice } from '../application/template.service.js';

/**
 * G11.11 — terminal lifecycle + refund verdict + disqualification notifications.
 *
 * Verifies:
 *  - engine registers handlers for cancelled / archived / refund-request-updated /
 *    participant-updated (and completed operator delegation);
 *  - cancelled: active participants + org staff + admins, waiting excluded,
 *    dedup, tenant isolation;
 *  - archived: org staff + admins ONLY (never players);
 *  - completed (operator): participants + org staff + admins; no-winner safe;
 *    winner+participants dedup when a winner is present (defensive);
 *  - refund-request-updated rejected → requester exactly once; non-rejected no-op;
 *  - participant-updated disqualified → ONLY the affected participant roster;
 *  - EN + AR rendering for all new recipient notices;
 *  - refund-request-updated emissions carry the additive userId.
 */

const __state = vi.hoisted(() => ({
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
    getRegistrationById: vi.fn(async () => ({ player_id: 42, user_id: 42 })),
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

const cancelledHandler = handlerFor('tournament:cancelled');
const archivedHandler = handlerFor('tournament:archived');
const refundUpdatedHandler = handlerFor('tournament:refund-request-updated');
const participantUpdatedHandler = handlerFor('tournament:participant-updated');
const completedHandler = handlerFor('tournament:completed');

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
  __state.dispatched.length = 0;
  __state.delivered.clear();
  __state.hasExisting.mockReset();
  __state.hasExisting.mockImplementation(async (userId: number, eventName: string, _entityType: string, relatedId: string) =>
    __state.delivered.has(`${userId}:${eventName}:${String(relatedId ?? '')}`),
  );
  __state.membersByParticipant.clear();
  __state.participantsByTournament = [];
  __state.orgIdByTournament.clear();
  __state.orgStaffRows = [];
  __state.permissionRows = [];
});

describe('G11.11 — notification engine mapping', () => {
  it('registers handlers for cancelled/archived/refund-request-updated/participant-updated/completed', () => {
    expect(cancelledHandler).toBeDefined();
    expect(archivedHandler).toBeDefined();
    expect(refundUpdatedHandler).toBeDefined();
    expect(participantUpdatedHandler).toBeDefined();
    expect(completedHandler).toBeDefined();
  });
});

describe('G11.11 — tournament:cancelled recipients + dedup', () => {
  it('notifies ONLY active participants + org staff + admins (waiting excluded)', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.participantsByTournament = [participant(1, 'active'), participant(2, 'active'), participant(3, 'waiting')];
    __state.membersByParticipant.set(1, [member(50), member(51)]);
    __state.membersByParticipant.set(2, [member(52)]);
    __state.membersByParticipant.set(3, [member(90)]);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:cancelled', { tournamentId: 7, organisationId: 3 });

    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([50, 51, 52, 60, 900]));
    expect(dispatchedUserIds()).toHaveLength(5);
    expect(dispatchedUserIds()).not.toContain(90);
    const player = __state.dispatched.find((d) => d.userId === 50);
    expect(player?.body).toContain('cancelled');
  });

  it('platform (org-less) cancelled tournament: players + admins only, no org staff', async () => {
    __state.participantsByTournament = [participant(1, 'active')];
    __state.membersByParticipant.set(1, [member(50)]);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:cancelled', { tournamentId: 7, organisationId: null });

    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([50, 900]));
    expect(dispatchedUserIds()).not.toContain(60);
  });

  it('dedup: replaying the same cancellation is a no-op', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.participantsByTournament = [participant(1, 'active')];
    __state.membersByParticipant.set(1, [member(50)]);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:cancelled', { tournamentId: 7, organisationId: 3 });
    await serviceHandle('tournament:cancelled', { tournamentId: 7, organisationId: 3 });

    expect(dispatchedUserIds().filter((id) => id === 50)).toHaveLength(1);
    expect(dispatchedUserIds().filter((id) => id === 60)).toHaveLength(1);
    expect(dispatchedUserIds().filter((id) => id === 900)).toHaveLength(1);
  });
});

describe('G11.11 X1 — tournament:archived recipients', () => {
  it('notifies org staff + admins ONLY — players are never notified for archival', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.participantsByTournament = [participant(1, 'active')];
    __state.membersByParticipant.set(1, [member(50)]);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:archived', { tournamentId: 7, organisationId: 3 });

    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([60, 900]));
    expect(dispatchedUserIds()).not.toContain(50);
  });

  it('dedup: replaying archival delivers each recipient once', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:archived', { tournamentId: 7, organisationId: 3 });
    await serviceHandle('tournament:archived', { tournamentId: 7, organisationId: 3 });

    expect(dispatchedUserIds().filter((id) => id === 60)).toHaveLength(1);
    expect(dispatchedUserIds().filter((id) => id === 900)).toHaveLength(1);
  });
});

describe('G11.11 X2 — operator bracket completion notification', () => {
  it('no-winner operator completion notifies participants + org staff + admins (no failure)', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.participantsByTournament = [participant(1, 'active'), participant(2, 'active')];
    __state.membersByParticipant.set(1, [member(50)]);
    __state.membersByParticipant.set(2, [member(51)]);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:completed', { tournamentId: 7, organisationId: 3, name: 'KO Cup' });

    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([50, 51, 60, 900]));
    const notice = __state.dispatched.find((d) => d.userId === 50);
    expect(notice?.body).toContain('completed');
  });

  it('winner + participant passes share the same dedup key (no duplicate winner notification)', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.participantsByTournament = [participant(1, 'active')];
    __state.membersByParticipant.set(1, [member(50)]);
    __state.orgStaffRows = [{ id: 60 }];
    __state.permissionRows = [{ id: 900 }];

    await serviceHandle('tournament:completed', { tournamentId: 7, organisationId: 3, userId: 50, name: 'KO Cup' });

    // winner 50 (role winner) + participants include 50 — dedup keeps ONE bell.
    expect(dispatchedUserIds().filter((id) => id === 50)).toHaveLength(1);
    expect(dispatchedUserIds()).toEqual(expect.arrayContaining([50, 60, 900]));
  });
});

describe('G11.11 X3 — refund-request verdict transparency', () => {
  it('rejected status notifies the requesting player exactly once', async () => {
    await serviceHandle('tournament:refund-request-updated', {
      tournamentId: 7, registrationId: 12, requestId: 55, status: 'rejected', userId: 42, organisationId: 3,
    });
    await serviceHandle('tournament:refund-request-updated', {
      tournamentId: 7, registrationId: 12, requestId: 55, status: 'rejected', userId: 42, organisationId: 3,
    });

    expect(dispatchedUserIds('tournament:refund-request-updated')).toEqual([42]);
    const n = __state.dispatched.find((d) => d.userId === 42);
    expect(n?.body).toContain('declined');
  });

  it('non-rejected verdicts (executed/approved) do NOT create a duplicate notification', async () => {
    await serviceHandle('tournament:refund-request-updated', {
      tournamentId: 7, registrationId: 12, requestId: 55, status: 'executed', userId: 42, organisationId: 3,
    });
    expect(__state.dispatched).toHaveLength(0);
  });

  it('rejected verdict without a userId is skipped (no fabricated recipient)', async () => {
    await serviceHandle('tournament:refund-request-updated', {
      tournamentId: 7, registrationId: 12, requestId: 55, status: 'rejected', organisationId: 3,
    });
    expect(__state.dispatched).toHaveLength(0);
  });

  it('ADDITIVE payload: both refund-request-updated emit sites carry userId (source)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/tournaments/application/tournament-refund.service.ts'),
      'utf-8',
    );
    expect(source).toContain('userId: registration.player_id ?? registration.user_id ?? null');
    expect(source).toContain('userId: (await tournamentRepository.getRegistrationById(req.registrationId))?.player_id');
  });
});

describe('G11.11 X5 — disqualified participant notification', () => {
  it('notifies ONLY the affected participant roster (never every participant)', async () => {
    __state.orgIdByTournament.set(7, 3);
    __state.membersByParticipant.set(1, [member(50), member(51)]);
    __state.membersByParticipant.set(2, [member(70)]);

    await serviceHandle('tournament:participant-updated', { tournamentId: 7, participantId: 1, status: 'disqualified', organisationId: 3 });

    expect(dispatchedUserIds()).toEqual([50, 51]);
    expect(dispatchedUserIds()).not.toContain(70);
    const n = __state.dispatched.find((d) => d.userId === 50);
    expect(n?.body).toContain('disqualified');
  });

  it('dedup: replaying the same disqualification delivers each roster member once', async () => {
    __state.membersByParticipant.set(1, [member(50)]);

    await serviceHandle('tournament:participant-updated', { tournamentId: 7, participantId: 1, status: 'disqualified' });
    await serviceHandle('tournament:participant-updated', { tournamentId: 7, participantId: 1, status: 'disqualified' });

    expect(dispatchedUserIds()).toEqual([50]);
  });
});

describe('G11.11 — EN/AR recipient notice rendering', () => {
  it('renders cancelled/archived/completed/refund-rejected/disqualified in EN and AR', () => {
    const data = { tournamentId: 7 };
    for (const [eventName, role] of [
      ['tournament:cancelled', 'player'],
      ['tournament:archived', 'orgStaff'],
      ['tournament:completed', 'participant'],
      ['tournament:refund-request-updated', 'player'],
      ['tournament:participant-updated', 'disqualified'],
    ] as const) {
      const en = renderRecipientNotice(eventName, role, 'en', data);
      const ar = renderRecipientNotice(eventName, role, 'ar', data);
      expect(en).not.toBeNull();
      expect(ar).not.toBeNull();
      expect(en!.body.length).toBeGreaterThan(0);
      expect(ar!.body.length).toBeGreaterThan(0);
    }
    // Spot-check Arabic content is really Arabic.
    expect(renderRecipientNotice('tournament:cancelled', 'player', 'ar', data)!.title).toContain('إلغاء');
    expect(renderRecipientNotice('tournament:participant-updated', 'disqualified', 'ar', data)!.title).toContain('استبعاد');
  });
});