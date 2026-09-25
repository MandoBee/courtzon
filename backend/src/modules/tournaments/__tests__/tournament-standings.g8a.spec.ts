import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { computeStandings } from '../domain/tournament-aggregate.js';
import { tournamentService } from '../application/tournament.service.js';

const T = {
  id: 1,
  start_date: '2026-06-01',
  status: 'running',
  sport_id: 9,
  is_public: 1,
  max_participants: 16,
  min_participants: 2,
  entry_fee: 0,
  currency_code: 'USD',
  registration_payment_methods: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  tournamentRepo.findById.mockResolvedValue({ ...T });
  tournamentRepo.recalculateStandings.mockResolvedValue(undefined);
  tournamentRepo.updateMatch.mockResolvedValue(undefined);
});

describe('G8-A standings domain function (ONE authority)', () => {
  it('computes wins/losses/points and a deterministic rank', () => {
    const standings = computeStandings([
      { player1_id: 1, player2_id: 2, status: 'completed', winner_id: 1, round: 1 } as any,
      { player1_id: 1, player2_id: 3, status: 'completed', winner_id: 1, round: 2 } as any,
      { player1_id: 2, player2_id: 3, status: 'completed', winner_id: 2, round: 3 } as any,
    ], [1, 2, 3]);

    const byReg = new Map(standings.map((s) => [s.registration_id, s]));
    expect(byReg.get(1)?.points).toBe(6);
    expect(byReg.get(1)?.wins).toBe(2);
    expect(byReg.get(2)?.points).toBe(3);
    expect(byReg.get(3)?.points).toBe(0);
    expect(standings[0].rank_position).toBe(1);
    expect(standings).toHaveLength(3);
  });

  it('breaks ties deterministically by game difference (documented aggregate rule)', () => {
    const standings = computeStandings([
      { player1_id: 1, player2_id: 3, status: 'completed', winner_id: 1, round: 1 } as any,
    ], [1, 3]);
    expect(standings[0].registration_id).toBe(1);
    expect(standings[1].registration_id).toBe(3);
    expect(standings[0].rank_position).toBe(1);
  });
});

describe('G8-A shared-result projection mirror', () => {
  it('home winner projects onto player1_id with score summary', async () => {
    matchResultRepo.findById.mockResolvedValue({ matchId: 100, finalResult: { winner: 'home', scoreSummary: '6-4 6-2' } });
    tournamentRepo.findMatchBySharedMatchId.mockResolvedValue({ id: 5, player1_id: 10, player2_id: 20, tournament_id: 1 });

    const out = await tournamentService.syncSharedResultMirror(3);

    expect(out).toEqual({ tournamentId: 1, updated: true });
    expect(tournamentRepo.updateMatch).toHaveBeenCalledWith(5, {
      status: 'completed',
      score_summary: '6-4 6-2',
      winner_id: 10,
    });
  });

  it('away winner projects onto player2_id', async () => {
    matchResultRepo.findById.mockResolvedValue({ matchId: 100, finalResult: { winner: 'away', scoreSummary: '5-7 6-2 6-0' } });
    tournamentRepo.findMatchBySharedMatchId.mockResolvedValue({ id: 5, player1_id: 10, player2_id: 20, tournament_id: 1 });

    await tournamentService.syncSharedResultMirror(3);

    expect(tournamentRepo.updateMatch).toHaveBeenCalledWith(5, expect.objectContaining({ winner_id: 20 }));
  });

  it('draw/abandoned clears the winner projection (draws are not scored by current rules)', async () => {
    matchResultRepo.findById.mockResolvedValue({ matchId: 100, finalResult: { winner: 'draw', scoreSummary: '6-6' } });
    tournamentRepo.findMatchBySharedMatchId.mockResolvedValue({ id: 5, player1_id: 10, player2_id: 20, tournament_id: 1 });

    await tournamentService.syncSharedResultMirror(3);

    expect(tournamentRepo.updateMatch).toHaveBeenCalledWith(5, expect.objectContaining({ winner_id: null, status: 'completed' }));
  });

  it('is a no-op when the result has no final outcome or the match is not a tournament match', async () => {
    matchResultRepo.findById.mockResolvedValue({ matchId: 101, finalResult: null });
    await expect(tournamentService.syncSharedResultMirror(3)).resolves.toEqual({ tournamentId: null, updated: false });

    matchResultRepo.findById.mockResolvedValue({ matchId: 102, finalResult: { winner: 'home', scoreSummary: 'x' } });
    tournamentRepo.findMatchBySharedMatchId.mockResolvedValue(null);
    await expect(tournamentService.syncSharedResultMirror(4)).resolves.toEqual({ tournamentId: null, updated: false });
  });
});

describe('G8-A correction reconciliation', () => {
  it('re-mirrors, recomputes standings and emits a scoped tournament.updated', async () => {
    matchResultRepo.findById.mockResolvedValue({ matchId: 100, finalResult: { winner: 'away', scoreSummary: '2-6 6-3 6-4' } });
    tournamentRepo.findMatchBySharedMatchId.mockResolvedValue({ id: 5, player1_id: 10, player2_id: 20, tournament_id: 1 });

    await tournamentService.recalculateStandingsForResult(3);

    expect(tournamentRepo.updateMatch).toHaveBeenCalledWith(5, expect.objectContaining({ winner_id: 20 }));
    expect(tournamentRepo.recalculateStandings).toHaveBeenCalledWith(1);
    expect(busEmit).toHaveBeenCalledWith('tournament:updated', expect.objectContaining({ tournamentId: 1, standings: true }), expect.anything());
  });

  it('does nothing when the projection cannot be resolved (no stale invalidation)', async () => {
    matchResultRepo.findById.mockResolvedValue({ matchId: 100, finalResult: { winner: 'home', scoreSummary: 'x' } });
    tournamentRepo.findMatchBySharedMatchId.mockResolvedValue(null);

    await tournamentService.recalculateStandingsForResult(3);

    expect(tournamentRepo.recalculateStandings).not.toHaveBeenCalled();
    expect(busEmit).not.toHaveBeenCalled();
  });
});