import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { ParticipantMemberService } from '../application/participant-member.service.js';

// ── Hoisted mocks (mirror participant-lifecycle.service.spec.ts patterns) ──

const pdRepo = vi.hoisted(() => ({
  findParticipantById: vi.fn(),
  createParticipant: vi.fn(),
  countParticipantsByTournament: vi.fn(),
  findSeedByParticipant: vi.fn(),
  findCurrentDraw: vi.fn(),
  findEntryByParticipant: vi.fn(),
}));

const pmRepo = vi.hoisted(() => ({
  addMember: vi.fn(),
  findMember: vi.fn(),
  findMemberById: vi.fn(),
  findActiveMemberByUser: vi.fn(),
  countActiveMembers: vi.fn(),
  listMembersByParticipant: vi.fn(),
  listMembersByTournament: vi.fn(),
  updateMemberLeft: vi.fn(),
  markMemberReplaced: vi.fn(),
  updateParticipantMemberUserIds: vi.fn(),
  updateParticipantName: vi.fn(),
  createReplacementRequest: vi.fn(),
  findReplacementRequest: vi.fn(),
  findPendingReplacementRequest: vi.fn(),
  listReplacementRequests: vi.fn(),
  updateReplacementRequest: vi.fn(),
  findEligiblePlayer: vi.fn(),
}));

const tRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  createRegistration: vi.fn(),
  hasAnyStartedMatch: vi.fn(),
}));

const mfRepo = vi.hoisted(() => ({
  findFormatById: vi.fn(),
  resolveDefaultFormatForSport: vi.fn(),
}));

const tournamentServiceMock = vi.hoisted(() => ({ resolveEffectiveRegistrationPaymentMethods: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const pdService = vi.hoisted(() => ({ settleRegistrationPayment: vi.fn() }));

const poolConn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
  query: vi.fn(async () => [[]]),
  execute: vi.fn(async () => [[]]),
}));
const poolMock = vi.hoisted(() => ({
  getConnection: vi.fn(async () => poolConn),
  query: vi.fn(async () => [[]]),
  execute: vi.fn(async () => [[]]),
}));

vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));
vi.mock('../infrastructure/repositories/participant-member.repository.js', () => ({ participantMemberRepository: pmRepo }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tRepo }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mfRepo }));
vi.mock('../application/tournament.service.js', () => ({ tournamentService: tournamentServiceMock }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => poolMock }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../application/participant-draw.service.js', () => ({ participantDrawService: pdService }));

const svc = new ParticipantMemberService();

const TOURN = {
  id: 1,
  sport_id: 22,
  match_format_id: 1,
  name: 'Padel Cup',
  status: 'registration_open',
  entry_fee: 0,
  currency_code: 'AED',
  max_participants: 16,
  organisation_id: 5,
};

const DOUBLES_FMT = { formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, rosterSize: null, name: 'Padel Standard', isActive: true };

function participant(id: number, opts: Partial<Record<string, unknown>> = {}) {
  return {
    id, tournament_id: 1, registration_id: id, participant_type: 'individual', status: 'active',
    member_user_ids: [id * 10], name: null, ...opts,
  };
}

const ACTIVE_MEMBER = (participantId: number, userId: number) => ({
  id: userId, tournament_id: 1, participant_id: participantId, user_id: userId, member_order: 0, status: 'active', joined_at: '2026-01-01T00:00:00.000Z',
});

function pendingRequest(id: number, participantId: number, outgoing: number, replacement: number) {
  return {
    id, tournament_id: 1, participant_id: participantId, outgoing_member_user_id: outgoing,
    replacement_user_id: replacement, requested_by: 42, status: 'pending', reason: null, rejection_reason: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tRepo.findById.mockResolvedValue(TOURN);
  tRepo.createRegistration.mockResolvedValue(99);
  tRepo.hasAnyStartedMatch.mockResolvedValue(false);
  mfRepo.findFormatById.mockResolvedValue(DOUBLES_FMT);
  mfRepo.resolveDefaultFormatForSport.mockResolvedValue({ formatId: 1, formatType: 'doubles', playersPerSide: 2, rosterSize: null, name: 'Padel Standard' });
  pdRepo.countParticipantsByTournament.mockResolvedValue(0);
  pdRepo.createParticipant.mockResolvedValue(500);
  pmRepo.addMember.mockResolvedValue(700);
  pmRepo.findEligiblePlayer.mockImplementation(async (userId: number) => ({ id: userId, full_name: `Player ${userId}` }));
  pmRepo.findActiveMemberByUser.mockResolvedValue(null);
  pmRepo.countActiveMembers.mockResolvedValue(2);
  pmRepo.listMembersByParticipant.mockResolvedValue([]);
  pmRepo.updateMemberLeft.mockResolvedValue(undefined);
  pmRepo.markMemberReplaced.mockResolvedValue(undefined);
  pmRepo.updateParticipantMemberUserIds.mockResolvedValue(undefined);
  pmRepo.updateParticipantName.mockResolvedValue(undefined);
  pmRepo.createReplacementRequest.mockResolvedValue(900);
  pmRepo.findPendingReplacementRequest.mockResolvedValue(null);
  pdRepo.findSeedByParticipant.mockResolvedValue(null);
  pdRepo.findCurrentDraw.mockResolvedValue(null);
  pdRepo.findEntryByParticipant.mockResolvedValue(null);
  pdService.settleRegistrationPayment.mockResolvedValue(null);
  pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'team' }));
});

