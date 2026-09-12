import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * G8 — the durable academy entitlement subscriber must consume economics ONLY
 * from the immutable snapshot, be retry-safe, and stay idempotent:
 *  - missing snapshot → rethrow (BullMQ retry / outbox replay)
 *  - existing entitlements → silent idempotent skip
 *  - creates ORGANIZATION_EARNING + COURTZON_COMMISSION in one transaction
 */

const payRepo = vi.hoisted(() => ({ getSnapshotByEnrollment: vi.fn(), getConfirmedSessionTotals: vi.fn() }));
const entitlementSvc = vi.hoisted(() => ({ getEntitlementsBySource: vi.fn(), createEntitlements: vi.fn() }));
const eventBus = vi.hoisted(() => ({ emit: vi.fn(), on: vi.fn(), subscribe: vi.fn() }));

const conn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
}));

vi.mock('../../academy/infrastructure/repositories/academy-payment.repository.js', () => ({ academyPaymentRepository: payRepo }));
vi.mock('../application/financial-entitlement.service.js', () => ({ financialEntitlementService: entitlementSvc }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ getConnection: async () => conn }),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBus }));
vi.mock('../../../shared/event-bus/subscriber.worker.js', () => ({ createSubscriberWorker: vi.fn() }));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const { handleAcademyEnrollmentPaid, resolveAcademyCancellationWindow } = await import('../application/entitlement-academy.listener.js');

const snapshot = {
  id: 7001,
  enrollment_id: 11,
  program_id: 1,
  group_id: 2,
  player_id: 200,
  organisation_id: 7,
  branch_id: 5,
  gross_amount: 200,
  currency: 'USD',
  commission_amount: 30,
  organization_earning_amount: 170,
  court_rental_amount: 50,
  coach_comp_amount: 40,
  collector: 'org',
  payment_method: 'cash',
  cancellation_window_minutes: 1440,
};

beforeEach(() => {
  vi.clearAllMocks();
  payRepo.getSnapshotByEnrollment.mockResolvedValue(snapshot);
  entitlementSvc.getEntitlementsBySource.mockResolvedValue([]);
  entitlementSvc.createEntitlements.mockResolvedValue([801, 802]);
  payRepo.getConfirmedSessionTotals.mockResolvedValue({ sessionCount: 10, courtRentalAmount: 50, courtRentalCurrency: 'USD', earliestStart: '2028-02-01 10:00:00' });
});

describe('G8 — handleAcademyEnrollmentPaid', () => {
  it('rethrows when the snapshot is missing so BullMQ retries', async () => {
    payRepo.getSnapshotByEnrollment.mockResolvedValue(null);
    await expect(
      handleAcademyEnrollmentPaid({ payload: { enrollmentId: 11 } } as any),
    ).rejects.toThrow(/snapshot missing/i);
    expect(entitlementSvc.createEntitlements).not.toHaveBeenCalled();
  });

  it('skips idempotently when entitlements already exist for the source', async () => {
    entitlementSvc.getEntitlementsBySource.mockResolvedValue([{ id: 1 }]);
    await expect(
      handleAcademyEnrollmentPaid({ payload: { enrollmentId: 11 } } as any),
    ).resolves.toBeUndefined();
    expect(entitlementSvc.createEntitlements).not.toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('creates ORGANIZATION_EARNING + COURTZON_COMMISSION from the snapshot in one tx', async () => {
    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: 11 } } as any);

    expect(entitlementSvc.createEntitlements).toHaveBeenCalledTimes(1);
    const [inputs, passedConn] = entitlementSvc.createEntitlements.mock.calls[0];
    expect(passedConn).toBe(conn);
    expect(inputs).toHaveLength(2);

    const [orgEarning, commission] = inputs;
    expect(orgEarning.entitlementType).toBe('ORGANIZATION_EARNING');
    expect(orgEarning.amount).toBe(170);
    expect(orgEarning.organisationId).toBe(7);
    expect(orgEarning.sourceType).toBe('academy');
    expect(orgEarning.sourceId).toBe(11);
    expect(orgEarning.collector).toBe('org');
    expect(orgEarning.metadata.enrollmentId).toBe(11);

    expect(commission.entitlementType).toBe('COURTZON_COMMISSION');
    expect(commission.amount).toBe(30);
    expect(commission.collector).toBe('org');

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it('skips when the snapshot has no organisation (nothing to credit)', async () => {
    payRepo.getSnapshotByEnrollment.mockResolvedValue({ ...snapshot, organisation_id: null });
    await expect(
      handleAcademyEnrollmentPaid({ payload: { enrollmentId: 11 } } as any),
    ).resolves.toBeUndefined();
    expect(entitlementSvc.createEntitlements).not.toHaveBeenCalled();
    expect(conn.beginTransaction).not.toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it('rolls back when entitlement creation fails so the job can retry', async () => {
    entitlementSvc.createEntitlements.mockRejectedValue(new Error('duplicate source'));
    await expect(
      handleAcademyEnrollmentPaid({ payload: { enrollmentId: 11 } } as any),
    ).rejects.toThrow('duplicate source');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});

describe('G8 — resolveAcademyCancellationWindow', () => {
  it('returns null when no window is snapshotted (immediate activation)', async () => {
    await expect(resolveAcademyCancellationWindow({ ...snapshot, cancellation_window_minutes: null })).resolves.toBeNull();
  });

  it('anchors available_at at earliest session − window', async () => {
    const date = await resolveAcademyCancellationWindow(snapshot);
    expect(date).toBeInstanceOf(Date);
    const anchor = new Date('2028-02-01T10:00:00');
    expect(date!.getTime()).toBe(anchor.getTime() - 1440 * 60 * 1000);
  });

  it('returns null when the window has already passed', async () => {
    payRepo.getConfirmedSessionTotals.mockResolvedValue({ sessionCount: 1, courtRentalAmount: 0, courtRentalCurrency: null, earliestStart: '2026-01-01 10:00:00' });
    await expect(resolveAcademyCancellationWindow(snapshot)).resolves.toBeNull();
  });
});