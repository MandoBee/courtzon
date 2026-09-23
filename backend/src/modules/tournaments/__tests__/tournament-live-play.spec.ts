import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import type { Tournament, TournamentMatch } from '../domain/tournament-aggregate.js';

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findByCode: vi.fn(),
  create: vi.fn(),
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
}));

const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  getConnection: vi.fn(async () => fakeConn),
}));

const matchServiceMock = vi.hoisted(() => ({
  createForTournament: vi.fn(),
  startMatch: vi.fn(),
  completeMatch: vi.fn(),
}));

const matchResultServiceMock = vi.hoisted(() => ({ submitMatchResult: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdr }));
vi.mock('../infrastructure/repositories/participant-member.repository.js', () => ({ participantMemberRepository: pmr }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));
vi.mock('../../match-result/application/match-result.service.js', () => ({ matchResultService: matchResultServiceMock }));

/** G9-B — participant fixtures: individuals 100→[10], 200→[20]. */
function installParticipantMocks() {
  const membersByPid: Record<number, any[]> = {
    100: [{ user_id: 10, status: 'active', member_order: 0 }],
    200: [{ user_id: 20, status: 'active', member_order: 0 }],
  };
  pdr.findParticipantById.mockImplementation(async (id: number) =>
    id === 100 ? { id: 100, tournament_id: 1, participant_type: 'individual', status: 'active', member_user_ids: [10] }
      : id === 200 ? { id: 200, tournament_id: 1, participant_type: 'individual', status: 'active', member_user_ids: [20] } : null,
  );
  pmr.listMembersByParticipant.mockImplementation(async (id: number) => membersByPid[Number(id)] ?? []);
  pmr.findActiveMembersByUserIds.mockImplementation(async (_tid: number, userIds: number[]) =>
    userIds.map((u) => ({ participant_id: u === 10 ? 100 : 200, user_id: Number(u) })),
  );
}

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 1, format: 'knockout',
    name: 'T1', max_participants: 8, min_participants: 2, entry_fee: 0,
    currency_code: 'USD', price_type: 'FREE', status: 'running',
    sport_id: 22, match_format_id: 1, rule_set_id: 1, draw_seed: 42,
    organisation_id: 6, branch_id: null,
    ...overrides,
  };
}

function makeSlot(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 11, tournament_id: 1, round: 1, bracket_position: 0,
    player1_id: 10, player2_id: 20, status: 'scheduled', progression_state: 'pending', progression_meta: null,
    match_id: 900, stage_id: null, group_id: null, winner_id: null,
    start_time: null, end_time: null, score_summary: null,
    ...overrides,
  } as TournamentMatch;
}

describe('TournamentService live-play bridge (T-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.findMatchById.mockResolvedValue(makeSlot());
    repo.updateMatch.mockResolvedValue(undefined);
    matchServiceMock.startMatch.mockResolvedValue(undefined);
    matchServiceMock.completeMatch.mockResolvedValue(undefined);
    matchResultServiceMock.submitMatchResult.mockResolvedValue({ id: 55, finalResult: { scoreSummary: '6-4, 6-3' } });
    pool.getConnection.mockResolvedValue(fakeConn);
  });

  const svc = new TournamentService();

  it('starts a Tournament Match through the SHARED Match Session lifecycle', async () => {
    await svc.startTournamentMatch(11, 7);

    expect(matchServiceMock.startMatch).toHaveBeenCalledWith(900);
    expect(repo.updateMatch).toHaveBeenCalledWith(11, { status: 'in_progress' });
    expect(bus.emit).toHaveBeenCalledWith('match:updated', expect.objectContaining({ matchId: 900 }), expect.anything());
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'tournament.match.started', entityId: 11 }));
  });

  it('rejects starting a Tournament Match with no shared Match (no fake session)', async () => {
    repo.findMatchById.mockResolvedValue(makeSlot({ match_id: null }));

    await expect(svc.startTournamentMatch(11, 7)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(matchServiceMock.startMatch).not.toHaveBeenCalled();
  });

  it('rejects starting a non-existent Tournament Match', async () => {
    repo.findMatchById.mockResolvedValue(null);

    await expect(svc.startTournamentMatch(11, 7)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_NOT_FOUND });
  });

  it('completes a Tournament Match through the SHARED Match Session lifecycle', async () => {
    repo.findMatchById.mockResolvedValue(makeSlot({ status: 'in_progress' }));

    await svc.completeTournamentMatch(11, 7);

    expect(matchServiceMock.completeMatch).toHaveBeenCalledWith(900);
    expect(repo.updateMatch).toHaveBeenCalledWith(11, { status: 'completed' });
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'tournament.match.completed', entityId: 11 }));
  });

  it('records a result through the AUTHORITATIVE shared Match Result service (operator submission)', async () => {
    const payload = { outcome: 'completed' as const, winner: null as const, score: { sets: [{ home: 6, away: 4 }] } };

    const out = await svc.recordSharedResult(11, 7, payload, '127.0.0.1');

    expect(matchResultServiceMock.submitMatchResult).toHaveBeenCalledWith(900, 7, payload, '127.0.0.1', { actorIsOperator: true });
    expect(repo.updateMatch).toHaveBeenCalledWith(11, { score_summary: '6-4, 6-3' });
    expect(out).toEqual({ sharedMatchId: 900, resultId: 55 });
  });

  it('rejects a result for a Tournament Match with no shared Match', async () => {
    repo.findMatchById.mockResolvedValue(makeSlot({ match_id: null }));

    await expect(svc.recordSharedResult(11, 7, { outcome: 'abandoned' } as any, undefined)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(matchResultServiceMock.submitMatchResult).not.toHaveBeenCalled();
  });

  it('does NOT create a competing result via the legacy tournament path', async () => {
    repo.findMatchById.mockResolvedValue(makeSlot({ match_id: 900 }));

    await svc.recordSharedResult(11, 7, { outcome: 'abandoned' } as any);

    expect(repo.createMatchResult).not.toHaveBeenCalled();
    expect(matchResultServiceMock.submitMatchResult).toHaveBeenCalledTimes(1);
  });

  it('includes organisationId in the authoritative progression events', async () => {
    installParticipantMocks();
    repo.findMatchBySharedMatchId.mockResolvedValue(makeSlot({
      id: 61, round: 4, bracket_position: 0, match_id: 930,
      participant1_id: 100, participant2_id: 200,
      status: 'in_progress',
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    }));
    mrRepo.getParticipants.mockResolvedValue([{ userId: 10, outcome: 'win', side: 'home' }, { userId: 20, outcome: 'loss', side: 'away' }]);
    repo.findStages.mockResolvedValue([]);

    await svc.progressFromApprovedResult({ matchId: 930, resultId: 4 });

    expect(bus.emit).toHaveBeenCalledWith('tournament:completed', expect.objectContaining({ organisationId: 6 }), expect.anything());
    expect(bus.emit).toHaveBeenCalledWith('tournament:match-progressed', expect.objectContaining({ organisationId: 6 }), expect.anything());
  });
});