import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

const repo = vi.hoisted(() => ({
  findByCode: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findByIdDetailed: vi.fn(),
  findPrizesByTournament: vi.fn(),
  listBracketTypes: vi.fn(),
  findBracketTypeById: vi.fn(),
  setBracketTypeActive: vi.fn(),
  countBracketTypeReferences: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  createRegistration: vi.fn(),
  getRegistrationById: vi.fn(),
  createCashPaymentTransaction: vi.fn(),
  updateRegistrationPaymentStatus: vi.fn(),
  getOrgActivePaymentMethodSlugs: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
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
const commission = vi.hoisted(() => ({ getCommissionRate: vi.fn(), getCurrentSubscription: vi.fn() }));
const paymentService = vi.hoisted(() => ({ charge: vi.fn() }));
const pdRepo = vi.hoisted(() => ({
  getNextWaitingOrderByTournament: vi.fn(),
  createParticipant: vi.fn(),
  findParticipantByRegistration: vi.fn(),
}));

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
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService }));

const RR = { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null };

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 3, format: 'round_robin',
    name: 'T1', max_participants: 8, min_participants: 2, entry_fee: 0,
    currency_code: 'AED', price_type: 'FREE', status: 'registration_open',
    sport_id: 22, match_format_id: 1, rule_set_id: 1, draw_seed: 42,
    registration_payment_methods: ['cash', 'card'],
    ...overrides,
  };
}

function makeReg(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, tournament_id: 1, user_id: 5, player_id: 5, seed: 1, status: 'registered',
    payment_status: 'unpaid', registered_at: '2026-01-01 00:00:00',
    ...overrides,
  };
}

const svc = new TournamentService();

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByCode.mockResolvedValue(null);
  repo.findBracketTypeById.mockResolvedValue(RR);
  repo.create.mockResolvedValue(10);
  repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
  repo.findByIdDetailed.mockResolvedValue(makeTournament({ id: 10 }));
  repo.findPrizesByTournament.mockResolvedValue([]);
  repo.findRegistrationsByTournament.mockResolvedValue([]);
  repo.createRegistration.mockResolvedValue(2);
  repo.getRegistrationById.mockResolvedValue(makeReg({ id: 2, registration_id: 2 }));
  repo.createCashPaymentTransaction.mockResolvedValue(5001);
  repo.updateRegistrationPaymentStatus.mockResolvedValue(undefined);
  repo.getOrgActivePaymentMethodSlugs.mockResolvedValue([]);
  repo.update.mockResolvedValue(undefined);
  mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
  mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { best_of: 3 }, standingsRules: null });
  commission.getCommissionRate.mockResolvedValue(null);
  commission.getCurrentSubscription.mockResolvedValue({ exists: false, planName: null });
  paymentService.charge.mockResolvedValue({ success: true, paymentId: 9001, status: 'pending', paymentUrl: 'https://pay', clientSecret: 'csk', intentionId: 'int' });
  pdRepo.getNextWaitingOrderByTournament.mockResolvedValue(1);
  pdRepo.createParticipant.mockResolvedValue(1);
  pdRepo.findParticipantByRegistration.mockResolvedValue(null);
});

