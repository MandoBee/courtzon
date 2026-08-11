import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: { emit: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../../../shared/command/command-pipeline.js', () => ({
  commandPipeline: { execute: vi.fn() },
}));
vi.mock('../../../shared/utils/feature-flags.js', () => ({
  isFeatureEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock('../../../shared/services/gateway/gateway-factory.js', () => ({
  paymentGateway: { provider: 'test-gateway' },
}));
vi.mock('../../../database/database.transaction.js', () => ({
  withTransaction: vi.fn(),
}));
vi.mock('../../wallet/application/wallet.service.js', () => ({ walletService: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: {},
}));
vi.mock('../commands/process-payment.command.js', () => ({
  processPaymentHandler: vi.fn(),
}));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: vi.fn(),
}));

import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { PaymentService } from '../application/payment.service.js';

const JOURNAL_INSERT = 'INSERT INTO financial_journal_entries';

function makeTransaction(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    user_id: 999,
    order_id: null,
    booking_id: 42,
    reference_type: 'booking',
    payment_status: 'pending',
    payment_method: 'wallet',
    currency_code: 'EGP',
    amount: 100,
    gateway_reference: 'g-ref',
    ...overrides,
  };
}

function makeConn() {
  const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  return { execute };
}

describe('Payment journal guard (wallet top-ups must never create Cash→Revenue)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a Cash→Revenue journal for normal bookings', async () => {
    const service = new PaymentService();
    const conn = makeConn();
    await (service as any)._processPaymentOutcome(conn, makeTransaction(), 'paid', 'g-ref', 'trace-1', 'webhook');
    const journalCalls = conn.execute.mock.calls.filter((c: any[]) => String(c[0]).includes(JOURNAL_INSERT));
    expect(journalCalls).toHaveLength(1);
    const params = journalCalls[0][1];
    expect(params[1]).toBe('gateway_webhook');
    expect(params[3]).toBe('Cash');
    expect(params[4]).toBe('Revenue');
  });

  it('skips the journal entirely for wallet_topup reference type', async () => {
    const service = new PaymentService();
    const conn = makeConn();
    await (service as any)._processPaymentOutcome(
      conn, makeTransaction({ reference_type: 'wallet_topup' }), 'paid', 'g-ref', 'trace-2', 'webhook',
    );
    const journalCalls = conn.execute.mock.calls.filter((c: any[]) => String(c[0]).includes(JOURNAL_INSERT));
    expect(journalCalls).toHaveLength(0);
  });

  it('still emits payment events for wallet_topup outcomes', async () => {
    const service = new PaymentService();
    const conn = makeConn();
    await (service as any)._processPaymentOutcome(
      conn, makeTransaction({ reference_type: 'wallet_topup' }), 'paid', 'g-ref', 'trace-3', 'webhook',
    );
    expect(eventBusV2.emit).toHaveBeenCalledWith('payment:succeeded', expect.anything(), undefined, conn);
  });
});
