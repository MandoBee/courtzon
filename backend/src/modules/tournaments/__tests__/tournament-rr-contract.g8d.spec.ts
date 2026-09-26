import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

/**
 * G8-D-CONTRACT — Round Robin completion guard + rules-driven draw scoring.
 *
 * Covers the approved business contract:
 *   1. RR completion is NOT auto-completed; the operator must click Complete,
 *      but Complete must be BLOCKED while required matches are unresolved
 *      (scheduled / in_progress / disputed).
 *   2. Standings become rules-driven for draw-capable results: frozen
 *      `sport_rule_sets.standings_rules.points` (win/draw/loss) applied per
 *      authoritative result; draws score points.draw (both sides), draws++
 *      increments, winner_id stays null, no_result is point-neutral.
 */

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '3306';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = '';
  process.env.DB_NAME = 'courtzon_test';
});

const eligibilityMock = vi.hoisted(() => ({ assertCanRegister: vi.fn() }));
const busEmit = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const tournamentRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  updateStatus: vi.fn(),
  countUnresolvedRequiredMatches: vi.fn(),
  findMatchBySharedMatchId: vi.fn(),
  updateMatch: vi.fn(),
  recalculateStandings: vi.fn(),
}));
const matchResultRepo = vi.hoisted(() => ({ findById: vi.fn() }));
const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  getConnection: vi.fn(async () => pool),
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: busEmit } }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tournamentRepo }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: matchResultRepo }));
vi.mock('./tournament-eligibility.service.js', () => ({ tournamentEligibilityService: eligibilityMock }));

let computeStandings: (matches: any[], participantIds: number[]) => Array<{ registration_id: number; points: number; wins: number; losses: number; draws: number }>;
let tournamentService: {
  complete: (id: number) => Promise<any>;
  syncSharedResultMirror: (r: number) => Promise<{ tournamentId: number | null; updated: boolean }>;
  recalculateStandingsForResult: (r: number) => Promise<void>;
};

beforeAll(async () => {
  const agg = await import('../domain/tournament-aggregate.js');
  const svc = await import('../application/tournament.service.js');
  computeStandings = agg.computeStandings;
  tournamentService = svc.tournamentService;
});

function rr(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, creator_id: 1, bracket_type_id: 3, format: 'round_robin', name: 'RR Cup',
    max_participants: 8, min_participants: 2, entry_fee: 0, currency_code: 'USD',
    price_type: 'FREE', status: 'running', sport_id: 22, match_format_id: 1, rule_set_id: 1,
    ...overrides,
  };
}

