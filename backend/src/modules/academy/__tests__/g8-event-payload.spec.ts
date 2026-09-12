import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * G8.3 Part 13 UNIT — academy:enrollment-paid event payload.
 *
 * The event is emitted ONLY after a successful payment + committed snapshot,
 * carries identity + payment reference, and never duplicates mutable academy
 * configuration (price, comp_value, court prices) — those live in the snapshot.
 */
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
});

const bus = vi.hoisted(() => ({
  on: vi.fn(),
  emit: vi.fn(async () => undefined),
}));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: bus }));

const paySvc = vi.hoisted(() => ({ ensureSnapshotForPayment: vi.fn() }));
vi.mock('../application/academy-payment.service.js', () => ({ academyPaymentService: paySvc }));

const payRepo = vi.hoisted(() => ({ getSnapshotByEnrollment: vi.fn() }));
vi.mock('../infrastructure/repositories/academy-payment.repository.js', () => ({ academyPaymentRepository: payRepo }));

const snapshot = {
  id: 7001,
  enrollment_id: 11,
  program_id: 1,
  group_id: 2,
  player_id: 200,
  organisation_id: 7,
  branch_id: 5,
  gross_amount: 200,
  currency: 'EGP',
  payment_method: 'card',
  collector: 'courtzon',
  payment_transaction_id: 5001,
};

import { registerAcademyPaymentListeners, resetAcademyPaymentListenersForTest } from '../application/academy-payment.listener.js';

async function firePaid(payload: any) {
  const handler = bus.on.mock.calls.find((c: any) => c[0] === 'payment:succeeded')?.[1];
  if (!handler) throw new Error('payment:succeeded handler not registered');
  await handler(payload);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAcademyPaymentListenersForTest();
  paySvc.ensureSnapshotForPayment.mockResolvedValue({ snapshotId: 7001, created: true });
  payRepo.getSnapshotByEnrollment.mockResolvedValue(snapshot);
});

describe('G8.3 — academy:enrollment-paid event payload', () => {
  it('is emitted after the snapshot is committed, carrying identity + payment reference', async () => {
    registerAcademyPaymentListeners();
    await firePaid({
      paymentId: 5001,
      referenceType: 'academy',
      referenceId: 11,
      amount: 200,
      metadata: { paymentMethod: 'card', currency: 'EGP' },
    });

    expect(paySvc.ensureSnapshotForPayment).toHaveBeenCalledWith(11, 5001, 'card');
    const emitCall = bus.emit.mock.calls.find((c: any) => c[0] === 'academy:enrollment-paid');
    expect(emitCall).toBeDefined();
    const payload = emitCall[1] as any;
    expect(payload.enrollmentId).toBe(11);
    expect(payload.programId).toBe(1);
    expect(payload.groupId).toBe(2);
    expect(payload.playerId).toBe(200);
    expect(payload.organisationId).toBe(7);
    expect(payload.branchId).toBe(5);
    expect(payload.paymentTransactionId).toBe(5001);
    expect(payload.amount).toBe(200);
    expect(payload.currency).toBe('EGP');
    expect(payload.paymentMethod).toBe('card');
    expect(payload.collector).toBe('courtzon');
  });

  it('does NOT duplicate mutable academy configuration into the event', async () => {
    registerAcademyPaymentListeners();
    await firePaid({
      paymentId: 5001,
      referenceType: 'academy',
      referenceId: 11,
      amount: 200,
      metadata: { paymentMethod: 'card', currency: 'EGP' },
    });
    const emitCall = bus.emit.mock.calls.find((c: any) => c[0] === 'academy:enrollment-paid');
    const payload = emitCall[1] as any;
    for (const key of ['price', 'program_price', 'commission_rate', 'comp_value', 'coach_comp_value', 'court_rental_amount']) {
      expect(Object.prototype.hasOwnProperty.call(payload, key), `payload must not carry ${key}`).toBe(false);
    }
  });

  it('ignores non-academy payments', async () => {
    registerAcademyPaymentListeners();
    await firePaid({
      paymentId: 5002, referenceType: 'booking', referenceId: 99, amount: 100,
      metadata: { paymentMethod: 'card' },
    });
    expect(paySvc.ensureSnapshotForPayment).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalledWith('academy:enrollment-paid', expect.anything());
  });

  it('does not emit when the snapshot is missing after payment', async () => {
    registerAcademyPaymentListeners();
    payRepo.getSnapshotByEnrollment.mockResolvedValue(null);
    await firePaid({
      paymentId: 5001, referenceType: 'academy', referenceId: 11, amount: 200,
      metadata: { paymentMethod: 'card' },
    });
    expect(bus.emit).not.toHaveBeenCalledWith('academy:enrollment-paid', expect.anything());
  });
});