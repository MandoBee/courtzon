import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P5-03 — gateway failure/retry, duplicate charge and idempotency behaviour.
 *
 * Deterministic unit tests with a mocked gateway and repository. No provider
 * call and no database access.
 *
 * B38: `chargeByGateway()` performs the idempotency lookup, then calls the
 * gateway, and only afterwards inserts the local row. These tests establish the
 * current behaviour under concurrency; they CHARACTERIZE the risk (two gateway
 * charges for one idempotency key) and do not claim a fix.
 */

const mocks = vi.hoisted(() => ({
  gatewayCharge: vi.fn(),
  gatewayStatus: vi.fn(),
  findByIdempotencyKey: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  lockById: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn(() => ({ execute: vi.fn(), query: vi.fn() })) }));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({ getRedisClient: vi.fn() }));
vi.mock('../../wallet/application/wallet.service.js', () => ({ walletService: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: mocks.emit, on: vi.fn() } }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: vi.fn() } }));
vi.mock('../commands/process-payment.command.js', () => ({ processPaymentHandler: {} }));
vi.mock('../../../shared/services/gateway/gateway-factory.js', () => ({
  paymentGateway: {
    provider: 'paymob',
    charge: mocks.gatewayCharge,
    getTransactionStatus: mocks.gatewayStatus,
  },
}));
vi.mock('../infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: {
    create: mocks.create,
    findByIdempotencyKey: mocks.findByIdempotencyKey,
    findById: mocks.findById,
    lockById: mocks.lockById,
  },
}));

import { PaymentService } from '../application/payment.service.js';

const CHARGE = {
  referenceType: 'academy' as const,
  referenceId: 55,
  amount: 250,
  currency: 'EGP',
  paymentMethod: 'card' as const,
  idempotencyKey: 'key-abc-123',
};

const GATEWAY_OK = {
  success: true,
  transactionId: 'int_1',
  gatewayReference: 'gref_1',
  clientSecret: 'cs_test',
  intentionId: 'int_1',
  status: 'pending' as const,
  rawResponse: { id: 'int_1' },
};

let svc: PaymentService;

beforeEach(() => {
  vi.clearAllMocks();
  svc = new PaymentService();
  mocks.findByIdempotencyKey.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: 900 });
  mocks.gatewayCharge.mockResolvedValue(GATEWAY_OK);
});

