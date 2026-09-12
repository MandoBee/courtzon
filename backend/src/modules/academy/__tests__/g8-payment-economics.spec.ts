// ============================================================================
// Academy G8 — Enrollment payment economics (unit tests)
//
// Exercises the REAL academy-payment service with mocked repository + commission
// service. Covers: collector resolution, snapshot economics math (gross /
// org earning / commission / coach compensation / cancellation window),
// FAIL-CLOSED behaviour (no org, free program, missing commission rate), and
// the idempotent offline cash acknowledgment.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const conn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
  query: async () => [[], []],
  execute: async () => [{ affectedRows: 0 }],
}));
const fakePool = vi.hoisted(() => ({ getConnection: async () => conn }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => fakePool }));

const commission = vi.hoisted(() => ({ calculate: vi.fn() }));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: commission }));

const payRepo = vi.hoisted(() => ({
  getPaymentContext: vi.fn(),
  getConfirmedSessionTotals: vi.fn(),
  getSnapshotByEnrollment: vi.fn(),
  createCashPaymentTransaction: vi.fn(),
  createSnapshot: vi.fn(),
  markEnrollmentPaymentConfirmed: vi.fn(),
  getCancellationWindowMinutes: vi.fn(),
}));
vi.mock('../infrastructure/repositories/academy-payment.repository.js', () => ({ academyPaymentRepository: payRepo }));

import { academyPaymentService, collectorForMethod } from '../application/academy-payment.service.js';

function makeContext(overrides: Record<string, any> = {}) {
  return {
    enrollmentId: 11, playerId: 200, programId: 1, groupId: 2, organisationId: 7, branchId: 5,
    programPrice: 200, currency: 'USD', priceType: 'FIXED', coachId: 99,
    coachCompType: 'fixed_total', coachCompValue: 40, coachCompCurrency: 'USD',
    paymentConfirmedAt: null, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  conn.beginTransaction.mockClear();
  conn.commit.mockClear();
  conn.rollback.mockClear();
  payRepo.getPaymentContext.mockResolvedValue(makeContext());
  payRepo.getConfirmedSessionTotals.mockResolvedValue({ sessionCount: 10, courtRentalAmount: 50, courtRentalCurrency: 'USD', earliestStart: '2028-02-01 10:00:00' });
  payRepo.getCancellationWindowMinutes.mockResolvedValue(1440);
  commission.calculate.mockResolvedValue({ rate: 15, commissionAmount: 30 });
  payRepo.createCashPaymentTransaction.mockResolvedValue(5001);
  payRepo.createSnapshot.mockResolvedValue({ id: 7001, created: true });
  payRepo.markEnrollmentPaymentConfirmed.mockResolvedValue(undefined);
});

describe('G8 — collectorForMethod', () => {
  it('cash is collected by the org, every digital method by CourtZon', () => {
    expect(collectorForMethod('cash')).toBe('org');
    expect(collectorForMethod('card')).toBe('courtzon');
    expect(collectorForMethod('wallet')).toBe('courtzon');
    expect(collectorForMethod('bank_transfer')).toBe('courtzon');
  });
});

