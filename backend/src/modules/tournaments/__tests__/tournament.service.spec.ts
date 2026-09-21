import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import type { Tournament, TournamentRegistration } from '../domain/tournament-aggregate.js';

const repo = vi.hoisted(() => ({
  findByCode: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findByIdDetailed: vi.fn(),
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
  findPrizesByTournament: vi.fn(),
  replacePrizes: vi.fn(),
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

  // ── Group 1 — auto-generated Tournament Rules from Match Format + Rule Set ──

  it('G1a. explicit match_format_id + rule_set_id generate a human-readable rules snapshot', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({
      formatId: 1, ruleSetId: 1, version: 1,
      rules: { score_structure: 'sets', best_of: 3, first_to: 6, margin: 1, tiebreak_at: 6, tiebreak_first_to: 7, tiebreak_win_by: 2, deuce_rule: 'golden_point', draw_allowed: false },
      standingsRules: null,
    });

    await svc.create(makeTournament(), 1);
    const rulesArg = (repo.create.mock.calls[0][0] as any).rules;
    expect(rulesArg).toContain('Padel');
    expect(rulesArg).toContain('Doubles');
    expect(rulesArg).toMatch(/Best of 3 sets/);
    expect(rulesArg).toMatch(/First to 6 games by a 1-game margin/);
    expect(rulesArg).toMatch(/Tiebreak at 6-6, first to 7 by 2/);
    expect(rulesArg).toMatch(/Golden point at deuce/);
  });

  it('G1b. sport default (is_default) resolution generates rules when no explicit format/rule-set', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10, match_format_id: undefined, rule_set_id: undefined }));
    mrRepo.resolveDefaultFormatForSport.mockResolvedValue({ formatId: 1, formatType: 'doubles', playersPerSide: 2, name: 'Padel Standard' });
    mrRepo.findActiveRuleSetForFormat.mockResolvedValue({
      formatId: 1, ruleSetId: 1, version: 1,
      rules: { score_structure: 'sets', best_of: 3, sets_to_win: 2, first_to: 6, margin: 1, tiebreak_at: 6, tiebreak_first_to: 7, tiebreak_win_by: 2, deuce_rule: 'golden_point', draw_allowed: false },
      standingsRules: null,
    });

    await svc.create(makeTournament({ match_format_id: undefined, rule_set_id: undefined }), 1);
    const rulesArg = (repo.create.mock.calls[0][0] as any).rules;
    expect(rulesArg).toContain('Padel Standard');
    expect(rulesArg).toMatch(/Best of 3 sets/);
  });

  it('G1c. a client-supplied free-text rules string cannot override the generated rules', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({
      formatId: 1, ruleSetId: 1, version: 1,
      rules: { score_structure: 'sets', best_of: 3 },
      standingsRules: null,
    });

    await svc.create(makeTournament({ rules: 'Client invented text' }), 1);
    const rulesArg = (repo.create.mock.calls[0][0] as any).rules;
    expect(rulesArg).not.toContain('Client invented text');
    expect(rulesArg).toMatch(/Best of 3 sets/);
  });

  it('G1d. update regenerates rules when sport/format/rule-set change', async () => {
    const current = makeTournament({ id: 1, sport_id: 22, match_format_id: 1, rule_set_id: 1, rules: 'Old generated snapshot' });
    repo.findById.mockResolvedValue(current);
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({
      formatId: 1, ruleSetId: 1, version: 2,
      rules: { score_structure: 'sets', best_of: 3, first_to: 6, margin: 2 },
      standingsRules: null,
    });

    await svc.update(1, { rule_set_id: 1 });
    // The server must regenerate rules from the effective config, never reuse client text.
    const updateCall = repo.update.mock.calls[0][1] as any;
    expect(updateCall.rules).toMatch(/Best of 3 sets/);
    expect(updateCall.rules).not.toContain('Old generated snapshot');
  });

  it('G1e. update drops client free-text rules when no config change and no valid format/rule-set', async () => {
    const current = makeTournament({ id: 1, sport_id: undefined, match_format_id: undefined, rule_set_id: undefined, rules: 'Existing legacy text' });
    repo.findById.mockResolvedValue(current);

    await svc.update(1, { rules: 'Client attempted override' } as any);
    const updateCall = repo.update.mock.calls[0][1] as any;
    expect(updateCall).not.toHaveProperty('rules');
  });

  it('G1f. stored rules are NOT regenerated on reads (persisted snapshot is authoritative)', async () => {
    const stored = makeTournament({ id: 1, rules: 'Persisted v1 snapshot' });
    repo.findById.mockResolvedValue(stored);
    const t = await svc.getById(1);
    expect(t.rules).toBe('Persisted v1 snapshot');
    expect(mrRepo.findFormatById).not.toHaveBeenCalled();
    expect(mrRepo.findRuleSetById).not.toHaveBeenCalled();
  });

  // ── Group 1A — organisation tournament type ──

  it('G1A-type-1. org-owned tournament is stored as community, never platform', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets', best_of: 3 }, standingsRules: null });
    // Client attempts to supply tournament_type 'platform' for an org-owned tournament.
    await svc.create(makeTournament({ organisation_id: 1001, tournament_type: 'platform' }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ organisation_id: 1001, tournament_type: 'community' }));
  });

  it('G1A-type-2. org create without explicit type still derives community', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets', best_of: 3 }, standingsRules: null });
    await svc.create(makeTournament({ organisation_id: 1001, tournament_type: undefined }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ organisation_id: 1001, tournament_type: 'community' }));
  });

  it('G1A-type-3. platform create (no org) remains platform', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10, organisation_id: undefined, tournament_type: 'platform' }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets', best_of: 3 }, standingsRules: null });
    await svc.create(makeTournament({ organisation_id: undefined, tournament_type: 'platform' }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ organisation_id: undefined, tournament_type: 'platform' }));
  });

  it('G1A-type-4. update cannot turn an org-owned tournament into platform', async () => {
    const current = makeTournament({ id: 1, organisation_id: 1001, tournament_type: 'community' });
    repo.findById.mockResolvedValue(current);
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets', best_of: 3 }, standingsRules: null });
    await svc.update(1, { tournament_type: 'platform' } as any);
    expect(repo.update).toHaveBeenCalledWith(1, expect.objectContaining({ tournament_type: 'community' }));
  });

  // ── Group 1A — authoritative currency ──

  it('G1A-curr-1. org tournament currency is resolved server-side (org country default), client value overridden', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets', best_of: 3 }, standingsRules: null });
    // The currency resolver executes SQL via the mocked pool. Return an EGP
    // org-country default for the org, and nothing for branch override.
    pool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM branches b')) return [[]];
      if (sql.includes('FROM organisations o')) return [[{ code: 'EGP' }]];
      return [[]];
    });
    await svc.create(makeTournament({ organisation_id: 1001, currency_code: 'AED' }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ currency_code: 'EGP' }));
  });

  it('G1A-curr-2. branch currency override wins over organisation country default', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets', best_of: 3 }, standingsRules: null });
    pool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM branches b')) return [[{ code: 'AED' }]];
      if (sql.includes('FROM organisations o')) return [[{ code: 'EGP' }]];
      return [[]];
    });
    await svc.create(makeTournament({ organisation_id: 1001, branch_id: 7, currency_code: 'USD' }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ currency_code: 'AED' }));
  });

  it('G1A-curr-3. platform tournament (no org) keeps client-supplied currency', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10, organisation_id: undefined }));
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets', best_of: 3 }, standingsRules: null });
    pool.execute.mockImplementation(async () => [[]]);
    await svc.create(makeTournament({ organisation_id: undefined, currency_code: 'AED' }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ currency_code: 'AED' }));
  });

  it('G1A-curr-4. getOrgCommissionConfig exposes the resolved org currency', async () => {
    const { getCurrentSubscription } = await import('../../organisations/application/current-subscription.service.js');
    (getCurrentSubscription as any).mockResolvedValue({ exists: false, planName: null });
    pool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM branches b')) return [[]];
      if (sql.includes('FROM organisations o')) return [[{ code: 'EGP' }]];
      return [[]];
    });
    const cfg = await svc.getOrgCommissionConfig(1001);
    expect(cfg.currencyCode).toBe('EGP');
  });

  // ── Group 1A — bracket in generated rules + historical snapshot ──

  it('G1A-bracket-1. generated rules include the selected bracket type', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    repo.findBracketTypeById.mockResolvedValue({ id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null });
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets', best_of: 3, first_to: 6, margin: 1 }, standingsRules: null });
    await svc.create(makeTournament({ bracket_type_id: 1 }), 1);
    const rulesArg = (repo.create.mock.calls[0][0] as any).rules;
    expect(rulesArg).toMatch(/^Single Elimination — Padel — Doubles\./);
  });

  it('G1A-bracket-2. update regenerates rules when bracket type changes', async () => {
    const current = makeTournament({ id: 1, sport_id: 22, match_format_id: 1, rule_set_id: 1, bracket_type_id: 1, rules: 'Old with Single Elimination' });
    repo.findById.mockResolvedValue(current);
    repo.findBracketTypeById.mockResolvedValue({ id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null });
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets', best_of: 3, first_to: 6, margin: 1 }, standingsRules: null });
    await svc.update(1, { bracket_type_id: 3 });
    const updateCall = repo.update.mock.calls[0][1] as any;
    expect(updateCall.rules).toMatch(/^Round Robin — Padel — Doubles\./);
    expect(updateCall.rules).not.toContain('Single Elimination');
  });

  it('G1A-bracket-3. unrelated update preserves the stored rules snapshot', async () => {
    const current = makeTournament({ id: 1, sport_id: 22, match_format_id: 1, rule_set_id: 1, bracket_type_id: 1, rules: 'Existing snapshot' });
    repo.findById.mockResolvedValue(current);
    await svc.update(1, { name: 'Renamed' } as any);
    expect(repo.update).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Renamed' }));
    expect((repo.update.mock.calls[0][1] as any).rules).toBeUndefined();
  });
});