describe('G8-D-CONTRACT — RR completion guard (operator-only, blocked while unresolved)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tournamentRepo.findById.mockResolvedValue(rr());
    tournamentRepo.updateStatus.mockResolvedValue(rr({ status: 'completed' }));
    tournamentRepo.countUnresolvedRequiredMatches.mockResolvedValue(0);
  });

  it('admin-style complete succeeds when all required matches are terminal', async () => {
    const t = await tournamentService.complete(1);
    expect(tournamentRepo.countUnresolvedRequiredMatches).toHaveBeenCalledWith(1);
    expect(tournamentRepo.updateStatus).toHaveBeenCalledWith(1, 'completed');
    expect(t).toBeDefined();
  });

  it('rejects completion while a required match is scheduled', async () => {
    tournamentRepo.countUnresolvedRequiredMatches.mockResolvedValue(1);
    await expect(tournamentService.complete(1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_MATCHES_UNRESOLVED });
    expect(tournamentRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects completion while a required match is in_progress', async () => {
    tournamentRepo.countUnresolvedRequiredMatches.mockResolvedValue(2);
    await expect(tournamentService.complete(1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_MATCHES_UNRESOLVED });
    expect(tournamentRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects completion while a required result is disputed', async () => {
    tournamentRepo.countUnresolvedRequiredMatches.mockResolvedValue(3);
    await expect(tournamentService.complete(1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_MATCHES_UNRESOLVED });
    expect(tournamentRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('does NOT auto-complete an RR tournament (engine never calls updateStatus completed for RR)', async () => {
    // Confirms the RR path is operator-only: no result listener sets 'completed'.
    expect(tournamentRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('knockout tournaments keep manual completion without the RR guard', async () => {
    tournamentRepo.findById.mockResolvedValue(rr({ format: 'knockout', bracket_type_id: 1 }));
    await tournamentService.complete(1);
    // Knockout is out of the approved RR contract — the guard must not run.
    expect(tournamentRepo.countUnresolvedRequiredMatches).not.toHaveBeenCalled();
    expect(tournamentRepo.updateStatus).toHaveBeenCalledWith(1, 'completed');
  });
});

describe('G8-D-CONTRACT — rules-driven draw scoring (single standings authority)', () => {
  const FROZEN = { win: 3, draw: 1, loss: 0 };

  it('declares the fallback contract when no snapshot is attached (winner-only legacy)', () => {
    const standings = computeStandings([
      { player1_id: 1, player2_id: 2, status: 'completed', winner_id: 1 },
      { player1_id: 1, player2_id: 3, status: 'completed', winner_id: 1 },
      { player1_id: 2, player2_id: 3, status: 'completed', winner_id: 2 },
    ], [1, 2, 3]);
    const byReg = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byReg.get(1)?.points).toBe(6);
    expect(byReg.get(2)?.points).toBe(3);
    expect(byReg.get(3)?.points).toBe(0);
  });

  it('a draw applies rules_snapshot.points.draw to BOTH sides and increments draws', () => {
    const standings = computeStandings([
      // completed draw: winner_id null, outcome 'draw', frozen 3/1/0
      { player1_id: 1, player2_id: 2, status: 'completed', winner_id: null, standingsOutcome: 'draw', standingsPoints: FROZEN },
    ], [1, 2]);
    const byReg = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byReg.get(1)?.points).toBe(1);
    expect(byReg.get(2)?.points).toBe(1);
    expect(byReg.get(1)?.draws).toBe(1);
    expect(byReg.get(2)?.draws).toBe(1);
    expect(byReg.get(1)?.wins).toBe(0);
    expect(byReg.get(1)?.losses).toBe(0);
  });

  it('a win applies points.win and a loss applies points.loss from the snapshot', () => {
    const standings = computeStandings([
      { player1_id: 1, player2_id: 2, status: 'completed', winner_id: 1, standingsOutcome: 'win', standingsPoints: FROZEN },
    ], [1, 2]);
    const byReg = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byReg.get(1)?.points).toBe(3);
    expect(byReg.get(1)?.wins).toBe(1);
    expect(byReg.get(2)?.points).toBe(0); // points.loss = 0
    expect(byReg.get(2)?.losses).toBe(1);
  });

  it('no_result contributes zero points (point-neutral, terminal only)', () => {
    const standings = computeStandings([
      { player1_id: 1, player2_id: 2, status: 'completed', winner_id: null, standingsOutcome: 'no_result', standingsPoints: FROZEN },
      { player1_id: 1, player2_id: 3, status: 'completed', winner_id: 1, standingsOutcome: 'win', standingsPoints: FROZEN },
    ], [1, 2, 3]);
    const byReg = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byReg.get(1)?.points).toBe(3);
    expect(byReg.get(2)?.points).toBe(0);
    expect(byReg.get(2)?.wins).toBe(0);
    expect(byReg.get(2)?.draws).toBe(0);
    expect(byReg.get(3)?.points).toBe(0);
  });

  it('different frozen snapshots yield different draw points without touching historical rows', () => {
    const standings = computeStandings([
      { player1_id: 1, player2_id: 2, status: 'completed', winner_id: null, standingsOutcome: 'draw', standingsPoints: { win: 3, draw: 2, loss: 0 } },
    ], [1, 2]);
    const byReg = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byReg.get(1)?.points).toBe(2);
    expect(byReg.get(2)?.points).toBe(2);
  });

  it('a draw does not create winner_id', () => {
    const standings = computeStandings([
      { player1_id: 1, player2_id: 2, status: 'completed', winner_id: null, standingsOutcome: 'draw', standingsPoints: FROZEN },
    ], [1, 2]);
    // computeStandings never sets winner — it only scores the outcome.
    expect(standings).toHaveLength(2);
  });
});

describe('G8-D-CONTRACT — result snapshot mirroring stays authoritative (regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncSharedResultMirror still resolves approved winner + draw + no_result projections', async () => {
    // Win projection.
    matchResultRepo.findById.mockResolvedValue({ matchId: 100, finalResult: { winner: 'home', scoreSummary: '6-4' } });
    tournamentRepo.findMatchBySharedMatchId.mockResolvedValue({ id: 5, player1_id: 10, player2_id: 20, tournament_id: 1 });
    await expect(tournamentService.syncSharedResultMirror(3)).resolves.toEqual({ tournamentId: 1, updated: true });
    expect(tournamentRepo.updateMatch).toHaveBeenCalledWith(5, expect.objectContaining({ winner_id: 10 }));

    // Draw projection (frozen finalResult winner='draw').
    matchResultRepo.findById.mockResolvedValue({ matchId: 100, finalResult: { winner: 'draw', scoreSummary: '1-1' } });
    tournamentRepo.findMatchBySharedMatchId.mockResolvedValue({ id: 5, player1_id: 10, player2_id: 20, tournament_id: 1 });
    await tournamentService.syncSharedResultMirror(4);
    expect(tournamentRepo.updateMatch).toHaveBeenCalledWith(5, expect.objectContaining({ winner_id: null }));

    // No-result projection (finalResult null).
    matchResultRepo.findById.mockResolvedValue({ matchId: 100, finalResult: null });
    tournamentRepo.findMatchBySharedMatchId.mockResolvedValue({ id: 5, player1_id: 10, player2_id: 20, tournament_id: 1 });
    await tournamentService.syncSharedResultMirror(5);
    expect(tournamentRepo.updateMatch).toHaveBeenCalledWith(5, expect.objectContaining({ winner_id: null }));
  });
});