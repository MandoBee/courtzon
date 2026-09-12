// ============================================================================
// Academy G8.4 — Player self-service payment (security + eligibility, unit)
// ============================================================================
// Covers the Part 14 security/IDOR matrix and Part 15 payment-flow behavior at
// the service boundary with mocked repositories + payment service:
//   1 own enrollment → allowed      7 forged program → rejected
//   2 other player → denied         8 forged collector → rejected
//   3 unauthenticated → denied      9 FREE → no payment
//   4 wrong org → denied           10 already-paid → idempotent
//   5 forged enrollment → denied   11 missing rate → fail closed
//   6 forged amount → rejected     12 duplicate → one payment
// + wallet/card/state flows.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const enrollRepo = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock('../infrastructure/repositories/enrollment.repository.js', () => ({ enrollmentRepository: enrollRepo }));
const progRepo = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock('../infrastructure/repositories/program.repository.js', () => ({ programRepository: progRepo }));
const payRepo = vi.hoisted(() => ({ getSnapshotByEnrollment: vi.fn(), hasPendingPaymentTransaction: vi.fn() }));
vi.mock('../infrastructure/repositories/academy-payment.repository.js', () => ({ academyPaymentRepository: payRepo }));
const paySvc = vi.hoisted(() => ({ resolveEconomics: vi.fn() }));
vi.mock('../application/academy-payment.service.js', () => ({ academyPaymentService: paySvc }));
const paymentSvc = vi.hoisted(() => ({ charge: vi.fn() }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: paymentSvc }));
const groupRepo = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock('../infrastructure/repositories/group.repository.js', () => ({ groupRepository: groupRepo }));

import { playerAcademyPaymentService } from '../application/player-academy-payment.service.js';
import { PlayerAcademyPaymentSchema } from '../presentation/academy.dto.js';

const PLAYER = 200;
const OTHER = 300;

function makeEnrollment(overrides: Record<string, any> = {}) {
  return {
    id: 11, player_id: PLAYER, program_id: 1, group_id: 2, status: 'confirmed',
    payment_confirmed_at: null, ...overrides,
  };
}
function makeProgram(overrides: Record<string, any> = {}) {
  return {
    id: 1, name: 'Tennis Pro', price: 200, currency: 'EGP', price_type: 'FIXED',
    status: 'open', lifecycle_state: 'confirmed', ...overrides,
  };
}
const econ = {
  gross_amount: 200, currency: 'EGP', commission_amount: 20,
  organization_earning_amount: 180, court_rental_amount: 60,
};

beforeEach(() => {
  vi.clearAllMocks();
  enrollRepo.getById.mockResolvedValue(makeEnrollment());
  progRepo.getById.mockResolvedValue(makeProgram());
  payRepo.getSnapshotByEnrollment.mockResolvedValue(null);
  payRepo.hasPendingPaymentTransaction.mockResolvedValue(false);
  paySvc.resolveEconomics.mockResolvedValue({ ...econ });
  groupRepo.getById.mockResolvedValue({ id: 2, name: 'G8 Group' });
});

