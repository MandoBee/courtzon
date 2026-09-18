import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
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
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
const matchServiceMock = vi.hoisted(() => ({ createForTournament: vi.fn() }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));

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
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 1, target_side: 'player1' },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win' }]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 31, round: 2, bracket_position: 1, match_id: null,
      player1_id: null, player2_id: 30,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'singles', playersPerSide: 1, name: 'Tennis', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
    matchServiceMock.createForTournament.mockResolvedValue({ id: 950, tournamentId: 1 });

    const out = await svc.progressFromApprovedResult({ matchId: 900, resultId: 3 });

    // Winner seated in source slot + target slot.
    expect(repo.updateMatch).toHaveBeenCalledWith(11, expect.objectContaining({ winner_id: 10, progression_state: 'completed' }), fakeConn);
    const seatedTarget = repo.updateMatch.mock.calls.find((c) => c[0] === 31 && c[1]?.player1_id === 10);
    expect(seatedTarget).toBeTruthy();
    // Shared Match created and linked once both participants exist.
    expect(matchServiceMock.createForTournament).toHaveBeenCalled();
    expect(repo.updateMatch.mock.calls.some((c) => c[0] === 31 && c[1]?.match_id === 950 && c[1]?.progression_state === 'ready')).toBe(true);
    expect(bus.emit).toHaveBeenCalledWith('tournament:match-created', expect.objectContaining({ matchId: 950, tournamentMatchId: 31 }), expect.anything());
    expect(out).toMatchObject({ advancedTo: 31, sharedMatchId: 950, stageCompleted: false, tournamentCompleted: false });
  });

  it('completes the tournament after the final round result', async () => {
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 61, round: 4, bracket_position: 0, match_id: 930,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win' }]);

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
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 20, outcome: 'win' }]);
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
      progression_meta: { is_bracket: true, target_round: 3, target_bracket_position: 0, target_side: 'player1' },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win' }]);
    repo.findBracketSlot.mockResolvedValue(makeSlot({
      id: 60, round: 3, bracket_position: 0, match_id: null, player1_id: null, player2_id: null,
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