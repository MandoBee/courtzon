import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import { generateKnockoutBracket, normaliseBracketTargets, isTournamentParticipantProgressionEligible } from '../domain/tournament-aggregate.js';
import type { Tournament, TournamentMatch, TournamentRegistration } from '../domain/tournament-aggregate.js';

const repo = vi.hoisted(() => ({
  findByCode: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  findOpen: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  findRegistrationsByPlayer: vi.fn(),
  findRegistrationsByPlayerUserId: vi.fn(),
  createRegistration: vi.fn(),
  updateRegistrationStatus: vi.fn(),
  updateRegistrationPaymentStatus: vi.fn(),
  getNextWaitingOrder: vi.fn(),
  getConfirmedCount: vi.fn(),
  getRegistrationById: vi.fn(),
  createMatch: vi.fn(),
  findMatches: vi.fn(),
  findMatchesByGroup: vi.fn(),
  findMatchById: vi.fn(),
  findMatchBySharedMatchId: vi.fn(),
  lockMatchById: vi.fn(),
  findBracketSlot: vi.fn(),
  countMatchesAtPosition: vi.fn(),
  countIncompleteStageMatches: vi.fn(),
  updateStageStatus: vi.fn(),
  updateMatch: vi.fn(),
  updateMatchStatus: vi.fn(),
  assignCourt: vi.fn(),
  assignReferee: vi.fn(),
  createMatchResult: vi.fn(),
  getMatchResult: vi.fn(),
  createGroup: vi.fn(),
  findGroups: vi.fn(),
  findGroupById: vi.fn(),
  addGroupMember: vi.fn(),
  findGroupMembers: vi.fn(),
  findGroupMembersByTournament: vi.fn(),
  getStandings: vi.fn(),
  upsertStanding: vi.fn(),
  recalculateStandings: vi.fn(),
  getDashboard: vi.fn(),
  createStage: vi.fn(),
  findStages: vi.fn(),
  findMatchesDetailed: vi.fn(),
}));

const mrRepo = vi.hoisted(() => ({
  findFormatById: vi.fn(),
  findRuleSetById: vi.fn(),
  resolveDefaultFormatForSport: vi.fn(),
  findActiveRuleSetForFormat: vi.fn(),
  getParticipants: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));

const pdr = vi.hoisted(() => ({ findParticipantById: vi.fn() }));
const pmr = vi.hoisted(() => ({
  findActiveMembersByUserIds: vi.fn(),
  listMembersByParticipant: vi.fn(),
}));

const fakeConn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(() => undefined),
  // G9-C — the real lockMatchById reads the locked target row through conn.query.
  query: vi.fn(async (sql: any) => {
    if (typeof sql === 'string' && sql.includes('FOR UPDATE')) {
      return lockedTarget.row ? [[lockedTarget.row]] : [[]];
    }
    return [[]];
  }),
  execute: vi.fn(async () => [[]]),
}));

/** G9-C — the row returned by a `SELECT ... FOR UPDATE` on a tournament match slot. */
const lockedTarget = vi.hoisted(() => ({ row: null as any }));

const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  getConnection: vi.fn(async () => fakeConn),
}));

/** G9-C — configurable connection provider for withTransaction() (acquireConnection). */
const acquireConn = vi.hoisted(() => ({ fn: async () => fakeConn as any }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdr }));
vi.mock('../infrastructure/repositories/participant-member.repository.js', () => ({ participantMemberRepository: pmr }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => pool,
  acquireConnection: (...args: any[]) => acquireConn.fn(...args),
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
const matchServiceMock = vi.hoisted(() => ({ createForTournament: vi.fn(), cancelTournamentMatch: vi.fn() }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));
const courtReservationMock = vi.hoisted(() => ({ releaseCourt: vi.fn() }));
vi.mock('../../booking/application/court-reservation.service.js', () => ({ courtReservationService: courtReservationMock }));

/**
 * G9-B — participant fixtures for participant-aware progression.
 * Individuals: 100→[10], 200→[20], 300→[30] · Pairs: 101→[10,11], 201→[20,21]
 * Teams: 102→[10,11,12], 202→[20,21,22].
 */
function installParticipantMocks(participants: Array<{ id: number; type?: string; users: number[]; status?: string }>) {
  const byId = new Map<number, any>();
  const membersByPid = new Map<number, any[]>();
  for (const p of participants) {
    byId.set(p.id, {
      id: p.id, tournament_id: 1, registration_id: null,
      participant_type: p.type ?? 'individual', status: p.status ?? 'active', member_user_ids: p.users,
    });
    membersByPid.set(p.id, p.users.map((u, i) => ({
      id: p.id * 1000 + i, tournament_id: 1, participant_id: p.id, user_id: u,
      member_order: i, status: 'active', joined_at: '2026-01-01 00:00:00', left_at: null, replaced_by_member_id: null,
    })));
  }
  pdr.findParticipantById.mockImplementation(async (id: number) => byId.get(Number(id)) ?? null);
  pmr.listMembersByParticipant.mockImplementation(async (id: number) => membersByPid.get(Number(id)) ?? []);
  pmr.findActiveMembersByUserIds.mockImplementation(async (_tid: number, userIds: number[]) => {
    const rows: Array<{ participant_id: number; user_id: number }> = [];
    for (const [pid, members] of membersByPid) {
      for (const m of members) {
        if (m.status === 'active' && userIds.includes(Number(m.user_id))) rows.push({ participant_id: pid, user_id: Number(m.user_id) });
      }
    }
    return rows;
  });
}

function installDefaultParticipants() {
  installParticipantMocks([
    { id: 100, users: [10] },
    { id: 200, users: [20] },
    { id: 101, type: 'pair', users: [10, 11] },
    { id: 201, type: 'pair', users: [20, 21] },
    { id: 102, type: 'team', users: [10, 11, 12] },
    { id: 202, type: 'team', users: [20, 21, 22] },
    { id: 300, users: [50] },
  ]);
}

/**
 * G9-C — configure the row that `lockMatchById` (`SELECT ... FOR UPDATE`) returns,
 * i.e. the target slot state AFTER the winner has been seated.
 */
function setLockedTarget(overrides: Partial<TournamentMatch> = {}): void {
  lockedTarget.row = {
    id: 31, tournament_id: 1, round: 2, bracket_position: 0, match_id: null,
    participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
    stage_id: null, group_id: null, progression_state: 'pending', status: 'scheduled', winner_id: null,
    ...overrides,
  };
}

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 1, format: 'knockout',
    name: 'T1', max_participants: 8, min_participants: 2, entry_fee: 0,
    currency_code: 'USD', price_type: 'FREE', status: 'running',
    sport_id: 22, match_format_id: 1, rule_set_id: 1, draw_seed: 42,
    ...overrides,
  };
}

function makeReg(overrides: Partial<TournamentRegistration> = {}): TournamentRegistration {
  return {
    id: 1, tournament_id: 1, user_id: 5, player_id: 5, seed: 1, status: 'confirmed',
    payment_status: 'paid', registered_at: '2026-01-01 00:00:00',
    ...overrides,
  };
}

function makeSlot(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 1, tournament_id: 1, round: 1, bracket_position: 0,
    player1_id: 10, player2_id: 20, mode: 'knockout',
    status: 'in_progress', progression_state: 'pending', progression_meta: null,
    match_id: 900, stage_id: null, group_id: null, winner_id: null,
    start_time: null, end_time: null, score_summary: null,
    ...overrides,
  } as TournamentMatch;
}

