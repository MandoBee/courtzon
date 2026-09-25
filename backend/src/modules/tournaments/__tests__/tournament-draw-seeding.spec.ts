import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { ParticipantDrawService } from '../application/participant-draw.service.js';
import { MatchScheduleService } from '../application/match-schedule.service.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

/**
 * G8-B — seed consumption + preservation regression through the MODERN
 * locked-draw flow (the legacy TournamentService.generateBracket path was
 * removed — see tournament-legacy-routes-removed.spec.ts).
 *
 * The authoritative participant seed is stored in `tournament_registrations.seed`
 * and mapped onto `tournament_participants` by syncParticipants. This spec proves
 * the modern flow (generateDraw → approve → lock → generateMatchesFromLockedDraw):
 *   1. CONSUMES the persisted seed — draw placement honours seed order.
 *   2. NEVER overwrites a seed — a draw writes placements only.
 *   3. Generates matches only from a LOCKED draw (lifecycle gate preserved).
 *   4. Doubles/team locked-draw generation is untouched (roster-aware shared matches).
 */

const pdRepo = vi.hoisted(() => ({
  findParticipantByRegistration: vi.fn(),
  findParticipantById: vi.fn(),
  createParticipant: vi.fn(),
  listParticipantsByTournament: vi.fn(),
  countParticipantsByTournament: vi.fn(),
  createSeed: vi.fn(),
  findSeedByParticipant: vi.fn(),
  findSeedByNumber: vi.fn(),
  updateSeed: vi.fn(),
  clearCurrentDraws: vi.fn(),
  createDraw: vi.fn(),
  getNextDrawAttempt: vi.fn(),
  findCurrentDraw: vi.fn(),
  findDrawById: vi.fn(),
  updateDraw: vi.fn(),
  createDrawEntry: vi.fn(),
  findDrawEntries: vi.fn(),
}));

const pmRepo = vi.hoisted(() => ({
  addMember: vi.fn(),
  listMembersByTournament: vi.fn(),
  listMembersByParticipant: vi.fn(),
}));

const tRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  countMatches: vi.fn(),
  createMatch: vi.fn(),
}));

const tSvc = vi.hoisted(() => ({
  getByIdDetailed: vi.fn(),
  resolveMatchFormatContext: vi.fn(),
  advanceByes: vi.fn(),
  resolveEffectiveRegistrationPaymentMethods: vi.fn(async () => ['cash', 'card']),
}));