describe('G8 — resolveEconomics', () => {
  it('snapshots gross = program price, org earning = gross − commission', async () => {
    const econ = await academyPaymentService.resolveEconomics(11, 'card');
    expect(econ.gross_amount).toBe(200);
    expect(econ.program_price).toBe(200);
    expect(econ.commission_amount).toBe(30);
    expect(econ.organization_earning_amount).toBe(170);
    expect(econ.collector).toBe('courtzon');
    expect(econ.payment_method).toBe('card');
    expect(econ.cancellation_window_minutes).toBe(1440);
    expect(commission.calculate).toHaveBeenCalledWith(7, 'academy', 200);
  });

  it('computes fixed_total coach compensation', async () => {
    const econ = await academyPaymentService.resolveEconomics(11, 'cash');
    expect(econ.coach_comp_amount).toBe(40);
  });

  it('computes fixed_per_session coach compensation from the session count', async () => {
    payRepo.getPaymentContext.mockResolvedValue(makeContext({ coachCompType: 'fixed_per_session', coachCompValue: 5 }));
    const econ = await academyPaymentService.resolveEconomics(11, 'cash');
    expect(econ.coach_comp_amount).toBe(50);
  });

  it('computes percent_gross coach compensation on the gross amount', async () => {
    payRepo.getPaymentContext.mockResolvedValue(makeContext({ coachCompType: 'percent_gross', coachCompValue: 10 }));
    const econ = await academyPaymentService.resolveEconomics(11, 'cash');
    expect(econ.coach_comp_amount).toBe(20);
  });

  it('rounds to two decimals and carries the session/court snapshot', async () => {
    payRepo.getPaymentContext.mockResolvedValue(makeContext({ programPrice: 199.999 }));
    const econ = await academyPaymentService.resolveEconomics(11, 'card');
    expect(econ.gross_amount).toBe(200);
    expect(econ.session_count).toBe(10);
    expect(econ.court_rental_amount).toBe(50);
    expect(econ.court_rental_currency).toBe('USD');
  });

  it('FAILS CLOSED when the program is free', async () => {
    payRepo.getPaymentContext.mockResolvedValue(makeContext({ priceType: 'FREE', programPrice: 0 }));
    await expect(academyPaymentService.resolveEconomics(11, 'card')).rejects.toThrow(/free/);
  });

  it('FAILS CLOSED when the program has no organisation', async () => {
    payRepo.getPaymentContext.mockResolvedValue(makeContext({ organisationId: null }));
    await expect(academyPaymentService.resolveEconomics(11, 'card')).rejects.toThrow(/organisation/);
  });

  it('FAILS CLOSED when the commission rate is missing (propagates ConflictError)', async () => {
    commission.calculate.mockRejectedValue(new Error('no applicable commission rate'));
    await expect(academyPaymentService.resolveEconomics(11, 'card')).rejects.toThrow(/commission rate/);
  });
});

describe('G8 — recordOfflineCashPayment', () => {
  it('is idempotent when a snapshot already exists and acknowledges the enrollment', async () => {
    payRepo.getPaymentContext.mockResolvedValue(makeContext({ paymentConfirmedAt: '2028-01-01 10:00:00' }));
    payRepo.getSnapshotByEnrollment.mockResolvedValue({ id: 7001, payment_transaction_id: 5001 });
    const result = await academyPaymentService.recordOfflineCashPayment(11, 9);
    expect(result).toEqual({ snapshotId: 7001, paymentTransactionId: 5001, created: false });
    expect(payRepo.createSnapshot).not.toHaveBeenCalled();
    expect(payRepo.markEnrollmentPaymentConfirmed).toHaveBeenCalledWith(11, 9, conn);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('creates the cash payment transaction + snapshot + acknowledgment atomically', async () => {
    payRepo.getSnapshotByEnrollment.mockResolvedValue(null);
    const result = await academyPaymentService.recordOfflineCashPayment(11, 9);
    expect(payRepo.createCashPaymentTransaction).toHaveBeenCalledWith(
      { userId: 200, enrollmentId: 11, amount: 200, currency: 'USD' },
      conn,
    );
    expect(payRepo.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ enrollment_id: 11, organisation_id: 7, gross_amount: 200, payment_method: 'cash', collector: 'org' }),
      conn,
    );
    expect(payRepo.markEnrollmentPaymentConfirmed).toHaveBeenCalledWith(11, 9, conn);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(result).toEqual({ snapshotId: 7001, paymentTransactionId: 5001, created: true });
  });

  it('rolls back when the payment context is missing', async () => {
    payRepo.getPaymentContext.mockResolvedValue(null);
    await expect(academyPaymentService.recordOfflineCashPayment(11, 9)).rejects.toThrow(/not found/);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});