describe('TournamentService.progressFromApprovedResult (Group 5B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findMatches.mockResolvedValue([]);
    repo.findStages.mockResolvedValue([]);
    pool.getConnection.mockResolvedValue(fakeConn);
    installDefaultParticipants();
    lockedTarget.row = null;
    repo.lockMatchById.mockImplementation(async () => lockedTarget.row);
  });

  const svc = new TournamentService();

  it('is a no-op when the source match is not a tournament slot', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(null);

    const out = await svc.progressFromApprovedResult({ matchId: 12345, resultId: 1 });

    expect(out).toEqual({ advancedTo: null });
    expect(repo.updateMatch).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('ingests round-robin / legacy results to standings without auto-completing the tournament', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      progression_meta: { is_bracket: false }, group_id: 5,
    }));
    mrRepo.getParticipants.mockResolvedValue([
      { userId: 10, outcome: 'win' },
      { userId: 20, outcome: 'loss' },
    ]);

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 2 });

    expect(repo.updateMatch).toHaveBeenCalledTimes(1);
    expect(repo.updateMatch).toHaveBeenCalledWith(11, expect.objectContaining({
      winner_id: 10,
      status: 'completed',
      progression_state: 'completed',
    }), fakeConn);
    expect(repo.recalculateStandings).toHaveBeenCalledWith(1, 5, fakeConn);
    expect(repo.updateStatus).not.toHaveBeenCalledWith(1, 'completed');
    expect(bus.emit).toHaveBeenCalledWith(
      'tournament:match-progressed',
      expect.objectContaining({ advancedTo: null }),
      expect.anything(),
    );
    expect(bus.emit.mock.calls.some((c) => c[0] === 'tournament:completed')).toBe(false);
  });

  it('resolves an approved bracket slot, seats the winner, and creates the shared Match for the target', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      participant1_id: 100, participant2_id: 200,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 1, target_side: 'player1' },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 1, match_id: null,
      participant1_id: null, participant2_id: 200,
      player1_id: null, player2_id: 20,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'singles', playersPerSide: 1, name: 'Tennis', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });
    // G9-C — the FOR UPDATE read returns the target after the winner was seated.
    setLockedTarget({ id: 31, round: 2, bracket_position: 1, participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20 });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    // Winner seated in source slot + target slot (participant identity + legacy user).
    expect(repo.updateMatch).toHaveBeenCalledWith(11, expect.objectContaining({ winner_id: 10, progression_state: 'completed' }), fakeConn);
    const seatedTarget = repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.participant1_id === 100 && c[1]?.player1_id === 10);
    expect(seatedTarget).toBeTruthy();
    // Shared Match created and linked once both participants exist.
    expect(matchServiceMock.createForTournament).toHaveBeenCalled();
    expect(matchServiceMock.createForTournament.mock.calls[0][0].participants).toEqual([
      { userId: 10, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 20, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
    expect(repo.updateMatch.mock.calls.some((c) => c[0] === 31 && c[1]?.match_id === 950 && c[1]?.progression_state === 'ready')).toBe(true);
    expect(bus.emit).toHaveBeenCalledWith('tournament:match-created', expect.objectContaining({ matchId: 950, tournamentMatchId: 31, participantWinnerId: 100 }), expect.anything());
    expect(out).toMatchObject({ advancedTo: 31, sharedMatchId: 950, stageCompleted: false, tournamentCompleted: false });
  });

  it('completes the tournament after the final round result', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 61, round: 4, bracket_position: 0, match_id: 930,
      participant1_id: 100, participant2_id: 200,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);

    const out = await svc.progressFromApprovedResult({ matchId: 930, resultId: 4 });

    expect(repo.updateStatus).toHaveBeenCalledWith(1, 'completed', fakeConn);
    expect(bus.emit).toHaveBeenCalledWith('tournament:completed', expect.objectContaining({ tournamentId: 1, winnerId: 10 }), expect.anything());
    expect(out.tournamentCompleted).toBe(true);
  });

  it('advances a bye-filled slot without a winner when the approved result has no winner', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 1, target_side: 'player1' },
    }));
    // Approved dispute resolution with no winner (no_result/draw) — slot resolves, nothing propagates.
    mrRepo.getParticipants.mockResolvedValue([
      { userId: 10, outcome: 'draw' },
      { userId: 20, outcome: 'draw' },
    ]);
    repo.findBracketSlot.mockResolvedValue(null);

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 5 });

    expect(repo.updateMatch).toHaveBeenCalledWith(11, expect.objectContaining({ progression_state: 'completed' }));
    expect(repo.updateMatch.mock.calls.some((c) => c[0] === 11 && c[1]?.winner_id == null)).toBe(true);
    expect(out.advancedTo).toBeNull();
    expect(bus.emit.mock.calls.some((c) => c[0] === 'tournament:match-created')).toBe(false);
  });

  it('is idempotent on double delivery (slot already completed)', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      status: 'completed', progression_state: 'completed',
      winner_id: 10,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 1, target_side: 'player1' },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win' }]);

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 6 });

    expect(repo.updateMatch).not.toHaveBeenCalled();
    expect(out.advancedTo).toBeNull();
  });

  it('marks the last stage of the tournament completed and completes the tournament', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 61, round: 4, bracket_position: 0, match_id: 940, stage_id: 3,
      participant1_id: 100, participant2_id: 200,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 20, outcome: 'win', side: 'away' }, { userId: 10, outcome: 'loss', side: 'home' }]);
    repo.countIncompleteStageMatches.mockResolvedValue(0);
    repo.findStages.mockResolvedValue([
      { id: 1, stage_order: 1, name: 'Groups', progression_format: 'round_robin' },
      { id: 2, stage_order: 2, name: 'Semis', progression_format: 'knockout' },
      { id: 3, stage_order: 3, name: 'Final', progression_format: 'knockout' },
    ]);

    const out = await svc.progressFromApprovedResult({ matchId: 940, resultId: 7 });

    expect(repo.updateStageStatus).toHaveBeenCalledWith(3, 'completed', fakeConn);
    expect(repo.updateStatus).toHaveBeenCalledWith(1, 'completed', fakeConn);
    expect(bus.emit).toHaveBeenCalledWith('tournament:stage-completed', expect.objectContaining({ stageId: 3 }), expect.anything());
    expect(out.stageCompleted).toBe(true);
    expect(out.tournamentCompleted).toBe(true);
  });

  it('does not complete the tournament when a non-final stage finishes', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 51, round: 2, bracket_position: 0, match_id: 941, stage_id: 2,
      participant1_id: 100, participant2_id: 200,
      progression_meta: { is_bracket: true, target_round: 3, target_bracket_position: 0, target_side: 'player1' },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 60, round: 3, bracket_position: 0, match_id: null, player1_id: null, player2_id: null,
      participant1_id: null, participant2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    repo.countIncompleteStageMatches.mockResolvedValue(0);
    repo.findStages.mockResolvedValue([
      { id: 1, stage_order: 1, name: 'Groups', progression_format: 'round_robin' },
      { id: 2, stage_order: 2, name: 'Semis', progression_format: 'knockout' },
      { id: 3, stage_order: 3, name: 'Final', progression_format: 'knockout' },
    ]);
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'singles', playersPerSide: 1, name: 'Tennis', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
    matchServiceMock.createForTournament.mockResolvedValue({ id: 960, tournamentId: 1 });

    const out = await svc.progressFromApprovedResult({ matchId: 941, resultId: 8 });

    expect(repo.updateStageStatus).toHaveBeenCalledWith(2, 'completed', fakeConn);
    // Stage 2 is NOT the max-order stage — tournament must remain running.
    expect(repo.updateStatus.mock.calls.some((c) => String(c[1]) === 'completed')).toBe(false);
    expect(out.stageCompleted).toBe(true);
    expect(out.tournamentCompleted).toBe(false);
  });
});

describe('G8-B — legacy TournamentService.generateBracket removed (modern locked-draw only)', () => {
  const svc = new TournamentService();

  it('the legacy registration-driven bracket generator no longer exists', () => {
    expect((svc as any).generateBracket).toBeUndefined();
    expect((svc as any).generateFixtures).toBeUndefined();
    expect((svc as any).createTournamentMatchFromSlot).toBeUndefined();
  });

  it('generation is now exclusively the LOCKED-DRAW path (MatchScheduleService)', () => {
    // Modern idempotency / lifecycle gating is covered by match-schedule.service.spec
    // (A1/A2 locked-draw gate, A3 matches-already-generated, T1-T3 wiring). The
    // service must not accidentally resurrect a registration-driven generator.
    expect((svc as any).generateBracket).toBeUndefined();
    expect((svc as any).generateMatches).toBeUndefined();
  });
});