describe('TournamentService — structured prizes (Group 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findBracketTypeById.mockResolvedValue({ id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null });
    commission.getCommissionRate.mockResolvedValue(null);
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { score_structure: 'sets' }, standingsRules: null });
    repo.findByIdDetailed.mockResolvedValue({ id: 1, name: 'Prize Cup', sport_name: 'Padel', max_players: 8, prize_description: 'Legacy prize text' });
    repo.findPrizesByTournament.mockResolvedValue([]);
  });
  const svc = new TournamentService();

  function prizesPayload(overrides: Record<string, unknown> = {}) {
    return {
      bracket_type_id: 1,
      format: 'knockout',
      sport_id: 22,
      name: 'Prize Cup',
      max_participants: 8,
      currency_code: 'USD',
      start_date: '2026-11-01',
      ...overrides,
    };
  }

  it('1. create Tournament with NO prizes does not call replacePrizes', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    await svc.create(prizesPayload() as any, 1);
    expect(repo.replacePrizes).not.toHaveBeenCalled();
  });

  it('2. create Tournament with multiple prizes persists them', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    await svc.create(prizesPayload({
      prizes: [
        { placement: 1, prize_type: 'cash', amount: 10000, currency_code: 'USD', description: 'Winner' },
        { placement: 1, prize_type: 'gold', description: 'Gold medal' },
        { placement: 1, prize_type: 'trophy', description: 'Trophy' },
        { placement: 2, prize_type: 'cash', amount: 5000, currency_code: 'USD' },
        { placement: 2, prize_type: 'silver', description: 'Silver medal' },
        { placement: null, prize_type: 'gift', description: 'Padel racket' },
      ],
    }) as any, 1);
    expect(repo.replacePrizes).toHaveBeenCalledTimes(1);
    const [, prizes] = repo.replacePrizes.mock.calls[0];
    expect(prizes).toHaveLength(6);
    expect(prizes.filter((p: any) => p.placement === 1)).toHaveLength(3); // multiple prizes per placement
    expect(prizes.filter((p: any) => p.prize_type === 'cash')).toHaveLength(2);
  });

  it('3. cash prize validation — rejects a cash prize without an amount', async () => {
    await expect(svc.create(prizesPayload({
      prizes: [{ placement: 1, prize_type: 'cash', currency_code: 'USD' }],
    }) as any, 1)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_PRIZE });
  });

  it('3b. cash prize validation — rejects a zero/negative amount', async () => {
    await expect(svc.create(prizesPayload({
      prizes: [{ placement: 1, prize_type: 'cash', amount: 0, currency_code: 'USD' }],
    }) as any, 1)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_PRIZE });
  });

  it('4. non-cash prize validation — amount + currency are normalised to null', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    await svc.create(prizesPayload({
      prizes: [{ placement: 1, prize_type: 'gold', amount: 999, currency_code: 'EUR', description: 'Gold' }],
    }) as any, 1);
    const [, prizes] = repo.replacePrizes.mock.calls[0];
    expect(prizes[0].amount).toBeNull();
    expect(prizes[0].currency_code).toBeNull();
    expect(prizes[0].description).toBe('Gold');
  });

  it('5. multiple prizes for same placement are preserved (ordering deterministic)', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    await svc.create(prizesPayload({
      prizes: [
        { placement: 1, prize_type: 'cash', amount: 100, currency_code: 'USD' },
        { placement: 1, prize_type: 'trophy', description: 'Trophy' },
      ],
    }) as any, 1);
    const [, prizes] = repo.replacePrizes.mock.calls[0];
    expect(prizes[0].display_order).toBe(0);
    expect(prizes[1].display_order).toBe(1);
    expect(prizes.map((p: any) => p.prize_type)).toEqual(['cash', 'trophy']);
  });

  it('6. multiple placements supported (1st/2nd/3rd + special)', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    await svc.create(prizesPayload({
      prizes: [
        { placement: 1, prize_type: 'cash', amount: 100, currency_code: 'USD' },
        { placement: 2, prize_type: 'cash', amount: 50, currency_code: 'USD' },
        { placement: 3, prize_type: 'cash', amount: 25, currency_code: 'USD' },
        { placement: null, prize_type: 'gift', description: 'Special' },
      ],
    }) as any, 1);
    const [, prizes] = repo.replacePrizes.mock.calls[0];
    expect(prizes.map((p: any) => p.placement)).toEqual([1, 2, 3, null]);
  });

  it('7. authoritative currency — cash prize with no currency gets the tournament currency', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(10);
    repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
    await svc.create(prizesPayload({
      currency_code: 'EGP',
      prizes: [{ placement: 1, prize_type: 'cash', amount: 10000 }],
    }) as any, 1);
    const [, prizes] = repo.replacePrizes.mock.calls[0];
    expect(prizes[0].currency_code).toBe('EGP');
  });

  it('8. invalid currency rejection — cash prize currency must match tournament currency', async () => {
    await expect(svc.create(prizesPayload({
      currency_code: 'EGP',
      prizes: [{ placement: 1, prize_type: 'cash', amount: 10000, currency_code: 'AED' }],
    }) as any, 1)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_PRIZE });
  });

  it('11. update prizes replaces the whole set', async () => {
    const current = makeTournament({ id: 1, currency_code: 'USD' });
    repo.findById.mockResolvedValue(current);
    await svc.update(1, {
      prizes: [
        { placement: 1, prize_type: 'cash', amount: 1000, currency_code: 'USD' },
        { placement: 2, prize_type: 'bronze', description: 'Bronze medal' },
      ],
    } as any);
    expect(repo.replacePrizes).toHaveBeenCalledTimes(1);
    const [, prizes] = repo.replacePrizes.mock.calls[0];
    expect(prizes).toHaveLength(2);
  });

  it('12. update prizes — removing all prizes passes an empty array (delete-all)', async () => {
    const current = makeTournament({ id: 1, currency_code: 'USD' });
    repo.findById.mockResolvedValue(current);
    await svc.update(1, { prizes: [] } as any);
    expect(repo.replacePrizes).toHaveBeenCalledWith(1, []);
  });

  it('9. legacy prize_description fallback — detail returns prizes array + legacy text', async () => {
    repo.findPrizesByTournament.mockResolvedValue([{ id: 1, tournament_id: 1, placement: 1, prize_type: 'cash', amount: 100, currency_code: 'USD', display_order: 0 }]);
    const detail = await svc.getByIdDetailed(1);
    // findByIdDetailed must have been resolved; prizes attached.
    expect(detail.prizes).toBeDefined();
    expect(detail.prizes).toHaveLength(1);
  });

  it('10. structured prizes take precedence — detail carries the structured array', async () => {
    repo.findPrizesByTournament.mockResolvedValue([{ id: 1, tournament_id: 1, placement: 1, prize_type: 'trophy', description: 'Cup', display_order: 0 }]);
    const detail = await svc.getByIdDetailed(1);
    expect(detail.prizes[0].prize_type).toBe('trophy');
  });
});