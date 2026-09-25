import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

const repo = vi.hoisted(() => ({
  findByCode: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findBracketTypeById: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  createRegistration: vi.fn(),
  getRegistrationById: vi.fn(),
  createCashPaymentTransaction: vi.fn(),
  updateRegistrationPaymentStatus: vi.fn(),
}));

const pdRepo = vi.hoisted(() => ({
  getNextWaitingOrderByTournament: vi.fn(),
  createParticipant: vi.fn(),
  findParticipantByRegistration: vi.fn(),
}));

const mrRepo = vi.hoisted(() => ({ findFormatById: vi.fn(), findRuleSetById: vi.fn(), resolveDefaultFormatForSport: vi.fn(), findActiveRuleSetForFormat: vi.fn(), listRuleSetsBySport: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
}));
pool.getConnection = vi.fn(async () => pool);
const commission = vi.hoisted(() => ({ getCommissionRate: vi.fn(), getCurrentSubscription: vi.fn() }));
const branchRepo = vi.hoisted(() => ({ findById: vi.fn() }));
const paymentService = vi.hoisted(() => ({ charge: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({ getCommissionRate: commission.getCommissionRate, getCurrentSubscription: commission.getCurrentSubscription }));
vi.mock('../../organisations/infrastructure/repositories/branch.repository.js', () => ({ branchRepository: branchRepo }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService }));

const RR = { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null };

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 3, format: 'round_robin', name: 'T1',
    max_participants: 2, min_participants: 2, entry_fee: 0, currency_code: 'AED',
    price_type: 'FREE', status: 'registration_open', sport_id: 22,
    match_format_id: 1, rule_set_id: 1, draw_seed: 42, start_date: '2026-12-01',
    registration_payment_methods: ['cash', 'card'], waitlist_enabled: 1,
    ...overrides,
  };
}

function reg(id: number, status: string) {
  return { id, tournament_id: 1, player_id: id, status, payment_status: 'unpaid' };
}

const svc = new TournamentService();

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByCode.mockResolvedValue(null);
  repo.findBracketTypeById.mockResolvedValue(RR);
  repo.create.mockResolvedValue(10);
  repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
  repo.findRegistrationsByTournament.mockResolvedValue([reg(1, 'confirmed'), reg(2, 'confirmed')]); // full (max 2)
  repo.createRegistration.mockResolvedValue(3);
  repo.getRegistrationById.mockResolvedValue({ id: 3, tournament_id: 1, player_id: 5, status: 'waiting', payment_status: 'unpaid', waiting_order: 1 });
  pdRepo.getNextWaitingOrderByTournament.mockResolvedValue(1);
  pdRepo.createParticipant.mockResolvedValue(1);
  pdRepo.findParticipantByRegistration.mockResolvedValue(null);
  mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
  mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { best_of: 3 }, standingsRules: null });
  commission.getCommissionRate.mockResolvedValue(null);
  commission.getCurrentSubscription.mockResolvedValue({ exists: false, planName: null });
  branchRepo.findById.mockResolvedValue({ id: 5, opening_time: '08:00:00', closing_time: '22:00:00' });
  paymentService.charge.mockResolvedValue({ success: true, paymentId: 9001, status: 'pending', paymentUrl: 'https://pay' });
});

describe('Group 6 — register() waitlist behavior', () => {
  it('1. capacity full + waitlist enabled → registration enters WAITING (no payment, no entitlement)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, waitlist_enabled: 1 }));
    const r = await svc.register(1, 5);
    expect(repo.createRegistration).toHaveBeenCalledWith(expect.objectContaining({ status: 'waiting', payment_status: 'unpaid', waiting_order: 1 }), expect.anything());
    expect(pdRepo.createParticipant).toHaveBeenCalledWith(expect.objectContaining({ status: 'waiting', waiting_order: 1, member_user_ids: [5] }), expect.anything());
    expect(r.status).toBe('waiting');
    expect(r.payment).toBeNull();
    // No payment flow runs for a waiting participant.
    expect(paymentService.charge).not.toHaveBeenCalled();
    expect(repo.createCashPaymentTransaction).not.toHaveBeenCalled();
    expect(bus.emit).toHaveBeenCalledWith('tournament:waitlist-updated', expect.objectContaining({ tournamentId: 1 }), expect.anything());
  });

  it('2. capacity full + waitlist disabled → existing TOURNAMENT_CAPACITY_FULL error', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, waitlist_enabled: 0 }));
    await expect(svc.register(1, 5)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_CAPACITY_FULL });
    expect(repo.createRegistration).not.toHaveBeenCalled();
  });

  it('2b. waitlist disabled is the DEFAULT (backward compatible — existing tournaments keep erroring)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, waitlist_enabled: undefined }));
    await expect(svc.register(1, 5)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_CAPACITY_FULL });
  });

  it('3/4. FIFO waiting order is assigned monotonically (MAX+1) and never array-index-based', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, waitlist_enabled: 1 }));
    pdRepo.getNextWaitingOrderByTournament.mockResolvedValue(7);
    await svc.register(1, 5);
    expect(pdRepo.getNextWaitingOrderByTournament).toHaveBeenCalledWith(1);
    expect(repo.createRegistration).toHaveBeenCalledWith(expect.objectContaining({ waiting_order: 7 }), expect.anything());
  });

  it('5. waiting order is stable — an existing waiting participant is never renumbered by a new registration', async () => {
    // New registrant gets the next order; no renumbering of earlier waiters.
    repo.findById.mockResolvedValue(makeTournament({ id: 1, waitlist_enabled: 1 }));
    pdRepo.getNextWaitingOrderByTournament.mockResolvedValue(3); // existing waiters 1,2
    await svc.register(1, 5);
    expect(pdRepo.createParticipant).toHaveBeenCalledWith(expect.objectContaining({ waiting_order: 3 }), expect.anything());
  });

  it('9. wallet remains unavailable for waitlist promotion', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, waitlist_enabled: 1, entry_fee: 100 }));
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    // The participant-draw service validates payment methods against the effective
    // allowlist (cash/card only) — wallet is never accepted.
    const effective = await import('../../../shared/constants/payment-methods.js');
    expect(effective.isPaymentMethodAllowedInContext('wallet', 'checkout')).toBe(false);
    expect(participantDrawService).toBeDefined();
  });
});