describe('G9-A — progression consumes the corrected G8 Round-1 target wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findStages.mockResolvedValue([]);
    pool.getConnection.mockResolvedValue(fakeConn);
    installDefaultParticipants();
    lockedTarget.row = null;
    repo.lockMatchById.mockImplementation(async () => lockedTarget.row);
  });

  const svc = new TournamentService();

  function slotMeta(s: { targetRound?: number; targetBracketPosition?: number; targetSide?: 'player1' | 'player2' }) {
    return {
      is_bracket: true,
      target_round: s.targetRound ?? null,
      target_bracket_position: s.targetBracketPosition ?? null,
      target_side: s.targetSide ?? 'player1',
    };
  }

  it('C1. a Round-1 result on a corrected 8-participant G8 bracket does NOT complete the tournament and seats the winner', async () => {
    // Reconstruct the EXACT bracket the G8 locked-draw path now persists
    // (single topology source: generateKnockoutBracket + normaliseBracketTargets).
    const ids = [10, 20, 30, 40, 50, 60, 70, 80];
    const slots = normaliseBracketTargets(generateKnockoutBracket(ids), ids.length);
    const r1 = slots.filter((s) => s.round === 1).sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));
    const r2 = slots.filter((s) => s.round === 2).sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));

    // M1 = 10 vs 20, target Round-2 position 0, side player1.
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: r1[0].bracketPosition,
      participant1_id: 100, participant2_id: 200,
      player1_id: r1[0].player1Id, player2_id: r1[0].player2Id, match_id: 900,
      progression_meta: slotMeta(r1[0]),
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: r2[0].bracketPosition,
      participant1_id: null, participant2_id: null,
      player1_id: null, player2_id: null, match_id: null,
      progression_meta: slotMeta(r2[0]),
    }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'singles', playersPerSide: 1, name: 'Tennis', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    // A Round-1 result must NEVER complete the tournament.
    expect(repo.updateStatus).not.toHaveBeenCalledWith(1, 'completed');
    expect(out.tournamentCompleted).toBe(false);
    // The winner PARTICIPANT is seated into the correct Round-2 target slot.
    const seated = repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.participant1_id === 100 && c[1]?.player1_id === 10);
    expect(seated).toBeTruthy();
    expect(out.advancedTo).toBe(31);
  });

  it('D1. a Round-1 bye with corrected G8 wiring advances through consecutive byes to the Final (advanceByes)', async () => {
    // 5-participant bracket, positions 2 (lone bye, participant 300 / p50) + 3 (empty padding).
    const slots: any[] = [
      { id: 1, tournament_id: 1, round: 1, bracket_position: 2, participant1_id: 300, player1_id: 50, player2_id: null, match_id: null, status: 'scheduled', progression_state: 'pending', winner_id: null, stage_id: null, group_id: null,
        progression_meta: { is_bracket: true, bye: true, target_round: 2, target_bracket_position: 1, target_side: 'player1' } },
      { id: 3, tournament_id: 1, round: 1, bracket_position: 3, participant1_id: null, player1_id: null, player2_id: null, match_id: null, status: 'scheduled', progression_state: 'pending', winner_id: null, stage_id: null, group_id: null,
        progression_meta: { is_bracket: true, bye: true, target_round: 2, target_bracket_position: 1, target_side: 'player2' } },
      { id: 31, tournament_id: 1, round: 2, bracket_position: 1, participant1_id: null, participant2_id: null, player1_id: null, player2_id: null, match_id: null, status: 'scheduled', progression_state: 'pending', winner_id: null, stage_id: null, group_id: null,
        progression_meta: { is_bracket: true, target_round: 3, target_bracket_position: 0, target_side: 'player2' } },
      { id: 61, tournament_id: 1, round: 3, bracket_position: 0, participant1_id: null, participant2_id: null, player1_id: null, player2_id: null, match_id: null, status: 'scheduled', progression_state: 'pending', winner_id: null, stage_id: null, group_id: null,
        progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null, target_side: 'player1' } },
    ];
    repo.findMatches.mockImplementation(async () => slots.map((s) => ({ ...s })));
    repo.findBracketSlot.mockImplementation(async (_tid: number, round: number, pos: number) => {
      const s = slots.find((x) => x.round === round && x.bracket_position === pos);
      return s ? { ...s } : null;
    });
    repo.updateMatch.mockImplementation(async (id: number, data: Partial<TournamentMatch>) => {
      const s = slots.find((x) => x.id === id);
      if (s) Object.assign(s, data);
    });

    const out = await svc.advanceByes(1);

    // Lone Round-1 bye resolved and advanced (participant 300, primary member 50).
    expect(slots.find((s) => s.id === 1).progression_state).toBe('completed');
    expect(slots.find((s) => s.id === 1).winner_id).toBe(50);
    // Empty padding bye finalised in place (recognised by the virtual-bye cascade).
    expect(slots.find((s) => s.id === 3).progression_state).toBe('bye');
    // Winner PARTICIPANT seated into the Round-2 target (participant1 of R2 pos1).
    expect(slots.find((s) => s.id === 31).participant1_id).toBe(300);
    expect(slots.find((s) => s.id === 31).player1_id).toBe(50);
    // The lone Round-2 slot cascades into the Final (participant2 of the Final).
    expect(slots.find((s) => s.id === 31).progression_state).toBe('completed');
    expect(slots.find((s) => s.id === 61).participant2_id).toBe(300);
    expect(slots.find((s) => s.id === 61).player2_id).toBe(50);
    // Bye propagation never completes the tournament by itself.
    expect(repo.updateStatus).not.toHaveBeenCalledWith(1, 'completed');
    expect(out.advanced).toBe(3);
  });
});