describe('P5-03 charge failure / timeout', () => {
  it('explicit gateway failure returns success:false and creates no local row', async () => {
    mocks.gatewayCharge.mockResolvedValueOnce({
      success: false,
      transactionId: '',
      status: 'failed',
      errorMessage: 'declined',
    });

    const result = await svc.charge(1, CHARGE);

    expect(result.success).toBe(false);
    expect((result as any).errorMessage).toBe('declined');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('a gateway throw (timeout/network) propagates and creates no local row', async () => {
    mocks.gatewayCharge.mockRejectedValueOnce(new Error('gateway timeout'));

    await expect(svc.charge(1, CHARGE)).rejects.toThrow(/gateway timeout/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('gateway success followed by a local insert failure leaves an un-compensated gateway charge (current behaviour)', async () => {
    mocks.create.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(svc.charge(1, CHARGE)).rejects.toThrow(/database unavailable/);
    expect(mocks.gatewayCharge).toHaveBeenCalledTimes(1);
    // No compensation/refund call exists in this path.
    expect((mocks.gatewayCharge as any).mock.calls).toHaveLength(1);
  });
});

describe('P5-03 duplicate charge / idempotency', () => {
  it('a paid idempotency key returns the existing payment without calling the gateway', async () => {
    mocks.findByIdempotencyKey.mockResolvedValueOnce({ id: 7, payment_status: 'paid' });

    const result = await svc.charge(1, CHARGE);

    expect(result).toMatchObject({ success: true, paymentId: 7, status: 'paid' });
    expect(mocks.gatewayCharge).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('a pending idempotency key returns the existing pending payment without calling the gateway', async () => {
    mocks.findByIdempotencyKey.mockResolvedValueOnce({ id: 8, payment_status: 'pending' });

    const result = await svc.charge(1, CHARGE);

    expect(result).toMatchObject({ success: true, paymentId: 8, status: 'pending' });
    expect(mocks.gatewayCharge).not.toHaveBeenCalled();
  });

  it('B38 CHARACTERIZATION: two concurrent same-key charges both reach the gateway before either row is persisted', async () => {
    // Both calls must pass the pre-check before the gateway resolves, forcing
    // the real overlap window.
    let releaseGateway!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGateway = resolve; });
    mocks.gatewayCharge.mockImplementation(async () => {
      await gate;
      return GATEWAY_OK;
    });

    // Simulate the DB unique key: the first insert wins, the second conflicts.
    let inserts = 0;
    mocks.create.mockImplementation(async () => {
      inserts += 1;
      if (inserts === 1) return { id: 901 };
      throw Object.assign(new Error('Duplicate entry for key uk_idempotency_key'), { code: 'ER_DUP_ENTRY' });
    });

    const p1 = svc.charge(1, CHARGE);
    const p2 = svc.charge(1, CHARGE);

    // Both pre-checks completed without an existing row, so both are waiting on
    // the gateway before any local insert happens.
    await vi.waitFor(() => expect(mocks.gatewayCharge).toHaveBeenCalledTimes(2));
    expect(mocks.create).not.toHaveBeenCalled();

    releaseGateway();
    const results = await Promise.allSettled([p1, p2]);

    // Current behaviour: TWO gateway charges for ONE idempotency key; only the
    // second LOCAL insert is rejected. This is B38, not a fix.
    expect(mocks.gatewayCharge).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('a duplicate local insert after a gateway charge surfaces ER_DUP_ENTRY (gateway reference/idempotency conflict)', async () => {
    mocks.create.mockRejectedValueOnce(
      Object.assign(new Error('Duplicate entry for key uq_gateway_reference'), { code: 'ER_DUP_ENTRY' }),
    );

    await expect(svc.charge(1, CHARGE)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    expect(mocks.gatewayCharge).toHaveBeenCalledTimes(1);
  });
});

describe('P5-03 confirmation retries and final-state transitions', () => {
  it('confirmPayment on an already-paid payment is idempotent and does not call the gateway', async () => {
    mocks.findById.mockResolvedValueOnce({ id: 12, payment_status: 'paid', gateway_reference: 'gref_12' });

    const result = await svc.confirmPayment(12);

    expect(result).toMatchObject({ confirmed: true, idempotent: true, paymentStatus: 'paid' });
    expect(mocks.gatewayStatus).not.toHaveBeenCalled();
  });

  it('confirmPayment on a missing payment throws NotFound', async () => {
    mocks.findById.mockResolvedValueOnce(null);
    await expect(svc.confirmPayment(404)).rejects.toThrow(/Payment transaction/);
  });

  it('_processPaymentOutcome skips an already-final transaction (retry after success)', async () => {
    const fakeConn = { execute: vi.fn() } as any;
    const result = await (svc as any)._processPaymentOutcome(
      fakeConn,
      { id: 1, payment_status: 'paid' },
      'paid',
      'gref',
      'trace',
      'manual',
    );

    expect(result).toEqual({ idempotent: true });
    expect(fakeConn.execute).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('_processPaymentOutcome does nothing when a concurrent update already won', async () => {
    const fakeConn = {
      execute: vi.fn().mockResolvedValueOnce([{ affectedRows: 0 }, []]),
    } as any;

    const result = await (svc as any)._processPaymentOutcome(
      fakeConn,
      { id: 1, payment_status: 'pending' },
      'paid',
      'gref',
      'trace',
      'webhook',
    );

    expect(result).toEqual({ idempotent: true });
    expect(fakeConn.execute).toHaveBeenCalledTimes(1);
    expect(mocks.emit).not.toHaveBeenCalled();
  });
});