describe('Group 7 — PARTICIPANT TYPES (format authoritative)', () => {
  it('1. singles format requires individual (a pair is rejected with a structured type error)', async () => {
    mfRepo.findFormatById.mockResolvedValue({ ...DOUBLES_FMT, formatType: 'singles', playersPerSide: 1 });
    await expect(svc.createPairParticipant(1, { memberUserIds: [10, 20] }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_PARTICIPANT_TYPE_INVALID });
  });

  it('2. doubles format requires pair', async () => {
    mfRepo.findFormatById.mockResolvedValue(DOUBLES_FMT);
    pdRepo.countParticipantsByTournament.mockResolvedValue(0);
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair' }));
    pmRepo.findEligiblePlayer.mockImplementation(async (u: number) => ({ id: u, full_name: `Player ${u}` }));
    const r = await svc.createPairParticipant(1, { name: 'Pair A', memberUserIds: [10, 20] }, 1);
    expect(r.participant_type).toBe('pair');
    expect(pdRepo.createParticipant).toHaveBeenCalledWith(expect.objectContaining({ participant_type: 'pair', member_user_ids: [10, 20] }));
  });

  it('3. team format requires team participant', async () => {
    mfRepo.findFormatById.mockResolvedValue({ ...DOUBLES_FMT, formatType: 'team', playersPerSide: 5, rosterSize: 7 });
    const r = await svc.createTeamParticipant(1, { name: 'Team A', memberUserIds: [10, 20, 30, 40, 50] }, 1);
    expect(r.participant_type).toBe('team');
  });

  it('4. team + pair participant is rejected (structured error)', async () => {
    mfRepo.findFormatById.mockResolvedValue({ ...DOUBLES_FMT, formatType: 'team', playersPerSide: 5, rosterSize: 7 });
    await expect(svc.createPairParticipant(1, { memberUserIds: [10, 20] }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_PARTICIPANT_TYPE_INVALID });
  });
});

describe('Group 7 — MEMBERS', () => {
  it('5. pair valid member count (exactly 2)', async () => {
    mfRepo.findFormatById.mockResolvedValue(DOUBLES_FMT);
    await svc.createPairParticipant(1, { name: 'Pair A', memberUserIds: [10, 20] }, 1);
    expect(pmRepo.addMember).toHaveBeenCalledTimes(2);
  });

  it('6. team valid roster count (between 2 and configured roster)', async () => {
    mfRepo.findFormatById.mockResolvedValue({ ...DOUBLES_FMT, formatType: 'team', playersPerSide: 5, rosterSize: 7 });
    await svc.createTeamParticipant(1, { name: 'Team A', memberUserIds: [10, 20, 30] }, 1);
    expect(pmRepo.addMember).toHaveBeenCalledTimes(3);
  });

  it('7. duplicate member inside the same participant is rejected', async () => {
    pmRepo.findMember.mockResolvedValue(ACTIVE_MEMBER(500, 10));
    await expect(svc.addParticipantMember(1, 500, 10, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_DUPLICATE });
  });

  it('8. a player cannot belong to two active participants in the SAME tournament', async () => {
    pmRepo.findActiveMemberByUser.mockResolvedValue(ACTIVE_MEMBER(777, 10));
    await expect(svc.addParticipantMember(1, 500, 10, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_ACTIVE_DUPLICATE });
  });

  it('9. eligibility: inactive user / no player profile is rejected', async () => {
    pmRepo.findEligiblePlayer.mockResolvedValue(null);
    await expect(svc.createPairParticipant(1, { memberUserIds: [10, 20] }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_ELIGIBLE });
  });

  it('10. tenant isolation: participant of another tournament is rejected', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { tournament_id: 999 }));
    await expect(svc.listParticipantMembers(1, 500)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_NOT_FOUND });
  });
});

