import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import type { Tournament, TournamentRegistration } from '../domain/tournament-aggregate.js';

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
  listBracketTypes: vi.fn(),
  findBracketTypeById: vi.fn(),
  setBracketTypeActive: vi.fn(),
  countBracketTypeReferences: vi.fn(),
}));

const mrRepo = vi.hoisted(() => ({
  findFormatById: vi.fn(),
  findRuleSetById: vi.fn(),
  resolveDefaultFormatForSport: vi.fn(),
  findActiveRuleSetForFormat: vi.fn(),
  listRuleSetsBySport: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const pool = vi.hoisted(() => ({ execute: vi.fn(async () => [[]]), query: vi.fn(async () => [[]]) }));
const commission = vi.hoisted(() => ({ getCommissionRate: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({
  getCommissionRate: commission.getCommissionRate,
  getCurrentSubscription: vi.fn(async () => ({ exists: false, planName: null })),
}));
const matchServiceMock = vi.hoisted(() => ({ createForTournament: vi.fn() }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 1, format: 'round_robin',
    name: 'T1', max_participants: 8, min_participants: 2, entry_fee: 0,
    currency_code: 'USD', price_type: 'FREE', status: 'registration_open',
    sport_id: 22, match_format_id: 1, rule_set_id: 1, draw_seed: 42,
    ...overrides,
  };
}

function makeReg(overrides: Partial<TournamentRegistration> = {}): TournamentRegistration {
  return {
    id: 1, tournament_id: 1, user_id: 5, player_id: 5, seed: 1, status: 'registered',
    payment_status: 'unpaid', registered_at: '2026-01-01 00:00:00',
    ...overrides,
  };
}

describe('TournamentService (Group 5A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findBracketTypeById.mockResolvedValue({ id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: '{"rounds":"auto","seeding":true}' });
    commission.getCommissionRate.mockResolvedValue(null);
  });
  const svc = new TournamentService();

  it('rejects a tournament with a Match Format but no Rule Set', async () => {
    await expect(svc.create(makeTournament({ rule_set_id: undefined }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
  });

  it('rejects a mismatched Match Format / Rule Set pair', async () => {
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 2, ruleSetId: 3, version: 1, rules: {}, standingsRules: null });
    await expect(svc.create(makeTournament(), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
  });

  it('creates a tournament with a draw_seed when none provided', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: {}, standingsRules: null });

    const created = await svc.create(makeTournament(), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ draw_seed: expect.any(Number) }));
    expect(created.id).toBe(10);
  });

  it('enforces registration open/closed', async () => {
    repo.findById.mockResolvedValue(makeTournament({ status: 'completed' }));
    await expect(svc.register(1, 5)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED });
  });

  it('rejects duplicate registration idempotently', async () => {
    repo.findById.mockResolvedValue(makeTournament());
    repo.findRegistrationsByTournament.mockResolvedValue([makeReg({ player_id: 5 })]);
    await expect(svc.register(1, 5)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_REGISTRATION_EXISTS });
  });

  it('enforces capacity', async () => {
    repo.findById.mockResolvedValue(makeTournament({ max_participants: 1 }));
    repo.findRegistrationsByTournament.mockResolvedValue([makeReg({ player_id: 5, status: 'confirmed' })]);
    await expect(svc.register(1, 6)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_CAPACITY_FULL });
  });

  it('registers with payment_status unpaid when entry fee exists', async () => {
    repo.findById.mockResolvedValue(makeTournament({ entry_fee: 50, price_type: 'FIXED' }));
    repo.findRegistrationsByTournament.mockResolvedValue([]);
    repo.createRegistration.mockResolvedValue(2);
    repo.getRegistrationById.mockResolvedValue(makeReg({ id: 2, payment_status: 'unpaid' }));
    const reg = await svc.register(1, 5);
    expect(repo.createRegistration).toHaveBeenCalledWith(expect.objectContaining({ payment_status: 'unpaid', status: 'registered' }));
    expect(reg.payment_status).toBe('unpaid');
  });

  it('requires paid entry fee before confirmation (shared payment integration)', async () => {
    const t = makeTournament({ entry_fee: 50, price_type: 'FIXED' });
    const reg = makeReg({ status: 'registered', payment_status: 'unpaid' });
    repo.getRegistrationById.mockResolvedValue(reg);
    repo.findById.mockResolvedValue(t);
    await expect(svc.confirmRegistration(1)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED });
  });

  it('allows confirmation after payment is marked paid', async () => {
    repo.getRegistrationById.mockResolvedValue(makeReg({ status: 'registered', payment_status: 'paid' }));
    repo.findById.mockResolvedValue(makeTournament({ entry_fee: 50, price_type: 'FIXED' }));
    await svc.confirmRegistration(1);
    expect(repo.updateRegistrationStatus).toHaveBeenCalledWith(1, 'confirmed');
  });

  it('cancels registration via the withdrawn transition', async () => {
    repo.getRegistrationById.mockResolvedValue(makeReg());
    await svc.cancelRegistration(1);
    expect(repo.updateRegistrationStatus).toHaveBeenCalledWith(1, 'withdrawn');
  });

  it('generates a deterministic bracket with byes for a knockout', async () => {
    repo.findById.mockResolvedValue(makeTournament({ format: 'knockout', draw_seed: 42 }));
    repo.findRegistrationsByTournament.mockResolvedValue([
      makeReg({ id: 1, player_id: 10, seed: 1, status: 'confirmed' }),
      makeReg({ id: 2, player_id: 20, seed: 2, status: 'confirmed' }),
      makeReg({ id: 3, player_id: 30, seed: 3, status: 'confirmed' }),
    ]);
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });

    // Simulate shared match creation via the mocked matchService.
    matchServiceMock.createForTournament.mockImplementation(async (input: any) => ({ id: 100 + input.participants[0].userId }));
    repo.createMatch.mockResolvedValue(1);

    await svc.generateBracket(1);
    expect(repo.createMatch).toHaveBeenCalled();
    // A bye slot (3 players → next power of 2 = 4 → one bye) must not create a fake match with a shared Match.
    const createCalls = repo.createMatch.mock.calls;
    const byeCall = createCalls.find((c: any[]) => c[0].player1_id != null && c[0].player2_id == null && c[0].match_id == null);
    expect(byeCall).toBeTruthy();
  });
});