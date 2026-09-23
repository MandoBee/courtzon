import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import { generateKnockoutBracket, normaliseBracketTargets } from '../domain/tournament-aggregate.js';
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
}));

const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  getConnection: vi.fn(async () => fakeConn),
}));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdr }));
vi.mock('../infrastructure/repositories/participant-member.repository.js', () => ({ participantMemberRepository: pmr }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
const matchServiceMock = vi.hoisted(() => ({ createForTournament: vi.fn() }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));

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

describe('TournamentService.generateBracket idempotency (Group 5B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findRegistrationsByTournament.mockResolvedValue([
      makeReg({ id: 1, player_id: 10, seed: 1 }),
      makeReg({ id: 2, player_id: 20, seed: 2 }),
      makeReg({ id: 3, player_id: 30, seed: 3 }),
    ]);
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'singles', playersPerSide: 1, name: 'Tennis', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
    matchServiceMock.createForTournament.mockResolvedValue({ id: 701 });
    projectRepoDefaultsForBracket();
  });

  function projectRepoDefaultsForBracket() {
    repo.findMatches.mockResolvedValue([]);
    repo.findStages.mockResolvedValue([]);
    repo.findBracketSlot.mockResolvedValue(null);
    repo.countIncompleteStageMatches.mockResolvedValue(0);
    repo.createMatch.mockResolvedValue(1);
    repo.updateMatch.mockResolvedValue(undefined);
  }

  const svc = new TournamentService();

  it('throws a ConflictError when the bracket already exists', async () => {
    repo.findMatches.mockResolvedValue([makeSlot({ id: 9 })]);

    await expect(svc.generateBracket(1)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_EXISTS });
    expect(repo.createMatch).not.toHaveBeenCalled();
  });

  it('auto-starts a tournament that has not reached running yet', async () => {
    repo.findById.mockResolvedValue(makeTournament({ status: 'draft' }));
    repo.updateStatus.mockResolvedValue(undefined);

    await svc.generateBracket(1);

    // draft → published → registration_open → registration_closed → running
    const statusCalls = repo.updateStatus.mock.calls.map((c) => c[1]);
    expect(statusCalls).toContain('published');
    expect(statusCalls).toContain('registration_open');
    expect(statusCalls).toContain('registration_closed');
    expect(statusCalls).toContain('running');
  });
});

describe('G9-A — progression consumes the corrected G8 Round-1 target wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findStages.mockResolvedValue([]);
    pool.getConnection.mockResolvedValue(fakeConn);
    installDefaultParticipants();
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