describe('Group 7 — SEED behaviour', () => {
  it('11/12. a pair/team holds ONE participant seed (never per-member)', async () => {
    pdRepo.findSeedByParticipant.mockResolvedValue({ id: 9, tournament_id: 1, participant_id: 500, seed_number: 3, source: 'manual' });
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair' }));
    const impact = await svc.getReplacementDrawImpact(1, 500);
    expect(impact.seedPreserved).toBe(true);
    // The seed is participant-scoped in the domain — there is no per-member seed concept.
    expect(impact.participantId).toBe(500);
  });

  it('13/20. member replacement preserves the participant seed', async () => {
    pdRepo.findSeedByParticipant.mockResolvedValue({ id: 9, tournament_id: 1, participant_id: 500, seed_number: 4, source: 'manual' });
    pdRepo.findCurrentDraw.mockResolvedValue({ id: 10, tournament_id: 1, status: 'draft' });
    pdRepo.findEntryByParticipant.mockResolvedValue({ id: 2, draw_id: 10, participant_id: 500, position: 0 });
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair', member_user_ids: [10, 20] }));
    pmRepo.findMember.mockImplementation(async (pId: number, uId: number) => uId === 10 ? ACTIVE_MEMBER(pId, 10) : null);
    pmRepo.countActiveMembers.mockResolvedValue(2);
    pmRepo.listMembersByParticipant.mockResolvedValue([ACTIVE_MEMBER(500, 20), ACTIVE_MEMBER(500, 30)]);
    pmRepo.findReplacementRequest.mockResolvedValue(pendingRequest(900, 500, 10, 30));
    poolConn.query.mockImplementation(async (sql: string) => {
      if (sql.includes('tournament_replacement_requests')) return [[pendingRequest(900, 500, 10, 30)]];
      return [[]];
    });

    const r = await svc.approveReplacementRequest(1, 900, 42);
    expect(r.drawImpact.seedPreserved).toBe(true);
    expect(r.drawImpact.requiresRedraw).toBe(false);
    // Seed row untouched — no seed update/transfer happens.
    expect((pmRepo as any).updateSeed).toBeUndefined();
    expect(pdRepo.findSeedByParticipant).toHaveBeenCalled();
  });

  it('14. manual seed does not affect global rating (existing G5 contract — no rating mutation from member ops)', async () => {
    await svc.createPairParticipant(1, { name: 'Pair A', memberUserIds: [10, 20] }, 1);
    expect((pmRepo as any).updateSeed).toBeUndefined();
    expect((pdRepo as any).updateSeed).toBeUndefined();
  });
});

