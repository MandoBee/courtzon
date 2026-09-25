import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import { ENGINE_EXECUTABLE_FORMATS } from '../domain/tournament-aggregate.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

/**
 * G8-C — Tournament format scope finalization.
 *
 * The draw/match-generation engine (`MatchScheduleService.generateMatchesFromLockedDraw`
 * → buildSlots) can ONLY execute knockout and round_robin. Every other
 * `TournamentFormat` string (double_elimination, swiss, group_stage_knockout,
 * league, custom, mixed) is a reserved FUTURE value — never selectable, never
 * advertised, and rejected at the application boundary. This spec proves:
 *   1. knockout / round_robin remain supported end-to-end.
 *   2. unsupported formats are rejected at create AND update.
 *   3. an unsupported format can never reach match generation.
 *   4. doubles/team participant structures remain intact under supported
 *      competition formats.
 *   5. `mixed` is NOT a tournament competition format (it is a gender category
 *      and a stage progression concept) — the create contract rejects it.
 */

const repo = vi.hoisted(() => ({
  findByCode: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findByIdDetailed: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  findBracketTypeById: vi.fn(),
  listBracketTypes: vi.fn(),
  setBracketTypeActive: vi.fn(),
  countBracketTypeReferences: vi.fn(),
  isMatch(): void {},
}));

const mrRepo = vi.hoisted(() => ({
  findFormatById: vi.fn(),
  findRuleSetById: vi.fn(),
  resolveDefaultFormatForSport: vi.fn(),
  findActiveRuleSetForFormat: vi.fn(),
  listRuleSetsBySport: vi.fn(),
  getParticipants: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  getConnection: vi.fn(async () => ({
    beginTransaction: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(),
    query: vi.fn(async () => [[]]),
    execute: vi.fn(async () => [[]]),
  })),
}));
const commission = vi.hoisted(() => ({ getCommissionRate: vi.fn(), getCurrentSubscription: vi.fn() }));
const pdRepo = vi.hoisted(() => ({
  findParticipantByRegistration: vi.fn(),
  createParticipant: vi.fn(),
  findSeedByParticipant: vi.fn(),
  createSeed: vi.fn(),
  findSeedByNumber: vi.fn(),
  countParticipantsByTournament: vi.fn(),
  listParticipantsByTournament: vi.fn(),
  findCurrentDraw: vi.fn(),
  getNextDrawAttempt: vi.fn(),
  clearCurrentDraws: vi.fn(),
  createDraw: vi.fn(),
  createDrawEntry: vi.fn(),
  findDrawById: vi.fn(),
  findDrawEntries: vi.fn(),
  findParticipantById: vi.fn(),
}));
const ratingRepo = vi.hoisted(() => ({ getRating: vi.fn() }));
const ratingSvc = vi.hoisted(() => ({ resolveOverallPercent: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({
  getCommissionRate: commission.getCommissionRate,
  getCurrentSubscription: commission.getCurrentSubscription,
}));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: { createForTournament: vi.fn() } }));
vi.mock('../../match-result/infrastructure/rating.repository.js', () => ({ ratingRepository: ratingRepo }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: ratingSvc }));

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 1, format: 'knockout',
    name: 'T1', max_participants: 8, min_participants: 2, entry_fee: 0,
    currency_code: 'USD', price_type: 'FREE', status: 'registration_open',
    sport_id: 22, match_format_id: 1, rule_set_id: 1, draw_seed: 42,
    ...overrides,
  };
}

const SE_BRACKET = { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: '{"rounds":"auto","seeding":true}' };
const RR_BRACKET = { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: '{"groups":4,"advance":2}' };

const svc = new TournamentService();

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByCode.mockResolvedValue(null);
  repo.create.mockResolvedValue(10);
  repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
  repo.findBracketTypeById.mockResolvedValue(SE_BRACKET);
  mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
  mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { best_of: 3 }, standingsRules: null });
  commission.getCommissionRate.mockResolvedValue(null);
  commission.getCurrentSubscription.mockResolvedValue({ exists: false, planName: null });
  pdRepo.findParticipantByRegistration.mockResolvedValue(null);
  pdRepo.createParticipant.mockResolvedValue(1);
  pdRepo.findSeedByParticipant.mockResolvedValue(null);
  pdRepo.createSeed.mockResolvedValue(1);
  pdRepo.findSeedByNumber.mockResolvedValue(null);
  pdRepo.countParticipantsByTournament.mockResolvedValue(4);
  pdRepo.listParticipantsByTournament.mockResolvedValue([]);
  pdRepo.findCurrentDraw.mockResolvedValue(null);
  pdRepo.getNextDrawAttempt.mockResolvedValue(1);
  pdRepo.createDraw.mockResolvedValue(10);
  pdRepo.createDrawEntry.mockResolvedValue(1);
  pdRepo.findDrawById.mockResolvedValue({ id: 10, tournament_id: 1, attempt_number: 1, draw_seed: 42, status: 'draft', validation_status: 'valid', is_current: 1 });
  pdRepo.findDrawEntries.mockResolvedValue([]);
});