describe('G9-B — participant-aware tournament progression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findStages.mockResolvedValue([]);
    pool.getConnection.mockResolvedValue(fakeConn);
    installDefaultParticipants();
    lockedTarget.row = null;
    repo.lockMatchById.mockImplementation(async () => lockedTarget.row);
  });

  const svc = new TournamentService();

  function round1Slot(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
    return makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      participant1_id: 101, participant2_id: 201,
      player1_id: 10, player2_id: 20,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
      ...overrides,
    });
  }

  function formatMocks() {
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'singles', playersPerSide: 1, name: 'Tennis', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
  }

  it('INDIVIDUAL — the winning tournament participant (not just a user) is seated', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(round1Slot({ participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20 }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: 200, player1_id: null, player2_id: 20,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });
    setLockedTarget({ participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20 });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    // Target slot receives the authoritative participant id AND the legacy user id.
    const seated = repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.participant1_id === 100 && c[1]?.player1_id === 10);
    expect(seated).toBeTruthy();
    expect(out.advancedTo).toBe(31);
    // Generated shared Match from the full (single-member) roster.
    expect(matchServiceMock.createForTournament.mock.calls[0][0].participants).toEqual([
      { userId: 10, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 20, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });

  it('PAIR — the whole pair advances; both members reach the next shared Match', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(round1Slot());
    // Pair A (participant 101: 10,11) beats Pair B (participant 201: 20,21).
    mrRepo.getParticipants.mockResolvedValue([
      { userId: 10, outcome: 'win', side: 'home' },
      { userId: 11, outcome: 'win', side: 'home' },
      { userId: 20, outcome: 'loss', side: 'away' },
      { userId: 21, outcome: 'loss', side: 'away' },
    ]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: 201, player1_id: null, player2_id: 20,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });
    setLockedTarget({ participant1_id: 101, participant2_id: 201, player1_id: 10, player2_id: 20 });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    // The winning PARTICIPANT (101) is seated — never a single member.
    const seated = repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.participant1_id === 101);
    expect(seated).toBeTruthy();
    expect(repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.player1_id === 10)).toBeTruthy();
    expect(out.advancedTo).toBe(31);
    // The generated shared Match contains the FULL pair rosters with correct sides.
    expect(matchServiceMock.createForTournament.mock.calls[0][0].participants).toEqual([
      { userId: 10, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 11, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 20, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 21, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });

  it('TEAM — the whole team advances; all members reach the next shared Match', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(round1Slot({ participant1_id: 102, participant2_id: 202, player1_id: 10, player2_id: 20 }));
    // Team A (102: 10,11,12) beats Team B (202: 20,21,22).
    mrRepo.getParticipants.mockResolvedValue([
      { userId: 10, outcome: 'win', side: 'home' },
      { userId: 11, outcome: 'win', side: 'home' },
      { userId: 12, outcome: 'win', side: 'home' },
      { userId: 20, outcome: 'loss', side: 'away' },
      { userId: 21, outcome: 'loss', side: 'away' },
      { userId: 22, outcome: 'loss', side: 'away' },
    ]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: 202, player1_id: null, player2_id: 20,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });
    setLockedTarget({ participant1_id: 102, participant2_id: 202, player1_id: 10, player2_id: 20 });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    const seated = repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.participant1_id === 102);
    expect(seated).toBeTruthy();
    expect(out.advancedTo).toBe(31);
    // Full Team A roster on side home, full Team B roster on side away.
    expect(matchServiceMock.createForTournament.mock.calls[0][0].participants).toEqual([
      { userId: 10, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 11, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 12, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 20, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 21, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 22, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });

  it('SIDE-BASED — the away-side winner resolves to the correct participant', async () => {
    // Pair B (participant 201: 20,21) wins on side AWAY. The source slot is an
    // ODD bracket position, so its winner fills the target's player2 side.
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 1, match_id: 900,
      participant1_id: 101, participant2_id: 201,
      player1_id: 10, player2_id: 20,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 1, target_side: 'player2' },
    }));
    mrRepo.getParticipants.mockResolvedValue([
      { userId: 10, outcome: 'loss', side: 'home' },
      { userId: 11, outcome: 'loss', side: 'home' },
      { userId: 20, outcome: 'win', side: 'away' },
      { userId: 21, outcome: 'win', side: 'away' },
    ]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 1, match_id: null,
      participant1_id: 100, participant2_id: null, player1_id: 10, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 951, tournamentId: 1 });
    setLockedTarget({ id: 31, round: 2, bracket_position: 1, participant1_id: 100, participant2_id: 201, player1_id: 10, player2_id: 20 });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    // Away winner (participant 201) is seated as target participant2 (the slot's
    // target side) — never a single member.
    const seated = repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.participant2_id === 201 && c[1]?.player2_id === 20);
    expect(seated).toBeTruthy();
    expect(out.advancedTo).toBe(31);
    expect(matchServiceMock.createForTournament.mock.calls[0][0].participants).toEqual([
      { userId: 10, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 20, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 21, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });

  it('VALIDATION — an approved win whose users span two participants fails safely', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(round1Slot());
    // Home side claims a winner from participant 101 AND an unrelated user (99).
    mrRepo.getParticipants.mockResolvedValue([
      { userId: 10, outcome: 'win', side: 'home' },
      { userId: 11, outcome: 'win', side: 'home' },
      { userId: 99, outcome: 'win', side: 'home' },
      { userId: 20, outcome: 'loss', side: 'away' },
      { userId: 21, outcome: 'loss', side: 'away' },
    ]);
    repo.findBracketSlot.mockResolvedValue(null);

    await expect(svc.progressFromApprovedResult({ matchId: 900, resultId: 3 }))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_PROGRESSION_AMBIGUOUS_WINNER });

    // Nothing was written — no corrupted target, no premature completion.
    expect(repo.updateMatch).not.toHaveBeenCalled();
    expect(repo.updateStatus).not.toHaveBeenCalledWith(1, 'completed');
  });

  it('VALIDATION — a winning user from another tournament fails safely', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(round1Slot({ participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20 }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    // Participant 100 belongs to tournament 999 (cross-tournament corruption).
    pdr.findParticipantById.mockImplementation(async (id: number) =>
      id === 100 ? { id: 100, tournament_id: 999, participant_type: 'individual', status: 'active', member_user_ids: [10] }
        : id === 200 ? { id: 200, tournament_id: 1, participant_type: 'individual', status: 'active', member_user_ids: [20] } : null,
    );
    pmr.listMembersByParticipant.mockImplementation(async (id: number) =>
      id === 100 ? [{ user_id: 10, status: 'active', member_order: 0 }]
        : id === 200 ? [{ user_id: 20, status: 'active', member_order: 0 }] : [],
    );

    await expect(svc.progressFromApprovedResult({ matchId: 900, resultId: 3 }))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_PROGRESSION_AMBIGUOUS_WINNER });
    expect(repo.updateMatch).not.toHaveBeenCalled();
  });

  it('BYE (pair) — a pair receiving a bye advances whole with no shared Match', async () => {
    const slots: any[] = [
      { id: 1, tournament_id: 1, round: 1, bracket_position: 0, participant1_id: 101, player1_id: 10, player2_id: null, match_id: null, status: 'scheduled', progression_state: 'pending', winner_id: null, stage_id: null, group_id: null,
        progression_meta: { is_bracket: true, bye: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' } },
      { id: 31, tournament_id: 1, round: 2, bracket_position: 0, participant1_id: null, participant2_id: 201, player1_id: null, player2_id: 20, match_id: null, status: 'scheduled', progression_state: 'pending', winner_id: null, stage_id: null, group_id: null,
        progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null, target_side: 'player2' } },
    ];
    repo.findMatches.mockImplementation(async () => slots.map((s) => ({ ...s })));
    repo.findBracketSlot.mockImplementation(async (_tid: number, round: number, pos: number) => {
      const s = slots.find((x) => x.round === round && x.bracket_position === pos);
      return s ? { ...s } : null;
    });
    repo.updateMatch.mockImplementation(async (id: number, data: Partial<TournamentMatch>) => {
      const s = slots.find((x) => x.id === id);
      if (s) Object.assign(s, data);
    });

    const out = await svc.advanceByes(1);

    // The pair participant (101) advances whole; primary member 10 on the target.
    expect(slots.find((s) => s.id === 1).progression_state).toBe('completed');
    expect(slots.find((s) => s.id === 31).participant1_id).toBe(101);
    expect(slots.find((s) => s.id === 31).player1_id).toBe(10);
    // No shared Match is created for the bye (pair roster stays intact).
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(slots.every((s) => s.match_id == null)).toBe(true);
    expect(repo.updateStatus).not.toHaveBeenCalledWith(1, 'completed');
    expect(out.advanced).toBe(1);
  });
});

