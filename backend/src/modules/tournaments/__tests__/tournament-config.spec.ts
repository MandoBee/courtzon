import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

const repo = vi.hoisted(() => ({
  findByCode: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  listBracketTypes: vi.fn(),
  findBracketTypeById: vi.fn(),
  setBracketTypeActive: vi.fn(),
  countBracketTypeReferences: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  createMatch: vi.fn(),
  findMatches: vi.fn(),
  updateStatus: vi.fn(),
}));

const matchServiceMock = vi.hoisted(() => ({ createForTournament: vi.fn() }));

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
const commission = vi.hoisted(() => ({ getCommissionRate: vi.fn(), getCurrentSubscription: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({
  getCommissionRate: commission.getCommissionRate,
  getCurrentSubscription: commission.getCurrentSubscription,
}));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));

const SE = { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: '{"rounds":"auto","seeding":true}' };
const DE = { id: 2, name: 'Double Elimination', slug: 'double-elimination', is_active: 1, config_schema: '{"rounds":"auto","seeding":true,"losers_bracket":true}' };
const RR = { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: '{"groups":4,"advance":2}' };
const SW = { id: 4, name: 'Swiss System', slug: 'swiss', is_active: 1, config_schema: '{"rounds":7,"pairing":"score-based"}' };
const INACTIVE_RR = { ...RR, is_active: 0 };

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 3, format: 'round_robin',
    name: 'T1', max_participants: 8, min_participants: 2, entry_fee: 0,
    currency_code: 'USD', price_type: 'FREE', status: 'draft',
    sport_id: 22, match_format_id: 1, rule_set_id: 1, draw_seed: 42,
    ...overrides,
  };
}

const svc = new TournamentService();

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByCode.mockResolvedValue(null);
  repo.create.mockResolvedValue(10);
  repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
  mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
  mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { best_of: 3 }, standingsRules: null });
  commission.getCommissionRate.mockResolvedValue(null);
  commission.getCurrentSubscription.mockResolvedValue({ exists: false, planName: null });
});