const matchSvc = vi.hoisted(() => ({ createForTournament: vi.fn() }));
const reservationSvc = vi.hoisted(() => ({ reserveCourt: vi.fn(), rescheduleCourt: vi.fn(), releaseCourt: vi.fn() }));
const crRepo = vi.hoisted(() => ({ findTournamentBooking: vi.fn() }));
const bookingRepo = vi.hoisted(() => ({ checkSlotAvailability: vi.fn(async () => true) }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const ratingRepo = vi.hoisted(() => ({ getRating: vi.fn() }));
const ratingSvc = vi.hoisted(() => ({ resolveOverallPercent: vi.fn() }));

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
vi.mock('../application/tournament.service.js', () => ({ tournamentService: tSvc }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchSvc }));
vi.mock('../../booking/application/court-reservation.service.js', () => ({ courtReservationService: reservationSvc }));
vi.mock('../../booking/infrastructure/repositories/court-reservation.repository.js', () => ({ courtReservationRepository: crRepo }));
vi.mock('../../booking/infrastructure/repositories/booking.repository.js', () => ({ bookingRepository: bookingRepo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => poolMock }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../match-result/infrastructure/rating.repository.js', () => ({ ratingRepository: ratingRepo }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: ratingSvc }));

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

function seededParticipant(id: number, playerId: number, seed: number | null) {
  return {
    id, tournament_id: 1, registration_id: id, participant_type: 'individual', status: 'active',
    member_user_ids: [playerId], player_id: playerId,
    seed_number: seed, seed_source: seed != null ? 'manual' : null,
  };
}

const pd = new ParticipantDrawService();
const ms = new MatchScheduleService();

const FORMAT_CTX = {
  formatId: 1, ruleSetId: 1,
  formatSnapshot: { formatId: 1, formatType: 'singles', playersPerSide: 1, name: 'Tennis Standard' },
  ruleSnapshot: { score_structure: 'sets' },
};

function baseline(matchServiceReturn = { id: 900 }) {
  tRepo.findById.mockResolvedValue(makeTournament({ id: 1 }));
  tRepo.findRegistrationsByTournament.mockResolvedValue([
    { id: 4, tournament_id: 1, player_id: 40, seed: 4, seed_rank: 4, status: 'confirmed' },
    { id: 2, tournament_id: 1, player_id: 20, seed: 2, seed_rank: 2, status: 'confirmed' },
    { id: 1, tournament_id: 1, player_id: 10, seed: 1, seed_rank: 1, status: 'confirmed' },
    { id: 3, tournament_id: 1, player_id: 30, seed: 3, seed_rank: 3, status: 'confirmed' },
  ]);
  tRepo.countMatches.mockResolvedValue(0);
  tRepo.createMatch.mockResolvedValue(100);
  tSvc.getByIdDetailed.mockResolvedValue(makeTournament({ id: 1 }));
  tSvc.resolveMatchFormatContext.mockResolvedValue(FORMAT_CTX);
  tSvc.advanceByes.mockResolvedValue({ advanced: 0 });
  pdRepo.findParticipantByRegistration.mockImplementation(async (tid: number, regId: number) => ({ id: regId, tournament_id: tid, registration_id: regId, participant_type: 'individual', status: 'active', member_user_ids: [regId * 10] }));
  pdRepo.createParticipant.mockResolvedValue(1);
  pdRepo.findSeedByParticipant.mockResolvedValue(null);
  pdRepo.createSeed.mockResolvedValue(1);
  pdRepo.findSeedByNumber.mockResolvedValue(null);
  pdRepo.countParticipantsByTournament.mockResolvedValue(4);
  pdRepo.findCurrentDraw.mockResolvedValue(null);
  pdRepo.getNextDrawAttempt.mockResolvedValue(1);
  pdRepo.clearCurrentDraws.mockResolvedValue(undefined);
  pdRepo.createDraw.mockResolvedValue(10);
  pdRepo.createDrawEntry.mockResolvedValue(1);
  pdRepo.findDrawById.mockResolvedValue({ id: 10, tournament_id: 1, attempt_number: 1, draw_seed: 42, status: 'draft', validation_status: 'valid', is_current: 1 });
  pdRepo.findParticipantById.mockImplementation(async (id: number) => seededParticipant(id, id * 10, id));
  matchSvc.createForTournament.mockResolvedValue(matchServiceReturn);
  poolConn.beginTransaction.mockImplementation(async () => undefined);
  poolConn.commit.mockImplementation(async () => undefined);
  poolConn.rollback.mockImplementation(async () => undefined);
  poolConn.release.mockImplementation(() => undefined);
  poolConn.query.mockImplementation(async () => [[]]);
}

beforeEach(() => {
  vi.clearAllMocks();
  baseline();
});

describe('G8-B — the modern locked-draw flow consumes and preserves the authoritative seed', () => {
  it('seed-ordered placement: generateDraw positions seeds 1..4 ascending', async () => {
    pdRepo.listParticipantsByTournament.mockResolvedValue([
      seededParticipant(4, 40, 4),
      seededParticipant(2, 20, 2),
      seededParticipant(1, 10, 1),
      seededParticipant(3, 30, 3),
    ]);
    await pd.generateDraw(1, 42, 123);

    const entries = pdRepo.createDrawEntry.mock.calls.map((c: any[]) => c[0]);
    const byParticipant = (pid: number) => entries.find((e: any) => e.participant_id === pid);
    // Seed #1 → position 0, seed #2 → 1, seed #3 → 2, seed #4 → 3 (regardless of input order).
    expect(byParticipant(1).position).toBe(0);
    expect(byParticipant(2).position).toBe(1);
    expect(byParticipant(3).position).toBe(2);
    expect(byParticipant(4).position).toBe(3);
  });

  it('deterministic: a different draw_seed keeps the SAME seed-ordered placement', async () => {
    pdRepo.listParticipantsByTournament.mockResolvedValue([
      seededParticipant(4, 40, 4),
      seededParticipant(2, 20, 2),
      seededParticipant(1, 10, 1),
      seededParticipant(3, 30, 3),
    ]);
    await pd.generateDraw(1, 42, 999);
    const posA = pdRepo.createDrawEntry.mock.calls.map((c: any[]) => c[0]).map((e: any) => e.position);

    vi.clearAllMocks();
    baseline();
    pdRepo.listParticipantsByTournament.mockResolvedValue([
      seededParticipant(4, 40, 4),
      seededParticipant(2, 20, 2),
      seededParticipant(1, 10, 1),
      seededParticipant(3, 30, 3),
    ]);
    pdRepo.findDrawById.mockResolvedValue({ id: 10, tournament_id: 1, attempt_number: 1, draw_seed: 1000000, status: 'draft', validation_status: 'valid', is_current: 1 });
    await pd.generateDraw(1, 42, 1000000);
    const posB = pdRepo.createDrawEntry.mock.calls.map((c: any[]) => c[0]).map((e: any) => e.position);

    expect(posB).toEqual(posA);
  });

  it('a draw NEVER rewrites a seed — placement only', async () => {
    pdRepo.listParticipantsByTournament.mockResolvedValue([
      seededParticipant(4, 40, 4),
      seededParticipant(2, 20, 2),
      seededParticipant(1, 10, 1),
      seededParticipant(3, 30, 3),
    ]);
    await pd.generateDraw(1, 42, 123);
    expect(pdRepo.createSeed).not.toHaveBeenCalled();
    expect(pdRepo.updateSeed).not.toHaveBeenCalled();
    expect(pdRepo.createDrawEntry).toHaveBeenCalledTimes(4);
  });

  it('generation requires the draw to be LOCKED (lifecycle gate preserved)', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue({ id: 10, tournament_id: 1, attempt_number: 1, draw_seed: 42, status: 'draft', validation_status: 'valid', is_current: 1 });
    await expect(ms.generateMatchesFromLockedDraw(1, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_DRAW_NOT_LOCKED });
    expect(matchSvc.createForTournament).not.toHaveBeenCalled();
  });

  it('locked-draw generation is roster-aware for doubles/team participants', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue({ id: 10, tournament_id: 1, attempt_number: 1, draw_seed: 42, status: 'locked', validation_status: 'valid', is_current: 1 });
    pdRepo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1 },
    ]);
    pdRepo.findParticipantById.mockImplementation(async (id: number) =>
      id === 1 ? { id: 1, tournament_id: 1, registration_id: 1, participant_type: 'pair', status: 'active', member_user_ids: [11, 12] }
        : { id: 2, tournament_id: 1, registration_id: 2, participant_type: 'pair', status: 'active', member_user_ids: [21, 22] },
    );

    await ms.generateMatchesFromLockedDraw(1, 1);

    const call = matchSvc.createForTournament.mock.calls[0][0];
    expect(call.participants).toEqual([
      { userId: 11, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 12, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 21, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 22, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });
});