describe('G9-C — idempotent & race-safe shared Match materialisation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findStages.mockResolvedValue([]);
    pool.getConnection.mockResolvedValue(fakeConn);
    acquireConn.fn = async () => fakeConn;
    installDefaultParticipants();
    lockedTarget.row = null;
    repo.lockMatchById.mockImplementation(async () => lockedTarget.row);
  });

  const svc = new TournamentService();

  function targetFixture(overrides: Record<string, unknown> = {}): any {
    return {
      id: 31, tournament_id: 1, round: 2, bracket_position: 0, match_id: null,
      participant1_id: 101, participant2_id: 201, player1_id: 10, player2_id: 20,
      stage_id: null, group_id: null, progression_state: 'pending', status: 'scheduled', winner_id: null,
      ...overrides,
    };
  }

  /** Wire the materialisation mocks against a mutable `row` (the DB row state). */
  function wireMaterialisation({ row, failCreate = false, failLink = false }: { row: any; failCreate?: boolean; failLink?: boolean }): void {
    let nextId = 950;
    repo.lockMatchById.mockImplementation(async () => ({ ...row }));
    repo.updateMatch.mockImplementation(async (_id: number, data: any) => {
      if (failLink && data?.match_id != null) throw new Error('link update failed');
      if (data?.match_id != null) row.match_id = data.match_id;
    });
    matchServiceMock.createForTournament.mockImplementation(async () => {
      if (failCreate) throw new Error('match creation failed');
      return { id: nextId++, tournamentId: 1 };
    });
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel Standard', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
  }

  /** Shared row-lock gate — the second `FOR UPDATE` blocks until the first commits. */
  function makeLockGate() {
    let holder: string | null = null;
    const waiters: Array<{ tag: string; resolve: () => void }> = [];
    return {
      async acquire(tag: string): Promise<void> {
        if (holder == null) { holder = tag; return; }
        await new Promise<void>((resolve) => waiters.push({ tag, resolve }));
        holder = tag;
      },
      release(tag: string): void {
        if (holder === tag) {
          const next = waiters.shift();
          if (next) next.resolve();
          else holder = null;
        }
      },
    };
  }

  function makeLockConn(tag: string, gate: ReturnType<typeof makeLockGate>): any {
    return {
      __tag: tag,
      beginTransaction: async () => undefined,
      query: async () => [[]],
      execute: async () => [{}],
      commit: async () => gate.release(tag),
      rollback: async () => gate.release(tag),
      release: () => undefined,
    };
  }

  it('C1. sequential calls — first materialises, second re-reads the SAME match_id (exactly one Match)', async () => {
    const row = targetFixture();
    wireMaterialisation({ row });

    const first = await (svc as any).attachSharedMatchToTarget(targetFixture(), makeTournament());
    const second = await (svc as any).attachSharedMatchToTarget(targetFixture(), makeTournament());

    expect(first).toEqual({ matchId: 950, created: true });
    expect(second).toEqual({ matchId: 950, created: false });
    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    expect(row.match_id).toBe(950);
  });

  it('C2. concurrent same-target calls — exactly one Match, both callers converge on the same id', async () => {
    const row = targetFixture();
    wireMaterialisation({ row });
    const gate = makeLockGate();
    const connA = makeLockConn('A', gate);
    const connB = makeLockConn('B', gate);
    let connCall = 0;
    acquireConn.fn = async () => (connCall++ === 0 ? connA : connB);
    repo.lockMatchById.mockImplementation(async (_id: number, conn: any) => {
      await gate.acquire(conn.__tag);
      return { ...row };
    });

    const [a, b] = await Promise.all([
      (svc as any).attachSharedMatchToTarget(targetFixture(), makeTournament()),
      (svc as any).attachSharedMatchToTarget(targetFixture(), makeTournament()),
    ]);

    // Exactly ONE shared Match was created; the loser blocked on the row lock and
    // re-read the already-linked match_id.
    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ matchId: 950, created: true });
    expect(b).toEqual({ matchId: 950, created: false });
    expect(row.match_id).toBe(950);
  });

  it('C3. already-materialised target — returns the existing match_id, no INSERT, no duplicate', async () => {
    const row = targetFixture({ match_id: 900 });
    wireMaterialisation({ row });

    const out = await (svc as any).attachSharedMatchToTarget(targetFixture({ match_id: 900 }), makeTournament());

    expect(out).toEqual({ matchId: 900, created: false });
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(repo.updateMatch).not.toHaveBeenCalledWith(31, expect.objectContaining({ match_id: expect.anything() }));
    expect(row.match_id).toBe(900);
  });

  it('C4. Match creation failure — transaction rolls back, target untouched, no orphan Match', async () => {
    const row = targetFixture();
    wireMaterialisation({ row, failCreate: true });

    await expect((svc as any).attachSharedMatchToTarget(targetFixture(), makeTournament()))
      .rejects.toThrow('match creation failed');

    expect(row.match_id).toBeNull();
    expect(fakeConn.rollback).toHaveBeenCalled();
    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
  });

  it('C5. target link update failure — transaction rolls back, no orphan Match, match_id unchanged', async () => {
    const row = targetFixture();
    wireMaterialisation({ row, failLink: true });

    await expect((svc as any).attachSharedMatchToTarget(targetFixture(), makeTournament()))
      .rejects.toThrow('link update failed');

    expect(row.match_id).toBeNull();
    expect(fakeConn.rollback).toHaveBeenCalled();
  });

  it('C6. PAIR concurrency — full pair roster preserved, exactly one shared Match', async () => {
    const row = targetFixture(); // participants 101 / 201 (pairs)
    wireMaterialisation({ row });
    const gate = makeLockGate();
    let connCall = 0;
    acquireConn.fn = async () => (connCall++ === 0 ? makeLockConn('A', gate) : makeLockConn('B', gate));
    repo.lockMatchById.mockImplementation(async (_id: number, conn: any) => {
      await gate.acquire(conn.__tag);
      return { ...row };
    });

    const [a, b] = await Promise.all([
      (svc as any).attachSharedMatchToTarget(targetFixture(), makeTournament()),
      (svc as any).attachSharedMatchToTarget(targetFixture(), makeTournament()),
    ]);

    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ matchId: 950, created: true });
    expect(b).toEqual({ matchId: 950, created: false });
    expect(matchServiceMock.createForTournament.mock.calls[0][0].participants).toEqual([
      { userId: 10, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 11, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 20, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 21, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });

  it('C7. TEAM concurrency — full team roster preserved, exactly one shared Match', async () => {
    const row = targetFixture({ participant1_id: 102, participant2_id: 202, player1_id: 10, player2_id: 20 });
    wireMaterialisation({ row });
    const gate = makeLockGate();
    let connCall = 0;
    acquireConn.fn = async () => (connCall++ === 0 ? makeLockConn('A', gate) : makeLockConn('B', gate));
    repo.lockMatchById.mockImplementation(async (_id: number, conn: any) => {
      await gate.acquire(conn.__tag);
      return { ...row };
    });

    const [a, b] = await Promise.all([
      (svc as any).attachSharedMatchToTarget(targetFixture({ participant1_id: 102, participant2_id: 202, player1_id: 10, player2_id: 20 }), makeTournament()),
      (svc as any).attachSharedMatchToTarget(targetFixture({ participant1_id: 102, participant2_id: 202, player1_id: 10, player2_id: 20 }), makeTournament()),
    ]);

    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ matchId: 950, created: true });
    expect(b).toEqual({ matchId: 950, created: false });
    expect(matchServiceMock.createForTournament.mock.calls[0][0].participants).toEqual([
      { userId: 10, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 11, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 12, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 20, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 21, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 22, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });

  it('C8. event behaviour — exactly one match-created event on creation, none on re-read, none on rollback', async () => {
    // (a) actual creation through the full flow → exactly one tournament:match-created.
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      participant1_id: 100, participant2_id: 200,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: 200, player1_id: null, player2_id: 20,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'singles', playersPerSide: 1, name: 'Tennis', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });
    setLockedTarget({ participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20 });

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    const createdEvents = bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:match-created');
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0][1]).toMatchObject({ matchId: 950, tournamentMatchId: 31 });

    // (b) a second delivery that only re-reads an existing target emits NO event.
    bus.emit.mockClear();
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      participant1_id: 100, participant2_id: 200,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
    }));
    // Simulate the pre-materialised target (created by caller (a)).
    setLockedTarget({ participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20, match_id: 950 });
    await svc.progressFromApprovedResult({ matchId: 900, resultId: 4 });
    expect(bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:match-created')).toHaveLength(0);
    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1); // only caller (a) created

    // (c) rollback (creation failure) → no match-created event.
    bus.emit.mockClear();
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      participant1_id: 100, participant2_id: 200,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
    }));
    setLockedTarget({ participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20 });
    matchServiceMock.createForTournament.mockRejectedValue(new Error('match creation failed'));
    await expect(svc.progressFromApprovedResult({ matchId: 900, resultId: 5 })).rejects.toThrow('match creation failed');
    expect(bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:match-created')).toHaveLength(0);
  });
});