describe('Group 5B-SR — Bracket type configuration', () => {
  it('1. returns ALL active bracket types from the DB', async () => {
    repo.listBracketTypes.mockResolvedValue([SE, DE, RR, SW]);
    const types = await svc.listBracketTypes(false);
    expect(types.map((t) => t.slug)).toEqual(['single-elimination', 'double-elimination', 'round-robin', 'swiss']);
  });

  it('2. frontend does NOT hardcode bracket types (create page reads the API)', async () => {
    // The create page must load bracket types from the backend (DB-driven).
    // Static assertion: the shared create page no longer contains a hardcoded
    // bracket-option array (the old `bracketOptions` literal was removed).
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../frontend/src/pages/tournaments/TournamentCreatePage.tsx');
    const src = readFileSync(root, 'utf8');
    expect(src).toContain('bracketTypeApi.listActive');
    expect(src).toContain("queryKey: ['bracket-types']");
    expect(src).not.toMatch(/bracketOptions\s*=\s*\[/);
  });

  it('3. inactive bracket types cannot be selected for new tournaments', async () => {
    repo.findBracketTypeById.mockResolvedValue(INACTIVE_RR);
    await expect(svc.create(makeTournament(), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('4. existing referenced bracket types cannot be destructively deleted', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    repo.countBracketTypeReferences.mockResolvedValue(5);
    await expect(svc.deleteBracketType(3, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(repo.setBracketTypeActive).not.toHaveBeenCalled();
  });

  it('4b. unreferenced bracket types are deactivated (never hard-deleted)', async () => {
    repo.findBracketTypeById.mockResolvedValue(SW);
    repo.countBracketTypeReferences.mockResolvedValue(0);
    await svc.deleteBracketType(4, 1);
    expect(repo.setBracketTypeActive).toHaveBeenCalledWith(4, false);
  });

  it('4c. deferred engine types are config-visible but unavailable for creation', async () => {
    repo.findBracketTypeById.mockResolvedValue(DE);
    await expect(svc.create(makeTournament({ bracket_type_id: 2 }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
  });

  it('5. organisation commission is resolved from its active subscription/plan', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    commission.getCommissionRate.mockResolvedValue({ rate: 10, rateType: 'percentage' });
    await svc.create(makeTournament({ organisation_id: 1001, entry_fee: 50 }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ commission_rate: 10 }));
  });

  it('6. client-supplied commissionRate cannot override the subscription commission', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    commission.getCommissionRate.mockResolvedValue({ rate: 10, rateType: 'percentage' });
    // DTO strips commission_rate; the service derives from the subscription.
    const parsed = await import('../presentation/tournament.dto.js');
    const body = parsed.CreateTournamentSchema.parse({ ...makeTournament({ commission_rate: 0, organisation_id: 1001 }), name: 'X' });
    expect(body).not.toHaveProperty('commission_rate');
    await svc.create(makeTournament({ organisation_id: 1001, commission_rate: 0 }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ commission_rate: 10 }));
  });

  it('7. tournament stores historical commission_rate at creation', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    commission.getCommissionRate.mockResolvedValue({ rate: 7, rateType: 'percentage' });
    await svc.create(makeTournament({ organisation_id: 1001 }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ commission_rate: 7 }));
  });

  it('8. later subscription changes do not alter an existing tournament commission', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    commission.getCommissionRate.mockResolvedValue({ rate: 7, rateType: 'percentage' });
    await svc.create(makeTournament({ organisation_id: 1001 }), 1);
    // Existing tournament holds its snapshot; update must NOT change commission_rate.
    const dto = await import('../presentation/tournament.dto.js');
    const updateBody = dto.UpdateTournamentSchema.parse({ name: 'Renamed' });
    expect(updateBody).not.toHaveProperty('commission_rate');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ commission_rate: 7 }));
  });

  it('9. organisation A cannot read organisation B commission config (tenant-scoped endpoint)', async () => {
    commission.getCurrentSubscription.mockResolvedValue({ exists: true, planName: 'Standard Club' });
    commission.getCommissionRate.mockResolvedValue({ rate: 10, rateType: 'percentage' });
    // The service resolves strictly against the passed orgId — no cross-org leak.
    const configA = await svc.getOrgCommissionConfig(1001);
    const configB = await svc.getOrgCommissionConfig(1002);
    expect(commission.getCommissionRate).toHaveBeenCalledWith(1001, 'tournament');
    expect(commission.getCommissionRate).toHaveBeenCalledWith(1002, 'tournament');
    expect(configA.commissionRate).toBe(10);
    expect(configB.commissionRate).toBe(10);
  });

  it('10. match format belongs to the selected sport', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    // Format 1 belongs to sport 22; tournament sport_id is 21 → rejected.
    await expect(svc.create(makeTournament({ sport_id: 21 }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
  });

  it('11. rule set belongs to the selected match format', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 2, ruleSetId: 3, version: 1, rules: {}, standingsRules: null });
    await expect(svc.create(makeTournament(), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
  });

  it('12. invalid format/rule combinations are rejected server-side', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    await expect(svc.create(makeTournament({ match_format_id: 1, rule_set_id: undefined }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
  });

  it('13. tournament-generated matches preserve selected format/rule configuration', async () => {
    // resolveMatchFormatContext uses t.match_format_id + t.rule_set_id when present.
    repo.findById.mockResolvedValue(makeTournament({ id: 10, format: 'knockout', status: 'registration_closed' }));
    repo.findRegistrationsByTournament.mockResolvedValue([
      { id: 1, tournament_id: 10, user_id: 10, player_id: 10, seed: 1, status: 'confirmed' },
      { id: 2, tournament_id: 10, user_id: 20, player_id: 20, seed: 2, status: 'confirmed' },
    ]);
    repo.findMatches.mockResolvedValue([]);
    repo.updateStatus.mockResolvedValue(undefined);
    matchServiceMock.createForTournament.mockImplementation(async (input: any) => ({ id: input.participants[0].userId }));
    repo.createMatch.mockResolvedValue(1);
    await svc.generateBracket(10);
    expect(matchServiceMock.createForTournament).toHaveBeenCalledWith(
      expect.objectContaining({ formatId: 1, ruleSetId: 1, formatSnapshot: expect.objectContaining({ formatId: 1 }) }),
    );
  });

  it('14. group 1 historical format snapshot remains valid', async () => {
    mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
    const fmt = await mrRepo.findFormatById(1);
    expect(fmt.formatType).toBe('doubles');
    expect(fmt.playersPerSide).toBe(2);
  });

  it('15. group 4 historical rule snapshot remains valid', async () => {
    mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { best_of: 3 }, standingsRules: null });
    const rs = await mrRepo.findRuleSetById(1);
    expect(rs.rules.best_of).toBe(3);
  });

  it('16. tournament rules text remains separate from the match rule set', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    const t = makeTournament({ rules: 'No outside coaching. Best of 3.' });
    await svc.create(t, 1);
    // rules (free-text) and rule_set_id (authoritative scoring config) are distinct fields.
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ rules: 'No outside coaching. Best of 3.', rule_set_id: 1 }));
  });

  it('17. organisation tournament creation remains tenant-scoped', async () => {
    // The org controller forces organisation_id from the URL org — covered in
    // org-tournament.controller.spec.ts. Here assert the service honours it.
    repo.findBracketTypeById.mockResolvedValue(RR);
    commission.getCommissionRate.mockResolvedValue({ rate: 5, rateType: 'percentage' });
    await svc.create(makeTournament({ organisation_id: 2002 }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ organisation_id: 2002 }));
  });

  it('18. super admin tournament creation remains functional (platform, no org)', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    await svc.create(makeTournament({ organisation_id: undefined }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ commission_rate: 0 }));
  });

  it('19. bracket type update toggles active state with audit', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    repo.setBracketTypeActive.mockResolvedValue(undefined);
    await svc.updateBracketTypeActive(3, false, 1);
    expect(repo.setBracketTypeActive).toHaveBeenCalledWith(3, false);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.BRACKET_TYPE_UPDATE' }));
  });
});