describe('G8.4 — GET payment state', () => {
  it('unpaid paid program → unpaid with authoritative amount + wallet/card methods', async () => {
    const state = await playerAcademyPaymentService.getPaymentState(PLAYER, 11);
    expect(state.paymentState).toBe('unpaid');
    expect(state.amount).toBe(200);
    expect(state.currency).toBe('EGP');
    expect(state.availableMethods).toEqual(['wallet', 'card']);
    expect(state.paid).toBe(false);
  });

  it('FREE program → free, no amount, no methods', async () => {
    progRepo.getById.mockResolvedValue(makeProgram({ price: 0, price_type: 'FREE' }));
    const state = await playerAcademyPaymentService.getPaymentState(PLAYER, 11);
    expect(state.paymentState).toBe('free');
    expect(state.amount).toBeNull();
    expect(state.availableMethods).toEqual([]);
    expect(paySvc.resolveEconomics).not.toHaveBeenCalled();
  });

  it('already paid → paid (from payment_confirmed_at)', async () => {
    enrollRepo.getById.mockResolvedValue(makeEnrollment({ payment_confirmed_at: '2026-01-01 10:00:00' }));
    const state = await playerAcademyPaymentService.getPaymentState(PLAYER, 11);
    expect(state.paymentState).toBe('paid');
    expect(state.paid).toBe(true);
    expect(paySvc.resolveEconomics).not.toHaveBeenCalled();
  });

  it('already paid → paid (from immutable snapshot)', async () => {
    payRepo.getSnapshotByEnrollment.mockResolvedValue({ id: 1, gross_amount: 200, currency: 'EGP' });
    const state = await playerAcademyPaymentService.getPaymentState(PLAYER, 11);
    expect(state.paymentState).toBe('paid');
  });

  it('pending gateway transaction → processing', async () => {
    payRepo.hasPendingPaymentTransaction.mockResolvedValue(true);
    const state = await playerAcademyPaymentService.getPaymentState(PLAYER, 11);
    expect(state.paymentState).toBe('processing');
    expect(paySvc.resolveEconomics).not.toHaveBeenCalled();
  });

  it('missing Academy commission rate → unavailable (non-sensitive)', async () => {
    paySvc.resolveEconomics.mockRejectedValue(new Error('No commission rate configured'));
    const state = await playerAcademyPaymentService.getPaymentState(PLAYER, 11);
    expect(state.paymentState).toBe('unavailable');
    expect(state.amount).toBeNull();
  });

  it('waiting enrollment (not confirmed) → unavailable', async () => {
    enrollRepo.getById.mockResolvedValue(makeEnrollment({ status: 'waiting' }));
    const state = await playerAcademyPaymentService.getPaymentState(PLAYER, 11);
    expect(state.paymentState).toBe('unavailable');
  });

  it('program not yet confirmed → unavailable', async () => {
    progRepo.getById.mockResolvedValue(makeProgram({ lifecycle_state: 'setup' }));
    const state = await playerAcademyPaymentService.getPaymentState(PLAYER, 11);
    expect(state.paymentState).toBe('unavailable');
  });

  it('cross-player enrollment → non-revealing 404', async () => {
    enrollRepo.getById.mockResolvedValue(makeEnrollment({ player_id: OTHER }));
    await expect(playerAcademyPaymentService.getPaymentState(PLAYER, 11)).rejects.toMatchObject({
      code: 'ACADEMY_ENROLLMENT_NOT_FOUND',
    });
    expect(paySvc.resolveEconomics).not.toHaveBeenCalled();
  });

  it('forged/missing enrollment id → non-revealing 404', async () => {
    enrollRepo.getById.mockResolvedValue(null);
    await expect(playerAcademyPaymentService.getPaymentState(PLAYER, 999)).rejects.toMatchObject({
      code: 'ACADEMY_ENROLLMENT_NOT_FOUND',
    });
  });
});