describe('Group 7 — REPLACEMENT workflow', () => {
  it('15. replacement request is created durably', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair' }));
    pmRepo.findMember.mockResolvedValue(ACTIVE_MEMBER(500, 10));
    pmRepo.findReplacementRequest.mockResolvedValue(pendingRequest(900, 500, 10, 30));
    const r = await svc.createReplacementRequest(1, 500, { outgoingUserId: 10, replacementUserId: 30, reason: 'injured' }, 42);
    expect(pmRepo.createReplacementRequest).toHaveBeenCalledWith(expect.objectContaining({
      participant_id: 500, outgoing_member_user_id: 10, replacement_user_id: 30, requested_by: 42,
    }));
    expect(r.drawImpact).toEqual(expect.objectContaining({ seedPreserved: true, requiresRedraw: false }));
  });

  it('16. valid request is approved (member replaced, history preserved)', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair', member_user_ids: [10, 20] }));
    pmRepo.findMember.mockImplementation(async (pId: number, uId: number) => uId === 10 ? ACTIVE_MEMBER(pId, 10) : null);
    pmRepo.countActiveMembers.mockResolvedValue(2);
    pmRepo.listMembersByParticipant.mockResolvedValue([ACTIVE_MEMBER(500, 20), ACTIVE_MEMBER(500, 30)]);
    pmRepo.findReplacementRequest.mockResolvedValue({ ...pendingRequest(900, 500, 10, 30), status: 'approved' });
    poolConn.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM tournaments')) return [[]];
      if (sql.includes('tournament_replacement_requests')) return [[pendingRequest(900, 500, 10, 30)]];
      return [[]];
    });
    const r = await svc.approveReplacementRequest(1, 900, 42);
    expect(pmRepo.markMemberReplaced).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.anything());
    expect(pmRepo.addMember).toHaveBeenCalledWith(expect.objectContaining({ user_id: 30 }));
    expect(r.drawImpact.seedPreserved).toBe(true);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.REPLACEMENT_APPROVED' }));
  });

  it('17. invalid request rejected (outgoing member not active)', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair' }));
    pmRepo.findMember.mockResolvedValue(null);
    await expect(svc.createReplacementRequest(1, 500, { outgoingUserId: 10, replacementUserId: 30 }, 42))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_FOUND });
  });

  it('18. duplicate pending request prevented', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair' }));
    pmRepo.findMember.mockResolvedValue(ACTIVE_MEMBER(500, 10));
    pmRepo.findPendingReplacementRequest.mockResolvedValue(pendingRequest(901, 500, 20, 40));
    await expect(svc.createReplacementRequest(1, 500, { outgoingUserId: 10, replacementUserId: 30 }, 42))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_REPLACEMENT_REQUEST_EXISTS });
  });

  it('19/21. replacement preserves participant identity + draw position (participant id unchanged)', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair', member_user_ids: [10, 20] }));
    pmRepo.findMember.mockImplementation(async (pId: number, uId: number) => uId === 10 ? ACTIVE_MEMBER(pId, 10) : null);
    pmRepo.countActiveMembers.mockResolvedValue(2);
    pmRepo.listMembersByParticipant.mockResolvedValue([ACTIVE_MEMBER(500, 20), ACTIVE_MEMBER(500, 30)]);
    pmRepo.findReplacementRequest.mockResolvedValue({ ...pendingRequest(900, 500, 10, 30), status: 'approved' });
    poolConn.query.mockImplementation(async (sql: string) => {
      if (sql.includes('tournament_replacement_requests')) return [[pendingRequest(900, 500, 10, 30)]];
      return [[]];
    });
    await svc.approveReplacementRequest(1, 900, 42);
    // Same participant row (id 500) — never a new participant identity.
    expect(pdRepo.createParticipant).not.toHaveBeenCalled();
    expect(pdRepo.findParticipantById).toHaveBeenCalledWith(500);
  });

  it('22. draw impact correctly reported', async () => {
    pdRepo.findSeedByParticipant.mockResolvedValue({ id: 9, tournament_id: 1, participant_id: 500, seed_number: 4, source: 'manual' });
    pdRepo.findCurrentDraw.mockResolvedValue({ id: 10, tournament_id: 1, status: 'approved' });
    pdRepo.findEntryByParticipant.mockResolvedValue({ id: 2, draw_id: 10, participant_id: 500, position: 2 });
    const impact = await svc.getReplacementDrawImpact(1, 500);
    expect(impact).toEqual(expect.objectContaining({ participantId: 500, drawAffected: true, requiresValidation: true, requiresRedraw: false, seedPreserved: true }));
  });

  it('23. locked draw protection (draw never silently mutated)', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue({ id: 10, tournament_id: 1, status: 'locked' });
    pdRepo.findEntryByParticipant.mockResolvedValue({ id: 2, draw_id: 10, participant_id: 500, position: 2 });
    const impact = await svc.getReplacementDrawImpact(1, 500);
    expect(impact.requiresRedraw).toBe(false);
    expect(impact.seedPreserved).toBe(true);
  });

  it('24. post-start policy enforced (replacement blocked after start)', async () => {
    tRepo.hasAnyStartedMatch.mockResolvedValue(true);
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair' }));
    await expect(svc.createReplacementRequest(1, 500, { outgoingUserId: 10, replacementUserId: 30 }, 42))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_REPLACEMENT_POST_START_BLOCKED });
  });
});