describe('G9-D2 — post-start withdrawal lone-slot resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findStages.mockResolvedValue([]);
    pool.getConnection.mockResolvedValue(fakeConn);
    acquireConn.fn = async () => fakeConn;
    installDefaultParticipants();
    lockedTarget.row = null;
    repo.lockMatchById.mockImplementation(async () => lockedTarget.row);
    repo.findMatchesDetailed.mockResolvedValue([]);
    matchServiceMock.cancelTournamentMatch.mockResolvedValue(undefined);
    courtReservationMock.releaseCourt.mockResolvedValue({ released: false, bookingId: null });
  });

  const svc = new TournamentService();

  function detailedSlot(overrides: Record<string, unknown> = {}): any {
    return {
      id: 21, tournament_id: 1, round: 1, bracket_position: 0, match_id: null,
      participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20,
      status: 'scheduled', progression_state: 'pending', stage_id: null, group_id: null, winner_id: null,
      shared_status: null,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
      ...overrides,
    };
  }

  function installWithdrawnPair() {
    installParticipantMocks([
      { id: 100, users: [10], status: 'withdrawn_after_start' },
      { id: 200, users: [20] },
    ]);
  }

  it('1. future slot (individual): active opponent advances exactly once — no Walkover', async () => {
    installWithdrawnPair();
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot()]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));

    const out = await svc.resolveWithdrawnSlots(1, 100);

    expect(out.resolvedSlots).toBe(1);
    // The ACTIVE opponent (participant 200) advances via lone-slot semantics.
    expect(repo.updateMatch).toHaveBeenCalledWith(21, expect.objectContaining({ winner_id: 20, status: 'completed', progression_state: 'completed' }));
    const seated = repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.participant1_id === 200 && c[1]?.player1_id === 20);
    expect(seated).toBeTruthy();
    // No Walkover Result, no Match Result creation, no shared match materialisation.
    expect(mrRepo.getParticipants).not.toHaveBeenCalled();
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(bus.emit).toHaveBeenCalledWith('tournament:match-progressed', expect.objectContaining({ participantWinnerId: 200 }), expect.anything());
    expect(bus.emit).toHaveBeenCalledWith('tournament:withdrawal-resolved', expect.objectContaining({ tournamentId: 1, withdrawnParticipantId: 100, resolvedSlots: 1 }), expect.anything());
  });

  it('2. no Walkover is ever created for a lone-slot resolution', async () => {
    installWithdrawnPair();
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot()]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));

    await svc.resolveWithdrawnSlots(1, 100);

    // The resolution is bracket progression — never a Match Result.
    expect(mrRepo.getParticipants).not.toHaveBeenCalled();
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
  });

  it('3. future slot: withdrawn participant with NO opponent is never advanced', async () => {
    installWithdrawnPair();
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot({ participant2_id: null, player2_id: null })]);

    const out = await svc.resolveWithdrawnSlots(1, 100);

    expect(out.resolvedSlots).toBe(0);
    expect(repo.updateMatch).not.toHaveBeenCalledWith(21, expect.objectContaining({ winner_id: expect.anything() }));
    // The withdrawn participant must never be seated as a winner.
    expect(repo.updateMatch.mock.calls.every((c: any[]) => c[1]?.winner_id !== 10)).toBe(true);
  });

  it('4. unstarted shared Match: cancelled (roster preserved) + court released + opponent advances; no result', async () => {
    installWithdrawnPair();
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot({ match_id: 900, shared_status: 'closed' })]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    courtReservationMock.releaseCourt.mockResolvedValue({ released: true, bookingId: 5001 });

    const out = await svc.resolveWithdrawnSlots(1, 100);

    expect(out.cancelledMatches).toBe(1);
    expect(out.releasedCourts).toBe(1);
    expect(out.resolvedSlots).toBe(1);
    // Non-destructive shared cancellation (match_participants preservation is the helper's contract).
    expect(matchServiceMock.cancelTournamentMatch).toHaveBeenCalledWith(900, expect.stringContaining('withdrew'));
    // Idempotent, tournament-only court release through the established service.
    expect(courtReservationMock.releaseCourt).toHaveBeenCalledWith(900);
    // No result is generated.
    expect(mrRepo.getParticipants).not.toHaveBeenCalled();
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
  });

  it('5. idempotent: re-running resolution produces no duplicate progression/match/reservation effects', async () => {
    installWithdrawnPair();
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot({ match_id: 900, shared_status: 'closed' })]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    courtReservationMock.releaseCourt.mockResolvedValue({ released: true, bookingId: 5001 });

    const first = await svc.resolveWithdrawnSlots(1, 100);
    // Second call sees the slot already resolved (terminal) — no new effects.
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot({ match_id: 900, shared_status: 'closed', status: 'completed', progression_state: 'completed' })]);
    const second = await svc.resolveWithdrawnSlots(1, 100);

    expect(first.resolvedSlots).toBe(1);
    expect(second.resolvedSlots).toBe(0);
    expect(second.cancelledMatches).toBe(0);
    expect(second.releasedCourts).toBe(0);
    expect(courtReservationMock.releaseCourt).toHaveBeenCalledTimes(1);
    expect(matchServiceMock.cancelTournamentMatch).toHaveBeenCalledTimes(1);
    expect(repo.updateMatch.mock.calls.filter((c: any[]) => c[0] === 31 && c[1]?.participant1_id === 200)).toHaveLength(1);
  });

  it('6. in-progress shared Match: NOT cancelled, court kept, result lifecycle intact', async () => {
    installWithdrawnPair();
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot({ match_id: 900, shared_status: 'in_progress', status: 'in_progress' })]);

    const out = await svc.resolveWithdrawnSlots(1, 100);

    expect(out.resolvedSlots).toBe(0);
    expect(out.cancelledMatches).toBe(0);
    expect(out.releasedCourts).toBe(0);
    expect(matchServiceMock.cancelTournamentMatch).not.toHaveBeenCalled();
    expect(courtReservationMock.releaseCourt).not.toHaveBeenCalled();
    expect(repo.updateMatch).not.toHaveBeenCalled();
  });

  it('7. completed slot: never mutated by withdrawal', async () => {
    installWithdrawnPair();
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot({ match_id: 900, shared_status: 'completed', status: 'completed', progression_state: 'completed' })]);

    const out = await svc.resolveWithdrawnSlots(1, 100);

    expect(out.resolvedSlots).toBe(0);
    expect(out.cancelledMatches).toBe(0);
    expect(out.releasedCourts).toBe(0);
    expect(repo.updateMatch).not.toHaveBeenCalled();
    expect(matchServiceMock.cancelTournamentMatch).not.toHaveBeenCalled();
  });

  it('8. M5×M10 — withdrawn participant wins an in-progress Match: result authoritative, no advance, eligible opponent progresses', async () => {
    installParticipantMocks([
      { id: 100, users: [10], status: 'withdrawn_after_start' },
      { id: 200, users: [20] },
      { id: 300, users: [30] },
    ]);
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      participant1_id: 100, participant2_id: 200,
      player1_id: 10, player2_id: 20,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    const slot31 = makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: 300, player1_id: null, player2_id: 30,
      progression_meta: { is_bracket: true, target_round: 3, target_bracket_position: 0, target_side: 'player2' },
    });
    const slot61 = makeSlot({
      id: 61, round: 3, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    });
    repo.findBracketSlot.mockImplementation(async (_tid: number, round: number, pos: number) => {
      if (round === 2 && pos === 0) return slot31;
      if (round === 3 && pos === 0) return slot61;
      return null;
    });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    // Historical result remains authoritative (winner 10 recorded on the source).
    expect(repo.updateMatch).toHaveBeenCalledWith(11, expect.objectContaining({ winner_id: 10, status: 'completed', progression_state: 'completed' }), fakeConn);
    // The withdrawn winner is NEVER seated as the future winner.
    expect(repo.updateMatch.mock.calls.some((c: any[]) => c[0] === 31 && c[1]?.participant1_id === 100)).toBe(false);
    // The eligible participant already in the target (300) advances onward via lone-slot semantics.
    expect(repo.updateMatch).toHaveBeenCalledWith(31, expect.objectContaining({ winner_id: 30, status: 'completed', progression_state: 'completed' }));
    expect(repo.updateMatch.mock.calls.some((c: any[]) => c[0] === 61 && c[1]?.participant2_id === 300 && c[1]?.player2_id === 30)).toBe(true);
    // No tournament completion through a withdrawn winner; no shared match with the withdrawn participant.
    expect(repo.updateStatus).not.toHaveBeenCalledWith(1, 'completed');
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:match-created')).toHaveLength(0);
    expect(out.tournamentCompleted).toBe(false);
  });

  it('9. PAIR — whole participant withdraws; no member mutation; full opponent participant advances', async () => {
    installParticipantMocks([
      { id: 101, type: 'pair', users: [10, 11], status: 'withdrawn_after_start' },
      { id: 201, type: 'pair', users: [20, 21] },
    ]);
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot({
      participant1_id: 101, participant2_id: 201, player1_id: 10, player2_id: 20,
    })]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));

    const out = await svc.resolveWithdrawnSlots(1, 101);

    expect(out.resolvedSlots).toBe(1);
    // The whole opponent PARTICIPANT entity (201) is seated — never a single member.
    const seated = repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.participant1_id === 201);
    expect(seated).toBeTruthy();
    // The withdrawn pair roster was never mutated.
    expect(pmr.listMembersByParticipant).not.toHaveBeenCalledWith(101);
  });

  it('10. TEAM — full roster opponent advances; withdrawn team untouched', async () => {
    installParticipantMocks([
      { id: 102, type: 'team', users: [10, 11, 12], status: 'withdrawn_after_start' },
      { id: 202, type: 'team', users: [20, 21, 22] },
    ]);
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot({
      participant1_id: 102, participant2_id: 202, player1_id: 10, player2_id: 20,
    })]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));

    const out = await svc.resolveWithdrawnSlots(1, 102);

    expect(out.resolvedSlots).toBe(1);
    expect(repo.updateMatch.mock.calls.some((c) => c[0] === 31 && c[1]?.participant1_id === 202)).toBe(true);
    expect(pmr.listMembersByParticipant).not.toHaveBeenCalledWith(102);
  });

  it('11. court release is tournament-only + idempotent; no payment/accounting events', async () => {
    installWithdrawnPair();
    repo.findMatchesDetailed.mockResolvedValue([detailedSlot({ match_id: 900, shared_status: 'closed' })]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    courtReservationMock.releaseCourt.mockResolvedValue({ released: false, bookingId: null });

    const out = await svc.resolveWithdrawnSlots(1, 100);

    // No reservation → idempotent no-op, counted as not released.
    expect(courtReservationMock.releaseCourt).toHaveBeenCalledWith(900);
    expect(out.releasedCourts).toBe(0);
    // No payment / accounting / wallet events are ever emitted by the resolver.
    const financialEvents = bus.emit.mock.calls.filter((c: any[]) => /^(payment:|accounting:|wallet:)/.test(c[0]));
    expect(financialEvents).toHaveLength(0);
  });
});