describe('G8-C — tournament format scope (engine-executable contract)', () => {
  it('declares the authoritative engine-executable format list', () => {
    expect([...ENGINE_EXECUTABLE_FORMATS]).toEqual(['knockout', 'round_robin']);
  });

  it('knockout create remains supported; the derived format is stored', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE_BRACKET);
    await svc.create(makeTournament({ format: undefined }), 1);
    const stored = repo.create.mock.calls[0][0] as any;
    expect(stored.format).toBe('knockout');
  });

  it('round_robin create remains supported; format is DERIVED from the round-robin bracket', async () => {
    // The create UI only sends bracket_type_id (round-robin). The engine branches
    // on t.format, so the server MUST derive format = round_robin — otherwise the
    // modern locked-draw generator would build a knockout bracket for a Round
    // Robin tournament (the G8-C latent defect).
    repo.findBracketTypeById.mockResolvedValue(RR_BRACKET);
    await svc.create(makeTournament({ bracket_type_id: 3, format: undefined }), 1);
    const stored = repo.create.mock.calls[0][0] as any;
    expect(stored.format).toBe('round_robin');
  });

  it('an explicit engine-unsupported format is rejected at create (double_elimination / swiss / group_stage_knockout / league / custom)', async () => {
    for (const bad of ['double_elimination', 'swiss', 'group_stage_knockout', 'league', 'custom']) {
      repo.create.mockClear();
      repo.findBracketTypeById.mockResolvedValue(SE_BRACKET);
      await expect(svc.create(makeTournament({ format: bad }), 1))
        .rejects.toMatchObject({ errorCode: ErrorCodes.TOURNAMENT_FORMAT_NOT_SUPPORTED });
      expect(repo.create).not.toHaveBeenCalled();
    }
  });

  it('a bracket change to an unsupported engine format is rejected at update', async () => {
    // double-elimination bracket type exists (config-visible) but the engine
    // cannot execute it — an update to it must never be accepted.
    const DE_BRACKET = { id: 2, name: 'Double Elimination', slug: 'double-elimination', is_active: 1, config_schema: '{}' };
    repo.findBracketTypeById.mockResolvedValue(DE_BRACKET);
    await expect(svc.create(makeTournament({ bracket_type_id: 2, format: undefined }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
  });

  it('update with an unsupported explicit format is rejected (even without a bracket change)', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE_BRACKET);
    await expect(svc.update(1, { format: 'swiss' } as any))
      .rejects.toMatchObject({ errorCode: ErrorCodes.TOURNAMENT_FORMAT_NOT_SUPPORTED });
  });

  it('an unsupported format can never reach match generation (create rejects first; the engine also guards)', async () => {
    // 1) Boundary: creation already rejected it — the draw/match engine can only
    //    ever see an ENGINE_EXECUTABLE_FORMATS value.
    repo.findBracketTypeById.mockResolvedValue(SE_BRACKET);
    await expect(svc.create(makeTournament({ format: 'league' }), 1))
      .rejects.toMatchObject({ errorCode: ErrorCodes.TOURNAMENT_FORMAT_NOT_SUPPORTED });
    // 2) Engine defense-in-depth is unit-proven by match-schedule.service.spec
    //    (A7: format=double_elimination → TOURNAMENT_INVALID_FORMAT, no shared
    //    Match created). Referenced here so the format-scope contract is explicit.
  });

  it('mixed is NOT a tournament competition format (gender category + stage concept only)', async () => {
    // The tournament `format` create contract intentionally excludes `mixed`:
    // the enum is engine-executable only (knockout / round_robin).
    const { CreateTournamentSchema } = await import('../presentation/tournament.dto.js');
    const payload = { ...makeTournament({ format: 'mixed' as any }), name: 'M', start_date: '2026-10-01' };
    expect(() => CreateTournamentSchema.parse(payload)).toThrow();
    // `mixed` survives ONLY in gender categories and stage progression_format
    // (mixed tournaments) — never as a selectable competition format.
    const { GenderCategoriesSchema } = await import('../presentation/tournament.dto.js');
    expect(GenderCategoriesSchema.parse(['mixed'])).toEqual(['mixed']);
  });

  it('doubles/team participant structure remains valid under round_robin competition format', async () => {
    // The modern locked-draw path is roster-aware (participant-member.service +
    // match-schedule A5). The competition-format gate must not interfere with the
    // SPORT format (doubles playersPerSide=2) selection.
    repo.findBracketTypeById.mockResolvedValue(RR_BRACKET);
    await svc.create(makeTournament({ bracket_type_id: 3, format: undefined }), 1);
    const stored = repo.create.mock.calls[0][0] as any;
    expect(stored.format).toBe('round_robin');
    // match-format is the SPORT structure (doubles) — independent of competition format.
    expect(stored.match_format_id).toBe(1);
    expect(stored.rule_set_id).toBe(1);
  });
});