describe('Group 3 — Tournament registration payment-method configuration', () => {
  it('1. Cash-only configuration is persisted and effective (Cash only)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, registration_payment_methods: ['cash'] }));
    await svc.create(makeTournament({ registration_payment_methods: ['cash'] }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ registration_payment_methods: ['cash'] }));
    const eff = await svc.resolveEffectiveRegistrationPaymentMethods({ organisation_id: undefined, registration_payment_methods: ['cash'] });
    expect(eff).toEqual(['cash']);
  });

  it('2. Card-only configuration is persisted and effective (Card only)', async () => {
    await svc.create(makeTournament({ registration_payment_methods: ['card'] }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ registration_payment_methods: ['card'] }));
    const eff = await svc.resolveEffectiveRegistrationPaymentMethods({ organisation_id: undefined, registration_payment_methods: ['card'] });
    expect(eff).toEqual(['card']);
  });

  it('3. Both configuration is persisted and effective', async () => {
    await svc.create(makeTournament({ registration_payment_methods: ['card', 'cash'] }), 1);
    // Order is normalised deterministically: cash before card.
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ registration_payment_methods: ['cash', 'card'] }));
    const eff = await svc.resolveEffectiveRegistrationPaymentMethods({ organisation_id: undefined, registration_payment_methods: ['cash', 'card'] });
    expect(eff).toEqual(['cash', 'card']);
  });

  it('4. empty allowed-method list is rejected', async () => {
    await expect(svc.create(makeTournament({ registration_payment_methods: [] as any }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('5. unknown payment method is rejected', async () => {
    await expect(svc.create(makeTournament({ registration_payment_methods: ['crypto'] as any }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD });
  });

  it('6. wallet is rejected as a registration payment method', async () => {
    await expect(svc.create(makeTournament({ registration_payment_methods: ['wallet'] as any }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('7. unsupported payment method (bank_transfer) is rejected', async () => {
    await expect(svc.create(makeTournament({ registration_payment_methods: ['bank_transfer'] as any }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD });
  });

  it('8. duplicate methods are normalised (no duplicates, deterministic order)', async () => {
    await svc.create(makeTournament({ registration_payment_methods: ['card', 'cash', 'cash'] as any }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ registration_payment_methods: ['cash', 'card'] }));
  });

  it('9. backward-compatible default: missing/legacy config resolves to both methods', async () => {
    // Create without any config → both methods.
    await svc.create(makeTournament({ registration_payment_methods: undefined }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ registration_payment_methods: ['cash', 'card'] }));
    // Legacy row (NULL JSON in DB) → read as both methods via getById/getByIdDetailed.
    repo.findById.mockResolvedValue(makeTournament({ registration_payment_methods: null as any }));
    const t = await svc.getById(10);
    expect(t.registration_payment_methods).toEqual(['cash', 'card']);
    repo.findByIdDetailed.mockResolvedValue(makeTournament({ id: 10, registration_payment_methods: null as any }));
    const detail = await svc.getByIdDetailed(10);
    expect(detail.registration_payment_methods).toEqual(['cash', 'card']);
    expect(detail.effective_registration_payment_methods).toEqual(['cash', 'card']);
  });

  it('10. effective methods are org-isolated — an org allowlist intersects the config', async () => {
    // Org A allows only card at the payment_gateway_config level.
    repo.getOrgActivePaymentMethodSlugs.mockResolvedValue(['card']);
    const effA = await svc.resolveEffectiveRegistrationPaymentMethods({ organisation_id: 1001, registration_payment_methods: ['cash', 'card'] });
    expect(effA).toEqual(['card']);
    // Org B has no explicit config → no org-level restriction.
    repo.getOrgActivePaymentMethodSlugs.mockResolvedValue([]);
    const effB = await svc.resolveEffectiveRegistrationPaymentMethods({ organisation_id: 1002, registration_payment_methods: ['cash', 'card'] });
    expect(effB).toEqual(['cash', 'card']);
    // Config can never re-activate a method the org does not support.
    repo.getOrgActivePaymentMethodSlugs.mockResolvedValue(['cash']);
    const effC = await svc.resolveEffectiveRegistrationPaymentMethods({ organisation_id: 1003, registration_payment_methods: ['card'] });
    expect(effC).toEqual([]);
  });

  it('13. player receives only effective allowed methods; a disallowed method is rejected on register', async () => {
    // Card-only tournament → cash register is rejected.
    repo.findById.mockResolvedValue(makeTournament({ id: 1, entry_fee: 100, registration_payment_methods: ['card'] }));
    await expect(svc.register(1, 5, undefined, 'cash'))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD });
    expect(repo.createRegistration).not.toHaveBeenCalled();
  });

  it('14. the authoritative tournament currency reaches the shared Payment charge', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, entry_fee: 250, currency_code: 'AED', registration_payment_methods: ['card'] }));
    await svc.register(1, 5, undefined, 'card');
    expect(paymentService.charge).toHaveBeenCalledWith(5, expect.objectContaining({
      referenceType: 'tournament',
      referenceId: 2,
      amount: 250,
      currency: 'AED',
      paymentMethod: 'card',
    }));
  });

  it('16. shared Payment capability is reused — card route calls the SHARED paymentService.charge', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, entry_fee: 250, currency_code: 'AED', registration_payment_methods: ['card'] }));
    const reg = await svc.register(1, 5, undefined, 'card');
    expect(paymentService.charge).toHaveBeenCalledTimes(1);
    expect(reg).toMatchObject({ payment_status: 'unpaid' });
    expect(reg.payment).toEqual(expect.objectContaining({ method: 'card', paymentId: 9001, paymentUrl: 'https://pay' }));
  });

  it('15. existing registration flow remains backward compatible (no payment method → unpaid)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, entry_fee: 100, registration_payment_methods: ['cash', 'card'] }));
    const reg = await svc.register(1, 5);
    expect(repo.createRegistration).toHaveBeenCalledWith(expect.objectContaining({ payment_status: 'unpaid', status: 'registered' }));
    expect(paymentService.charge).not.toHaveBeenCalled();
    expect(reg.payment_status).toBe('unpaid');
  });

  it('cash registration records a PAID shared payment_transactions row and marks the registration paid', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, entry_fee: 150, currency_code: 'AED', registration_payment_methods: ['cash'] }));
    const reg = await svc.register(1, 5, undefined, 'cash');
    expect(repo.createCashPaymentTransaction).toHaveBeenCalledWith(expect.objectContaining({ userId: 5, registrationId: 2, amount: 150, currency: 'AED' }));
    expect(repo.updateRegistrationPaymentStatus).toHaveBeenCalledWith(2, 'paid');
    expect(bus.emit).toHaveBeenCalledWith('payment:succeeded', expect.objectContaining({ referenceType: 'tournament', referenceId: 2, metadata: expect.objectContaining({ paymentMethod: 'cash' }) }));
    expect(reg.payment).toEqual(expect.objectContaining({ method: 'cash', status: 'paid' }));
  });

  it('update normalises + persists the allowlist and emits the realtime event only on change', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, registration_payment_methods: ['cash'] }));
    await svc.update(10, { registration_payment_methods: ['card', 'cash'] } as any);
    expect(repo.update).toHaveBeenCalledWith(10, expect.objectContaining({ registration_payment_methods: ['cash', 'card'] }));
    expect(bus.emit).toHaveBeenCalledWith('tournament:registration-payment-methods-updated', expect.objectContaining({ tournamentId: 10, methods: ['cash', 'card'] }), expect.anything());

    // No change → no realtime event.
    bus.emit.mockClear();
    await svc.update(10, { registration_payment_methods: ['cash'] } as any);
    expect(bus.emit).not.toHaveBeenCalledWith('tournament:registration-payment-methods-updated', expect.anything(), expect.anything());
  });
});

describe('Group 3 — RBAC boundary (shop-admin remains denied)', () => {
  it('11/12. the shop-admin role template grants NO tournament administration keys', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/role-permission-templates.mjs');
    const src = readFileSync(root, 'utf8');
    // Explicit deny present in the template (defense-in-depth) for org tournament keys.
    expect(src).toContain('org.tournaments.update');
    expect(src).toContain('isSellerDeniedTournamentKey');
    // shop-admin must never receive org.tournaments.update (the Tournament config edit key).
    const shopAdminBlock = src.slice(src.indexOf("templateSlug === 'shop-admin'"), src.indexOf("templateSlug === 'shop-admin'") + 400);
    expect(shopAdminBlock).toContain('isSellerDeniedTournamentKey(permissionKey)');
    // The platform tournament update keys are also excluded from shop-admin.
    expect(src).not.toContain(`'shop-admin' : new Set(['tournament.create'`);
  });
});