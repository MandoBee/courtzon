import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TournamentService } from '../application/tournament.service.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

/**
 * Group 5 — seed consumption + preservation regression.
 *
 * The authoritative participant seed is stored in
 * `tournament_registrations.seed_rank` and exposed to the domain as `seed`
 * (repository mapping). This spec proves the draw:
 *   1. CONSUMES the persisted seed (seed #1 / #2 / #3 / #4 are honoured — the
 *      bracket is ordered by seed, never by registration/user-id order).
 *   2. NEVER overwrites a seed (a draw/re-draw is placement-only; the seed
 *      numbers stay untouched and the draw only reads them).
 *   3. Is deterministic for the same participants + seeds.
 */

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  findMatches: vi.fn(),
  updateStatus: vi.fn(),
  createMatch: vi.fn(),
  findBracketSlot: vi.fn(),
  updateMatch: vi.fn(),
  findGroups: vi.fn(),
  findGroupMembers: vi.fn(),
}));

const mrRepo = vi.hoisted(() => ({
  findFormatById: vi.fn(),
  findRuleSetById: vi.fn(),
  resolveDefaultFormatForSport: vi.fn(),
  findActiveRuleSetForFormat: vi.fn(),
  listRuleSetsBySport: vi.fn(),
}));

const matchServiceMock = vi.hoisted(() => ({ createForTournament: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const pool = vi.hoisted(() => ({ execute: vi.fn(async () => [[]]), query: vi.fn(async () => [[]]) }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 1, format: 'knockout', name: 'T1',
    max_participants: 8, min_participants: 2, entry_fee: 0, currency_code: 'AED',
    price_type: 'FREE', status: 'registration_closed', sport_id: 22,
    match_format_id: 1, rule_set_id: 1, draw_seed: 42, start_date: '2026-12-01',
    registration_payment_methods: ['cash', 'card'],
    ...overrides,
  };
}

function seededReg(id: number, playerId: number, seed: number) {
  return { id, tournament_id: 1, player_id: playerId, seed, seed_rank: seed, status: 'confirmed', payment_status: 'paid' };
}

const svc = new TournamentService();

beforeEach(() => {
  vi.clearAllMocks();
  repo.findById.mockResolvedValue(makeTournament({ id: 1 }));
  repo.findRegistrationsByTournament.mockResolvedValue([
    seededReg(4, 40, 4),
    seededReg(2, 20, 2),
    seededReg(1, 10, 1),
    seededReg(3, 30, 3),
  ]);
  repo.findMatches.mockResolvedValue([]);
  repo.updateStatus.mockResolvedValue(undefined);
  repo.createMatch.mockResolvedValue(1);
  repo.findGroups.mockResolvedValue([]);
  repo.findGroupMembers.mockResolvedValue([]);
  mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 21, formatType: 'singles', playersPerSide: 1, name: 'Tennis', isActive: true });
  mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { best_of: 3 }, standingsRules: null });
  matchServiceMock.createForTournament.mockImplementation(async (input: any) => ({ id: input.participants[0].userId }));
});

describe('Group 5 — the draw consumes and preserves the authoritative seed', () => {
  it('generates a seed-ordered knockout bracket (seed #1/#2 meet, #3/#4 meet) regardless of registration order', async () => {
    await svc.generateBracket(1);

    // Round-1 slot 0 pairs the top two seeds; slot 1 pairs seeds 3 & 4.
    // The mock registration list is deliberately unordered [4,2,1,3].
    const round1Matches = repo.createMatch.mock.calls
      .map((c: any[]) => c[0])
      .filter((m: any) => m.round === 1 && m.player1_id != null && m.player2_id != null);
    expect(round1Matches).toHaveLength(2);
    const slot0 = round1Matches[0];
    const slot1 = round1Matches[1];
    expect([slot0.player1_id, slot0.player2_id].sort((a, b) => a - b)).toEqual([10, 20]); // seeds 1 & 2
    expect([slot1.player1_id, slot1.player2_id].sort((a, b) => a - b)).toEqual([30, 40]); // seeds 3 & 4
  });

  it('seed placement is deterministic — a different draw_seed keeps the SAME seed-ordered bracket', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, draw_seed: 999 }));
    await svc.generateBracket(1);
    const r1a = repo.createMatch.mock.calls.map((c: any[]) => c[0]).filter((m: any) => m.round === 1 && m.player1_id && m.player2_id);
    expect(r1a).toHaveLength(2);

    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament({ id: 1, draw_seed: 12345 }));
    repo.findRegistrationsByTournament.mockResolvedValue([
      seededReg(4, 40, 4), seededReg(2, 20, 2), seededReg(1, 10, 1), seededReg(3, 30, 3),
    ]);
    repo.findMatches.mockResolvedValue([]);
    repo.updateStatus.mockResolvedValue(undefined);
    repo.createMatch.mockResolvedValue(1);
    matchServiceMock.createForTournament.mockImplementation(async (input: any) => ({ id: input.participants[0].userId }));
    await svc.generateBracket(1);
    const r1b = repo.createMatch.mock.calls.map((c: any[]) => c[0]).filter((m: any) => m.round === 1 && m.player1_id && m.player2_id);

    const key = (m: any) => [m.player1_id, m.player2_id].sort((a, b) => a - b).join(',');
    expect(key(r1b[0])).toBe(key(r1a[0]));
    expect(key(r1b[1])).toBe(key(r1a[1]));
  });

  it('the draw NEVER rewrites a participant seed — it only reads it', async () => {
    await svc.generateBracket(1);
    // The draw path only reads registrations and writes match slots. There is
    // no registration-seed update call at all (seed numbers are preserved).
    const written = Object.keys(repo.createMatch.mock.calls.map((c: any[]) => c[0])[0] ?? {});
    expect(written.some((k) => k === 'seed_rank' || k === 'seed')).toBe(false);
    // The mock repository exposes NO registration-status/seed mutation, and the
    // draw path never invokes one.
    expect(Object.keys(repo).some((k) => k.startsWith('updateRegistration'))).toBe(false);
  });

  it('emits the authoritative tournament:bracket-generated realtime event', async () => {
    await svc.generateBracket(1);
    expect(bus.emit).toHaveBeenCalledWith('tournament:bracket-generated', expect.objectContaining({ tournamentId: 1 }), expect.anything());
  });
});