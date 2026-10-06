import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import { CreateTournamentSchema } from '../presentation/tournament.dto.js';
import { ENGINE_EXECUTABLE_FORMATS } from '../domain/tournament-aggregate.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

const gskConfig = {
  format: 'group_stage_knockout',
  groupStage: { groupCount: 8, participantsPerGroup: 4, format: 'round_robin', qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } },
  knockout: { startingRound: 'round_of_16', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false },
};

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 1, format: 'knockout', name: 'T1',
    max_participants: 32, min_participants: 2, entry_fee: 0, currency_code: 'USD',
    price_type: 'FREE', status: 'draft', sport_id: 22, match_format_id: 1, rule_set_id: 1,
    draw_seed: 42, organisation_id: 1001, ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO contract
// ─────────────────────────────────────────────────────────────────────────────
describe('CreateTournamentSchema — GSK creation contract (Step 3B-5A)', () => {
  const base = { ...makeTournament({ format: undefined }), name: 'GSK Cup', start_date: '2026-10-01', format: 'group_stage_knockout', gsk_config: gskConfig };

  it('accepts a valid GSK tournament (format + gsk_config)', () => {
    expect(() => CreateTournamentSchema.parse(base)).not.toThrow();
  });

  it('rejects invalid groupCount (< 1)', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, groupStage: { ...gskConfig.groupStage, groupCount: 0 } } })).toThrow();
  });

  it('rejects invalid participantsPerGroup (< 2)', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, groupStage: { ...gskConfig.groupStage, participantsPerGroup: 1 } } })).toThrow();
  });

  it('rejects invalid topPerGroup (< 1)', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, groupStage: { ...gskConfig.groupStage, qualification: { ...gskConfig.groupStage.qualification, topPerGroup: 0 } } } })).toThrow();
  });

  it('rejects topPerGroup > participantsPerGroup', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, groupStage: { ...gskConfig.groupStage, qualification: { ...gskConfig.groupStage.qualification, topPerGroup: 5 } } } })).toThrow();
  });

  it('rejects invalid bestThirdPlaces (< 0)', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, groupStage: { ...gskConfig.groupStage, qualification: { ...gskConfig.groupStage.qualification, bestThirdPlaces: -1 } } } })).toThrow();
  });

  it('rejects bestThirdPlaces > groupCount', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, groupStage: { ...gskConfig.groupStage, qualification: { ...gskConfig.groupStage.qualification, bestThirdPlaces: 9 } } } })).toThrow();
  });

  it('rejects invalid ordering', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, groupStage: { ...gskConfig.groupStage, qualification: { ...gskConfig.groupStage.qualification, ordering: 'random' } } } })).toThrow();
  });

  it('rejects an invalid knockout startingRound', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, knockout: { ...gskConfig.knockout, startingRound: 'grand_final_x' } } })).toThrow();
  });

  it('rejects an invalid seeding value', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, knockout: { ...gskConfig.knockout, seeding: 'random' } } })).toThrow();
  });

  it('rejects a negative playInRounds', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: { ...gskConfig, knockout: { ...gskConfig.knockout, playInRounds: -1 } } })).toThrow();
  });

  it('rejects gsk_config for knockout / round_robin and missing gsk_config for GSK', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, format: 'knockout', gsk_config: gskConfig })).toThrow();
    expect(() => CreateTournamentSchema.parse({ ...base, gsk_config: undefined })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Service contract (mocked persistence)
// ─────────────────────────────────────────────────────────────────────────────
const repo = vi.hoisted(() => ({
  findByCode: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findBracketTypeById: vi.fn(),
  createStage: vi.fn(),
  createGroup: vi.fn(),
  createMatch: vi.fn(),
  update: vi.fn(async () => undefined),
  findPrizesByTournament: vi.fn(async () => []),
  findSponsorsByTournament: vi.fn(async () => []),
}));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));

const mrRepo = vi.hoisted(() => ({ findFormatById: vi.fn(), findRuleSetById: vi.fn(), resolveDefaultFormatForSport: vi.fn(), findActiveRuleSetForFormat: vi.fn() }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));

vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: vi.fn() } }));
const pool = vi.hoisted(() => ({ query: vi.fn(async () => [[]]), execute: vi.fn(async () => [[]]), getConnection: vi.fn(async () => ({ query: vi.fn(async () => [[]]), execute: vi.fn(async () => [[]]), release: vi.fn() })) }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({ getCommissionRate: vi.fn(async () => null), getCurrentSubscription: vi.fn(async () => ({ exists: false, planName: null })) }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: { createForTournament: vi.fn() } }));
vi.mock('../../match-result/infrastructure/rating.repository.js', () => ({ ratingRepository: { getRating: vi.fn() } }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: { resolveOverallPercent: vi.fn() } }));
const pdRepo = vi.hoisted(() => ({
  findParticipantByRegistration: vi.fn(async () => null), createParticipant: vi.fn(async () => 1),
  findSeedByParticipant: vi.fn(async () => null), createSeed: vi.fn(async () => 1),
  findSeedByNumber: vi.fn(async () => null), countParticipantsByTournament: vi.fn(async () => 4),
  listParticipantsByTournament: vi.fn(async () => []), findCurrentDraw: vi.fn(async () => null),
  getNextDrawAttempt: vi.fn(async () => 1), createDraw: vi.fn(async () => 10),
  createDrawEntry: vi.fn(async () => 1), findDrawById: vi.fn(), findDrawEntries: vi.fn(async () => []),
}));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));

const compSvc = vi.hoisted(() => ({ resolveRegistrationCompetition: vi.fn(async () => ({ id: 1 })) }));
vi.mock('../application/competition.service.js', () => ({ competitionService: compSvc }));

const svc = new TournamentService();

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByCode.mockResolvedValue(null);
  repo.create.mockResolvedValue(10);
  repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
  repo.findBracketTypeById.mockResolvedValue({ id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null });
  repo.createStage.mockImplementation(async (data: any) => { repo.staged = data; return 500; });
  mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
  mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { best_of: 3 }, standingsRules: null });
});

describe('TournamentService.create — GSK lifecycle & engine boundary (Step 3B-5A)', () => {
  it('creates a GSK tournament WITHOUT claiming groups/matches exist', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, format: 'group_stage_knockout', status: 'draft' }));
    const created = await svc.create({ ...(makeTournament as any)({ format: 'group_stage_knockout', status: 'draft' }), gsk_config: gskConfig }, 1);
    const stored = repo.create.mock.calls[0][0] as any;
    // format persisted as GSK (no bracked-derived overwrite for GSK)
    expect(stored.format).toBe('group_stage_knockout');
    // the default competition + Group Stage skeleton (stage 1) is created
    expect(repo.createStage).toHaveBeenCalledTimes(1);
    const stage = repo.staged;
    expect(stage.stage_order).toBe(1);
    expect(stage.progression_format).toBe('round_robin');
    expect(stage.advance_count).toBe(2);
    expect(stage.status).toBe('pending');
    expect(stage.config).toEqual(gskConfig);
    // NO groups, NO matches, NO knockout stage at creation
    expect(repo.createGroup).not.toHaveBeenCalled();
    expect(repo.createMatch).not.toHaveBeenCalled();
    // response conveys lifecycle + pending preparation
    expect((created as any).format).toBe('group_stage_knockout');
    expect((created as any).gsk_config).toEqual(gskConfig);
    expect((created as any).competition_prepared).toBe(false);
  });

  it('rejects GSK without a gsk_config at the service boundary', async () => {
    await expect(svc.create({ ...(makeTournament as any)({ format: 'group_stage_knockout' }), gsk_config: undefined }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects GSK with a non-single-elimination bracket substrate', async () => {
    repo.findBracketTypeById.mockResolvedValue({ id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null });
    await expect(svc.create({ ...(makeTournament as any)({ format: 'group_stage_knockout', bracket_type_id: 3 }), gsk_config: gskConfig }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('knockout / round_robin creation behavior is unchanged (derived format, no stage side effects)', async () => {
    delete (repo as any).staged;
    await svc.create(makeTournament({ format: undefined }), 1);
    expect((repo.create.mock.calls[0][0] as any).format).toBe('knockout');
    expect(repo.createStage).not.toHaveBeenCalled();
  });
});

describe('Engine boundary — GSK still not in ENGINE_EXECUTABLE_FORMATS', () => {
  it('ENGINE_EXECUTABLE_FORMATS remains exactly [knockout, round_robin]', () => {
    expect([...ENGINE_EXECUTABLE_FORMATS]).toEqual(['knockout', 'round_robin']);
  });

  it('double elimination / swiss are still rejected by the create DTO', () => {
    expect(() => CreateTournamentSchema.parse({ ...makeTournament({ format: undefined }), name: 'X', start_date: '2026-10-01', format: 'double_elimination' })).toThrow();
    expect(() => CreateTournamentSchema.parse({ ...makeTournament({ format: undefined }), name: 'X', start_date: '2026-10-01', format: 'swiss' })).toThrow();
  });

  it('no groups/matches are generated merely by creating a GSK tournament', async () => {
    expect(repo.createGroup).not.toHaveBeenCalled();
    expect(repo.createMatch).not.toHaveBeenCalled();
  });
});