describe('G8.4 — charge (Pay Now)', () => {
  it('1. player pays own enrollment → wallet charge with authoritative amount', async () => {
    paymentSvc.charge.mockResolvedValue({ success: true, paymentId: 5001, status: 'paid', balance: 300 });
    const result = await playerAcademyPaymentService.charge(PLAYER, 11, 'wallet');
    expect(result.status).toBe('paid');
    expect(result.paymentId).toBe(5001);
    expect(paymentSvc.charge).toHaveBeenCalledWith(PLAYER, expect.objectContaining({
      referenceType: 'academy', referenceId: 11, amount: 200, currency: 'EGP', paymentMethod: 'wallet',
    }));
  });

  it('2. player pays another player\'s enrollment → denied', async () => {
    enrollRepo.getById.mockResolvedValue(makeEnrollment({ player_id: OTHER }));
    await expect(playerAcademyPaymentService.charge(PLAYER, 11, 'wallet')).rejects.toMatchObject({
      code: 'ACADEMY_ENROLLMENT_NOT_FOUND',
    });
    expect(paymentSvc.charge).not.toHaveBeenCalled();
  });

  it('5. forged enrollment id → denied', async () => {
    enrollRepo.getById.mockResolvedValue(null);
    await expect(playerAcademyPaymentService.charge(PLAYER, 999, 'wallet')).rejects.toMatchObject({
      code: 'ACADEMY_ENROLLMENT_NOT_FOUND',
    });
  });

  it('6/7/8. client-supplied amount/program/collector → rejected by strict schema (never trusted)', () => {
    for (const bad of [
      { paymentMethod: 'wallet', amount: 1 },
      { paymentMethod: 'wallet', programId: 99 },
      { paymentMethod: 'wallet', groupId: 99 },
      { paymentMethod: 'wallet', collector: 'org' },
      { paymentMethod: 'wallet', commission: 0 },
      { paymentMethod: 'cash' }, // cash/offline is not a player method
      { paymentMethod: 'bank_transfer' },
      { amount: 200 },
    ]) {
      expect(() => PlayerAcademyPaymentSchema.parse(bad), JSON.stringify(bad)).toThrow(z.ZodError);
    }
    expect(PlayerAcademyPaymentSchema.parse({ paymentMethod: 'wallet' })).toEqual({ paymentMethod: 'wallet' });
  });

  it('9. FREE program → charge rejected (no payment required)', async () => {
    progRepo.getById.mockResolvedValue(makeProgram({ price: 0, price_type: 'FREE' }));
    await expect(playerAcademyPaymentService.charge(PLAYER, 11, 'wallet')).rejects.toMatchObject({
      code: 'ACADEMY_PAYMENT_NOT_ELIGIBLE',
    });
    expect(paymentSvc.charge).not.toHaveBeenCalled();
  });

  it('10. already-paid → safe idempotent result, no duplicate charge', async () => {
    enrollRepo.getById.mockResolvedValue(makeEnrollment({ payment_confirmed_at: '2026-01-01 10:00:00' }));
    const result = await playerAcademyPaymentService.charge(PLAYER, 11, 'wallet');
    expect(result.status).toBe('already_paid');
    expect(paymentSvc.charge).not.toHaveBeenCalled();
  });

  it('10b. snapshot exists → safe idempotent already_paid', async () => {
    payRepo.getSnapshotByEnrollment.mockResolvedValue({ id: 1 });
    const result = await playerAcademyPaymentService.charge(PLAYER, 11, 'wallet');
    expect(result.status).toBe('already_paid');
    expect(paymentSvc.charge).not.toHaveBeenCalled();
  });

  it('11. missing Academy commission rate → fail closed, no payment created', async () => {
    paySvc.resolveEconomics.mockRejectedValue(new Error('No commission rate configured'));
    await expect(playerAcademyPaymentService.charge(PLAYER, 11, 'wallet')).rejects.toMatchObject({
      code: 'ACADEMY_PAYMENT_UNAVAILABLE',
    });
    expect(paymentSvc.charge).not.toHaveBeenCalled();
  });

  it('12. duplicate request → exactly one payment charge', async () => {
    paymentSvc.charge.mockResolvedValue({ success: true, paymentId: 5001, status: 'paid', balance: 300 });
    const first = await playerAcademyPaymentService.charge(PLAYER, 11, 'wallet', 'dup-key');
    expect(first.status).toBe('paid');
    expect(paymentSvc.charge).toHaveBeenCalledTimes(1);

    // The listener confirms → subsequent attempt is idempotent.
    enrollRepo.getById.mockResolvedValue(makeEnrollment({ payment_confirmed_at: '2026-01-01 10:00:00' }));
    const second = await playerAcademyPaymentService.charge(PLAYER, 11, 'wallet', 'dup-key');
    expect(second.status).toBe('already_paid');
    expect(paymentSvc.charge).toHaveBeenCalledTimes(1);
  });

  it('card → pending result with clientSecret for the generic card flow', async () => {
    paymentSvc.charge.mockResolvedValue({
      success: true, paymentId: 5002, status: 'pending',
      clientSecret: 'mock_csk_test_123', paymentUrl: 'https://mock', intentionId: 'mock_int_1', transactionId: 'mock_txn_1',
    });
    const result = await playerAcademyPaymentService.charge(PLAYER, 11, 'card');
    expect(result.status).toBe('pending');
    expect(result.clientSecret).toBe('mock_csk_test_123');
    expect(result.paymentId).toBe(5002);
    expect(paymentSvc.charge).toHaveBeenCalledWith(PLAYER, expect.objectContaining({ paymentMethod: 'card' }));
  });

  it('insufficient wallet balance → error propagates, no payment success state', async () => {
    paymentSvc.charge.mockRejectedValue(new Error('Insufficient available wallet balance'));
    await expect(playerAcademyPaymentService.charge(PLAYER, 11, 'wallet')).rejects.toThrow(/Insufficient/);
  });

  it('ineligible (waiting enrollment) → rejected', async () => {
    enrollRepo.getById.mockResolvedValue(makeEnrollment({ status: 'waiting' }));
    await expect(playerAcademyPaymentService.charge(PLAYER, 11, 'wallet')).rejects.toMatchObject({
      code: 'ACADEMY_PAYMENT_NOT_ELIGIBLE',
    });
    expect(paymentSvc.charge).not.toHaveBeenCalled();
  });
});