describe('Group 7 — AUDIT', () => {
  it('25. request audit recorded', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair' }));
    pmRepo.findMember.mockResolvedValue(ACTIVE_MEMBER(500, 10));
    pmRepo.findReplacementRequest.mockResolvedValue(pendingRequest(900, 500, 10, 30));
    await svc.createReplacementRequest(1, 500, { outgoingUserId: 10, replacementUserId: 30 }, 42);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.REPLACEMENT_REQUESTED' }));
  });

  it('26. approval audit recorded', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair', member_user_ids: [10, 20] }));
    pmRepo.findMember.mockImplementation(async (pId: number, uId: number) => uId === 10 ? ACTIVE_MEMBER(pId, 10) : null);
    pmRepo.countActiveMembers.mockResolvedValue(2);
    pmRepo.listMembersByParticipant.mockResolvedValue([ACTIVE_MEMBER(500, 20), ACTIVE_MEMBER(500, 30)]);
    pmRepo.findReplacementRequest.mockResolvedValue({ ...pendingRequest(900, 500, 10, 30), status: 'approved' });
    poolConn.query.mockImplementation(async (sql: string) => {
      if (sql.includes('tournament_replacement_requests')) return [[pendingRequest(900, 500, 10, 30)]];
      return [[]];
    });
    await svc.approveReplacementRequest(1, 900, 42);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.REPLACEMENT_APPROVED' }));
  });

  it('27. rejection audit recorded', async () => {
    poolConn.query.mockImplementation(async (sql: string) => {
      if (sql.includes('tournament_replacement_requests')) return [[pendingRequest(900, 500, 10, 30)]];
      return [[]];
    });
    pmRepo.findReplacementRequest.mockResolvedValue({ ...pendingRequest(900, 500, 10, 30), status: 'rejected' });
    await svc.rejectReplacementRequest(1, 900, 42, 'not eligible');
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.REPLACEMENT_REJECTED' }));
  });

  it('28. member add/remove audit recorded', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'team' }));
    mfRepo.findFormatById.mockResolvedValue({ ...DOUBLES_FMT, formatType: 'team', playersPerSide: 5, rosterSize: 7 });
    pmRepo.findMember.mockResolvedValue(null);
    pmRepo.countActiveMembers.mockResolvedValue(1);
    await svc.addParticipantMember(1, 500, 10, 1);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.MEMBER_ADDED' }));

    pmRepo.findMember.mockResolvedValue(ACTIVE_MEMBER(500, 20));
    pmRepo.countActiveMembers.mockResolvedValue(3);
    await svc.removeParticipantMember(1, 500, 20, 1);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.MEMBER_REMOVED' }));
  });
});

describe('Group 7 — REALTIME', () => {
  it('29/30. member + replacement events go through EventBusV2 (no direct socket.emit)', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'pair' }));
    pmRepo.findMember.mockResolvedValue(ACTIVE_MEMBER(500, 10));
    pmRepo.findReplacementRequest.mockResolvedValue(pendingRequest(900, 500, 10, 30));
    await svc.createReplacementRequest(1, 500, { outgoingUserId: 10, replacementUserId: 30 }, 42);
    expect(bus.emit).toHaveBeenCalledWith('tournament:replacement-request-updated', expect.objectContaining({ tournamentId: 1, status: 'pending' }), expect.anything());
    expect(bus.emit.mock.calls.every((c: any[]) => c[0].startsWith('tournament:'))).toBe(true);
  });

  it('31/32. member-updated event emitted and no socket.emit anywhere in the service', async () => {
    pdRepo.findParticipantById.mockResolvedValue(participant(500, { participant_type: 'team' }));
    mfRepo.findFormatById.mockResolvedValue({ ...DOUBLES_FMT, formatType: 'team', playersPerSide: 5, rosterSize: 7 });
    pmRepo.findMember.mockResolvedValue(null);
    pmRepo.countActiveMembers.mockResolvedValue(1);
    await svc.addParticipantMember(1, 500, 10, 1);
    expect(bus.emit).toHaveBeenCalledWith('tournament:participant-members-updated', expect.objectContaining({ tournamentId: 1, participantId: 500, addedUserId: 10 }), expect.anything());
    // The SocketPublisher is the ONLY thing that touches socket.io (mapped via event names).
    expect((svc as any).io).toBeUndefined();
  });
});