describe('G9-D3 — ACTIVE-only progression/result eligibility (M10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findStages.mockResolvedValue([]);
    pool.getConnection.mockResolvedValue(fakeConn);
    acquireConn.fn = async () => fakeConn;
    installDefaultParticipants();
    lockedTarget.row = null;
    repo.lockMatchById.mockImplementation(async () => lockedTarget.row);
    repo.findMatchesDetailed.mockResolvedValue([]);
    matchServiceMock.cancelTournamentMatch.mockResolvedValue(undefined);
    courtReservationMock.releaseCourt.mockResolvedValue({ released: false, bookingId: null });
  });

  const svc = new TournamentService();

  it('0. eligibility predicate is ACTIVE-only (single authoritative rule)', () => {
    expect(isTournamentParticipantProgressionEligible('active')).toBe(true);
    expect(isTournamentParticipantProgressionEligible('waiting')).toBe(false);
    expect(isTournamentParticipantProgressionEligible('withdrawn')).toBe(false);
    expect(isTournamentParticipantProgressionEligible('withdrawn_after_start')).toBe(false);
  });

  it('1+9. withdrawn_after_start winner keeps an authoritative Result but cannot progress (no advance when target empty)', async () => {
    installParticipantMocks([
      { id: 100, users: [10], status: 'withdrawn_after_start' },
      { id: 200, users: [20] },
    ]);
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      participant1_id: 100, participant2_id: 200,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    // Target slot exists but has NO participant yet.
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    // Historical approved Result remains authoritative (source completes with the winner).
    expect(repo.updateMatch).toHaveBeenCalledWith(11, expect.objectContaining({ winner_id: 10, status: 'completed', progression_state: 'completed' }), fakeConn);
    // The withdrawn participant is NEVER seated into the future target.
    expect(repo.updateMatch.mock.calls.some((c: any[]) => c[0] === 31 && (c[1]?.participant1_id === 100 || c[1]?.participant2_id === 100))).toBe(false);
    // No future shared Match is materialised for the withdrawn participant.
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    // The tournament is not completed through an ineligible winner.
    expect(repo.updateStatus).not.toHaveBeenCalledWith(1, 'completed');
    expect(out.tournamentCompleted).toBe(false);
  });

  it('2. seatParticipantWinner refuses a withdrawn participant (persistence-boundary gate)', async () => {
    installParticipantMocks([
      { id: 100, users: [10], status: 'withdrawn_after_start' },
      { id: 200, users: [20] },
    ]);
    const slot = makeSlot({ id: 21, round: 1, bracket_position: 0, participant1_id: 100, participant2_id: 200, progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' } });

    const result = await (svc as any).seatParticipantWinner(slot, 100, 10);

    expect(result).toBeNull();
    expect(repo.updateMatch).not.toHaveBeenCalledWith(21, expect.objectContaining({ winner_id: expect.anything() }));
  });

  it('3. waiting participant cannot progress (seat + materialise gates)', async () => {
    installParticipantMocks([
      { id: 100, users: [10], status: 'waiting' },
      { id: 200, users: [20] },
    ]);
    const slot = makeSlot({ id: 21, round: 1, bracket_position: 0, participant1_id: 100, participant2_id: 200, progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' } });
    // Seat gate rejects.
    expect(await (svc as any).seatParticipantWinner(slot, 100, 10)).toBeNull();
    // Materialise gate rejects.
    setLockedTarget({ id: 31, participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20 });
    expect(await (svc as any).attachSharedMatchToTarget(makeSlot({ id: 31, match_id: null }), makeTournament())).toBeNull();
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
  });

  it('4. active participant still progresses normally (seat gate passes)', async () => {
    installDefaultParticipants();
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    const slot = makeSlot({ id: 21, round: 1, bracket_position: 0, participant1_id: 200, participant2_id: 100, progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' } });

    const target = await (svc as any).seatParticipantWinner(slot, 200, 20);

    expect(target).not.toBeNull();
    expect(repo.updateMatch).toHaveBeenCalledWith(21, expect.objectContaining({ winner_id: 20, status: 'completed', progression_state: 'completed' }));
    expect(repo.updateMatch.mock.calls.some((c: any[]) => c[0] === 31 && c[1]?.participant1_id === 200 && c[1]?.player1_id === 20)).toBe(true);
  });

  it('5. PAIR with withdrawn_after_start status cannot progress (no future shared Match)', async () => {
    installParticipantMocks([
      { id: 101, type: 'pair', users: [10, 11], status: 'withdrawn_after_start' },
      { id: 201, type: 'pair', users: [20, 21] },
    ]);
    setLockedTarget({ id: 31, participant1_id: 101, participant2_id: 201, player1_id: 10, player2_id: 20 });

    const out = await (svc as any).attachSharedMatchToTarget(makeSlot({ id: 31, match_id: null }), makeTournament());

    expect(out).toBeNull();
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
  });

  it('6. TEAM with withdrawn_after_start status cannot progress (no future shared Match)', async () => {
    installParticipantMocks([
      { id: 102, type: 'team', users: [10, 11, 12], status: 'withdrawn_after_start' },
      { id: 202, type: 'team', users: [20, 21, 22] },
    ]);
    setLockedTarget({ id: 31, participant1_id: 102, participant2_id: 202, player1_id: 10, player2_id: 20 });

    const out = await (svc as any).attachSharedMatchToTarget(makeSlot({ id: 31, match_id: null }), makeTournament());

    expect(out).toBeNull();
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
  });

  it('7. withdrawn participant cannot materialise as a future shared Match (either side)', async () => {
    installParticipantMocks([
      { id: 100, users: [10], status: 'withdrawn_after_start' },
      { id: 200, users: [20] },
    ]);
    setLockedTarget({ id: 31, participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20 });

    const out = await (svc as any).attachSharedMatchToTarget(makeSlot({ id: 31, match_id: null }), makeTournament());

    expect(out).toBeNull();
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
  });

  it('8. ACTIVE pair/team materialises normally with the full roster', async () => {
    installDefaultParticipants();
    setLockedTarget({ id: 31, participant1_id: 101, participant2_id: 201, player1_id: 10, player2_id: 20 });
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel Standard', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    const out = await (svc as any).attachSharedMatchToTarget(makeSlot({ id: 31, match_id: null }), makeTournament());

    expect(out).toEqual({ matchId: 950, created: true });
    expect(matchServiceMock.createForTournament.mock.calls[0][0].participants).toEqual([
      { userId: 10, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 11, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 20, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 21, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });

  it('10. M5×M10 regression — withdrawn winner of an in-progress Match does not advance', async () => {
    installParticipantMocks([
      { id: 100, users: [10], status: 'withdrawn_after_start' },
      { id: 200, users: [20] },
      { id: 300, users: [30] },
    ]);
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      participant1_id: 100, participant2_id: 200,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    const slot31 = makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: 300, player1_id: null, player2_id: 30,
      progression_meta: { is_bracket: true, target_round: 3, target_bracket_position: 0, target_side: 'player2' },
    });
    const slot61 = makeSlot({
      id: 61, round: 3, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    });
    repo.findBracketSlot.mockImplementation(async (_tid: number, round: number, pos: number) => {
      if (round === 2 && pos === 0) return slot31;
      if (round === 3 && pos === 0) return slot61;
      return null;
    });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(repo.updateMatch).toHaveBeenCalledWith(11, expect.objectContaining({ winner_id: 10, status: 'completed', progression_state: 'completed' }), fakeConn);
    expect(repo.updateMatch.mock.calls.some((c: any[]) => c[0] === 31 && c[1]?.participant1_id === 100)).toBe(false);
    expect(repo.updateMatch.mock.calls.some((c: any[]) => c[0] === 61 && c[1]?.participant2_id === 300)).toBe(true);
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(out.tournamentCompleted).toBe(false);
  });

  it('11. concurrency boundary — a status flipped to withdrawn before materialisation is refused (race regression)', async () => {
    installDefaultParticipants();
    // The target's participant was ACTIVE when seated, but withdraws before the
    // shared Match materialises — the attach eligibility check re-reads the
    // authoritative status and refuses.
    pdr.findParticipantById.mockImplementation(async (id: number) =>
      id === 100 ? { id: 100, tournament_id: 1, participant_type: 'individual', status: 'withdrawn_after_start', member_user_ids: [10] }
        : { id: 200, tournament_id: 1, participant_type: 'individual', status: 'active', member_user_ids: [20] },
    );
    setLockedTarget({ id: 31, participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20 });

    const out = await (svc as any).attachSharedMatchToTarget(makeSlot({ id: 31, match_id: null }), makeTournament());

    expect(out).toBeNull();
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
  });

  it('12. non-tournament shared result is unaffected — tournament eligibility is not global', async () => {
    // A shared Match that is NOT a tournament bracket slot → no tournament progression,
    // no eligibility interaction, nothing changes.
    repo.findMatchBySharedMatchId.mockResolvedValue(null);

    const out = await svc.progressFromApprovedResult({ matchId: 999, resultId: 1 });

    expect(out).toEqual({ advancedTo: null });
    expect(repo.updateMatch).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalled();
  });
});

describe('G9-D4 — progression recovery for a stalled target (match_id NULL)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findStages.mockResolvedValue([]);
    pool.getConnection.mockResolvedValue(fakeConn);
    acquireConn.fn = async () => fakeConn;
    installDefaultParticipants();
    lockedTarget.row = null;
    repo.lockMatchById.mockImplementation(async () => lockedTarget.row);
    repo.findMatchesDetailed.mockResolvedValue([]);
    matchServiceMock.cancelTournamentMatch.mockResolvedValue(undefined);
    courtReservationMock.releaseCourt.mockResolvedValue({ released: false, bookingId: null });
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
  });

  const svc = new TournamentService();

  function completedSource(overrides: Record<string, unknown> = {}): TournamentMatch {
    return makeSlot({
      id: 11, round: 1, bracket_position: 0, match_id: 900,
      status: 'completed', progression_state: 'completed',
      participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
      ...overrides,
    });
  }

  function formatMocks() {
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'singles', playersPerSide: 1, name: 'Tennis', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
  }

  /** A target that is populated but whose shared Match was never attached (match_id NULL). */
  function installStalledTarget(overrides: Record<string, unknown> = {}): any {
    const targetRow: any = {
      id: 31, tournament_id: 1, round: 2, bracket_position: 0, match_id: null,
      participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20,
      status: 'scheduled', progression_state: 'pending', stage_id: null, winner_id: null,
      ...overrides,
    };
    lockedTarget.row = targetRow;
    repo.lockMatchById.mockImplementation(async () => ({ ...targetRow }));
    repo.findBracketSlot.mockImplementation(async () => ({ ...targetRow }));
    repo.updateMatch.mockImplementation(async (_id: number, data: any) => {
      if (data?.match_id != null) targetRow.match_id = data.match_id;
    });
    return targetRow;
  }

  function makeLockGate() {
    let holder: string | null = null;
    const waiters: Array<{ tag: string; resolve: () => void }> = [];
    return {
      async acquire(tag: string): Promise<void> {
        if (holder == null) { holder = tag; return; }
        await new Promise<void>((resolve) => waiters.push({ tag, resolve }));
        holder = tag;
      },
      release(tag: string): void {
        if (holder === tag) {
          const next = waiters.shift();
          if (next) next.resolve();
          else holder = null;
        }
      },
    };
  }

  function makeLockConn(tag: string, gate: ReturnType<typeof makeLockGate>): any {
    return {
      __tag: tag,
      beginTransaction: async () => undefined,
      query: async () => [[]],
      execute: async () => [{}],
      commit: async () => gate.release(tag),
      rollback: async () => gate.release(tag),
      release: () => undefined,
    };
  }

  it('1. repairs a stalled target — source completed + target populated + match_id NULL → shared Match materialised', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    installStalledTarget();
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    expect(repo.updateMatch).toHaveBeenCalledWith(31, expect.objectContaining({ match_id: 950, progression_state: 'ready' }), expect.anything());
    expect(out).toMatchObject({ advancedTo: null });
  });

  it('2. exactly ONE shared Match exists after recovery (no duplicate), target linked once', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    installStalledTarget();
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    const linked = repo.updateMatch.mock.calls.filter((c: any[]) => c[0] === 31 && c[1]?.match_id === 950);
    expect(linked).toHaveLength(1);
  });

  it('3. idempotent retry — the second recovery run creates nothing', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    installStalledTarget();
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });
    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    expect(repo.updateMatch.mock.calls.filter((c: any[]) => c[0] === 31 && c[1]?.match_id === 950)).toHaveLength(1);
  });

  it('4. concurrent recovery attempts — exactly one shared Match, both converge', async () => {
    const targetRow = installStalledTarget();
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });
    const gate = makeLockGate();
    let connCall = 0;
    acquireConn.fn = async () => (connCall++ === 0 ? makeLockConn('A', gate) : makeLockConn('B', gate));
    // The pre-attach check is a fast path; the authoritative existence check is the
    // FOR UPDATE lock (lockMatchById) — both callers pass the fast path and the lock
    // serialises, so the loser re-reads the already-created Match.
    repo.findBracketSlot.mockImplementation(async () => ({ ...targetRow, match_id: null }));
    repo.lockMatchById.mockImplementation(async (_id: number, conn: any) => {
      await gate.acquire(conn.__tag);
      return { ...targetRow };
    });

    await Promise.all([
      svc.progressFromApprovedResult({ matchId: 900, resultId: 3 }),
      svc.progressFromApprovedResult({ matchId: 900, resultId: 3 }),
    ]);

    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    expect(targetRow.match_id).toBe(950);
    expect(repo.updateMatch.mock.calls.filter((c: any[]) => c[0] === 31 && c[1]?.match_id === 950)).toHaveLength(1);
  });

  it('5. already-repaired target — no new Match, no duplicate event', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    installStalledTarget({ match_id: 950 });
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:match-created')).toHaveLength(0);
  });

  it('6. legitimate bye / terminal target — never materialised', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    installStalledTarget({ progression_state: 'bye' });
    formatMocks();

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(repo.updateMatch).not.toHaveBeenCalledWith(31, expect.objectContaining({ match_id: expect.anything() }));
  });

  it('7. incomplete target (missing participants) — no Match manufactured, deterministic outcome', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    installStalledTarget({ participant2_id: null, player2_id: null });
    formatMocks();

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(repo.updateMatch).not.toHaveBeenCalledWith(31, expect.objectContaining({ match_id: expect.anything() }));
  });

  it('8. withdrawn_after_start participant in the target — G9-D3 gate prevents repair', async () => {
    installParticipantMocks([
      { id: 100, users: [10], status: 'withdrawn_after_start' },
      { id: 200, users: [20] },
    ]);
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    installStalledTarget({ participant1_id: 100 });
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(repo.updateMatch).not.toHaveBeenCalledWith(31, expect.objectContaining({ match_id: expect.anything() }));
  });

  it('9. PAIR/TEAM — recovery materialises with the full active roster', async () => {
    installDefaultParticipants();
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource({ participant1_id: 101, participant2_id: 201, player1_id: 10, player2_id: 20 }));
    installStalledTarget({ participant1_id: 101, participant2_id: 201, player1_id: 10, player2_id: 20 });
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    expect(matchServiceMock.createForTournament.mock.calls[0][0].participants).toEqual([
      { userId: 10, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 11, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 20, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 21, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });

  it('10. transient attach failure — error propagates (no false success), a later retry repairs', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    installStalledTarget();
    formatMocks();
    matchServiceMock.createForTournament.mockRejectedValue(new Error('db connection lost'));

    await expect(svc.progressFromApprovedResult({ matchId: 900, resultId: 3 })).rejects.toThrow('db connection lost');

    // After the transient failure clears, the retry is a genuine repair.
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });
    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });
    expect(out.advancedTo).toBeNull();
    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(2);
    expect(repo.updateMatch).toHaveBeenCalledWith(31, expect.objectContaining({ match_id: 950, progression_state: 'ready' }), expect.anything());
  });

  it('11. match-created is emitted exactly once on actual creation, never on an already-repaired target', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    installStalledTarget();
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });
    expect(bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:match-created')).toHaveLength(1);

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });
    expect(bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:match-created')).toHaveLength(1);
  });

  it('12. G9-D2 regression — post-start withdrawal resolution still advances the ACTIVE opponent', async () => {
    installParticipantMocks([
      { id: 100, users: [10], status: 'withdrawn_after_start' },
      { id: 200, users: [20] },
    ]);
    repo.findMatchesDetailed.mockResolvedValue([{
      id: 21, tournament_id: 1, round: 1, bracket_position: 0, match_id: null,
      participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20,
      status: 'scheduled', progression_state: 'pending', stage_id: null, winner_id: null, shared_status: null,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
    }]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 0, match_id: null,
      participant1_id: null, participant2_id: null, player1_id: null, player2_id: null,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));

    const out = await svc.resolveWithdrawnSlots(1, 100);

    expect(out.resolvedSlots).toBe(1);
    expect(repo.updateMatch.mock.calls.some((c: any[]) => c[0] === 31 && c[1]?.participant1_id === 200)).toBe(true);
  });

  it('13. M5×M10 regression — no recovery-created future Match for a withdrawn winner (lone target never repaired)', async () => {
    installParticipantMocks([
      { id: 100, users: [10], status: 'withdrawn_after_start' },
      { id: 200, users: [20] },
      { id: 300, users: [30] },
    ]);
    repo.findMatchBySharedMatchId.mockResolvedValue(completedSource());
    // The withdrawn winner was never seated; the target holds only the eligible
    // opponent (300) — an incomplete lone target, never a repair candidate.
    installStalledTarget({ participant2_id: 300, player2_id: 30, participant1_id: null, player1_id: null });
    formatMocks();
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(repo.updateMatch).not.toHaveBeenCalledWith(31, expect.objectContaining({ match_id: expect.anything() }));
  });
});