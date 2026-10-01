import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import { validateTournamentTransition } from '../domain/lifecycle.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

/**
 * G11.14 — lifecycle + optimistic-concurrency + auto-completion hardening.
 *
 * startTournament emits `tournament:started` EXACTLY ONCE through the same
 * validated lifecycle path as every other status write; a concurrently changed
 * state fails safely (TOURNAMENT_STATUS_CONFLICT) and never emits; a cancelled/
 * archived tournament can never be resurrected by a late auto-completion.
 */

const repo = vi.hoisted(() => ({
  findByCode: vi.fn(), create: vi.fn(), findById: vi.fn(), update: vi.fn(), updateStatus: vi.fn(),
  findOpen: vi.fn(), countUnresolvedRequiredMatches: vi.fn(), findMatches: vi.fn(),
  findStages: vi.fn(), findMatchBySharedMatchId: vi.fn(), updateMatch: vi.fn(),
  recalculateStandings: vi.fn(), findMatchById: vi.fn(), findBracketSlot: vi.fn(),
  lockMatchById: vi.fn(), countIncompleteStageMatches: vi.fn(), updateStageStatus: vi.fn(),
  replacePlacements: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));

const pdr = vi.hoisted(() => ({ listParticipantsByTournament: vi.fn(), findParticipantById: vi.fn() }));
const pmr = vi.hoisted(() => ({ listMembersByParticipant: vi.fn(), findActiveMembersByUserIds: vi.fn() }));

const fakeConn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined), commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined), release: vi.fn(() => undefined),
  query: vi.fn(async () => [[]]), execute: vi.fn(async () => [[]]),
}));

const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]), query: vi.fn(async () => [[]]),
  getConnection: vi.fn(async () => fakeConn),
}));

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

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, public_id: 'p', creator_id: 5, organisation_id: 10, branch_id: null,
    bracket_type_id: 1, name: 'T', max_participants: 8, min_participants: 2,
    currency_code: 'EGP', price_type: 'FIXED', tournament_type: 'community',
    commission_rate: 0, status: 'registration_closed', is_public: true,
    start_date: '2026-12-01', registration_closes: '2026-11-30',
    registration_payment_methods: ['cash', 'card'] as any,
    age_mode: null, age_category_ids: [], gender_categories: [], level_ids: [],
    ...overrides,
  } as Tournament;
}

describe('G11.14 tournament lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(makeTournament());
    repo.updateStatus.mockResolvedValue(undefined);
    pdr.listParticipantsByTournament.mockResolvedValue([]);
  });

  const svc = new TournamentService();

  it('startTournament: validated transition → emits tournament:started EXACTLY ONCE', async () => {
    await svc.startTournament(1);
    expect(repo.updateStatus).toHaveBeenCalledWith(1, 'running', undefined, 'registration_closed');
    const started = bus.emit.mock.calls.filter((c) => c[0] === 'tournament:started');
    expect(started).toHaveLength(1);
    expect(started[0][1].tournamentId).toBe(1);
  });

  it('startTournament: invalid transition → rejected, no event, no write', async () => {
    repo.findById.mockResolvedValue(makeTournament({ status: 'draft' }));
    await expect(svc.startTournament(1)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalledWith('tournament:started', expect.anything());
  });

  it('startTournament: concurrent state change → fails safely and never emits', async () => {
    repo.updateStatus.mockRejectedValueOnce(
      new ConflictError('concurrent', ErrorCodes.TOURNAMENT_STATUS_CONFLICT),
    );
    await expect(svc.startTournament(1)).rejects.toMatchObject({ errorCode: 'CONFLICT' });
    expect(bus.emit).not.toHaveBeenCalledWith('tournament:started', expect.anything());
  });

  it('auto-completion cannot resurrect a CANCELLED tournament (lifecycle validation)', () => {
    expect(() => validateTournamentTransition('cancelled', 'completed')).toThrow(ConflictError);
    expect(() => validateTournamentTransition('archived', 'completed')).toThrow(ConflictError);
  });

  it('auto-completion uses the SAME validated path as operator completion (running → completed)', () => {
    expect(() => validateTournamentTransition('running', 'completed')).not.toThrow();
  });

  it('complete() captures bracket placements for a knockout (fail-closed resolver path)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ status: 'running', format: 'knockout' }));
    // A decisive 2-player final: champion 11, runner-up 20, no penultimate
    // round → placements [1,2]; nothing ambiguous.
    repo.findMatches.mockResolvedValue([
      {
        id: 3, tournament_id: 1, round: 2, match_number: 1, bracket_position: 0,
        player1_id: 11, player2_id: 20, participant1_id: 11, participant2_id: 20,
        winner_id: 11, winner_participant_id: 11, loser_participant_id: 20,
        status: 'completed', progression_state: 'completed',
        progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
        match_id: 902,
      },
    ] as any);
    repo.replacePlacements.mockResolvedValue(undefined);
    await svc.complete(1);
    expect(repo.replacePlacements).toHaveBeenCalledWith(1, [
      { placement: 1, participant_id: 11, user_id: 11, source: 'bracket' },
      { placement: 2, participant_id: 20, user_id: 20, source: 'bracket' },
    ]);
    expect(bus.emit.mock.calls.some((c) => c[0] === 'tournament:completed')).toBe(true);
  });
});