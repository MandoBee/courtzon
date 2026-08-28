import { describe, it, expect, vi } from 'vitest';

/**
 * W2 — reserved funds are never spendable.
 *
 * chargeByWallet previously validated availability against `balance` only, so a
 * wallet could spend funds that were already reserved for an in-flight
 * withdrawal (reserved_balance >= 0). When the withdrawal later debited
 * reserved_balance it could drive balance negative, and a rejection failed to
 * release funds that had been spent — a false available-balance + double-spend.
 *
 * The fix: lockAndGetBalance now also returns reserved_balance and the spend
 * gate is available = balance − reserved_balance (order still debits the full
 * balance, since the reservation stays untouched until the withdrawal settles).
 */

const walletRepo = vi.hoisted(() => ({
  findByUserId: vi.fn(),
  lockAndGetBalance: vi.fn(),
  updateBalance: vi.fn(),
  createTransaction: vi.fn(),
}));

const paymentRepo = vi.hoisted(() => ({
  findByIdempotencyKey: vi.fn(),
  create: vi.fn(),
  lockById: vi.fn(),
}));

const transactionService = vi.hoisted(() => ({ createWalletPayment: vi.fn() }));
const gatewayMock = vi.hoisted(() => ({ provider: 'mock-gateway', refund: vi.fn(), charge: vi.fn() }));
const eventBus = vi.hoisted(() => ({ emit: vi.fn(), on: vi.fn() }));
const connExecute = vi.hoisted(() => vi.fn(async () => [[{ affectedRows: 1 }], []]));

vi.mock('../../../shared/services/gateway/gateway-factory.js', () => ({ paymentGateway: gatewayMock }));
vi.mock('../../wallet/application/wallet.service.js', () => ({ walletService: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: walletRepo }));
vi.mock('../infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: paymentRepo }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService }));
vi.mock('../../../database/database.transaction.js', () => ({
  withTransaction: vi.fn(async (cb: any) => cb({ execute: connExecute })),
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({}) }));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({ getRedisClient: vi.fn() }));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBus }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: vi.fn() } }));
vi.mock('../../../shared/utils/feature-flags.js', () => ({ isFeatureEnabled: vi.fn(async () => false) }));
vi.mock('../commands/process-payment.command.js', () => ({ processPaymentHandler: { execute: vi.fn() } }));

const { PaymentService } = await import('../application/payment.service.js');

const baseInput = {
  amount: 100,
  referenceType: 'booking',
  referenceId: 5,
  paymentMethod: 'wallet',
  currency: 'EGP',
};

describe('W2 — chargeByWallet respects reserved funds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentRepo.findByIdempotencyKey.mockResolvedValue(null);
    paymentRepo.create.mockResolvedValue({ id: 77 });
    paymentRepo.lockById.mockResolvedValue({
      id: 77, user_id: 5, payment_status: 'pending', reference_type: 'booking',
      reference_id: 5, order_id: null, booking_id: 5,
      gateway_reference: 'wallet_gw', payment_method: 'wallet', currency_code: 'EGP',
    });
    connExecute.mockImplementation(async () => [[{ affectedRows: 1 }], []]);
  });

  it('rejects a charge when available (balance − reserved_balance) < amount', async () => {
    walletRepo.findByUserId.mockResolvedValue({ id: 11, user_id: 5, balance: 1000, reserved_balance: 950, version: 1 });
    walletRepo.lockAndGetBalance.mockResolvedValue({ balance: 1000, reserved_balance: 950, version: 1 });

    const svc = new PaymentService();
    await expect(svc.charge(5, baseInput as any)).rejects.toThrow(/Insufficient available wallet balance/);
    expect(walletRepo.updateBalance).not.toHaveBeenCalled();
  });

  it('allows a charge when available covers the amount (debits full balance, not available)', async () => {
    walletRepo.findByUserId.mockResolvedValue({ id: 11, user_id: 5, balance: 1000, reserved_balance: 200, version: 1 });
    walletRepo.lockAndGetBalance.mockResolvedValue({ balance: 1000, reserved_balance: 200, version: 1 });
    walletRepo.updateBalance.mockResolvedValue(true);

    const svc = new PaymentService();
    const res = await svc.charge(5, baseInput as any);
    expect(res.success).toBe(true);
    // The spend debits the raw balance (1000 − 100). Reserved funds stay
    // reserved — they are untouched until the withdrawal settles.
    expect(walletRepo.updateBalance).toHaveBeenCalledWith(11, 900, 1, expect.anything());
  });

  it('allows a charge when nothing is reserved (compat with zero/legacy wallets)', async () => {
    walletRepo.findByUserId.mockResolvedValue({ id: 11, user_id: 5, balance: 500, reserved_balance: 0, version: 1 });
    walletRepo.lockAndGetBalance.mockResolvedValue({ balance: 500, reserved_balance: 0, version: 1 });
    walletRepo.updateBalance.mockResolvedValue(true);

    const svc = new PaymentService();
    const res = await svc.charge(5, baseInput as any);
    expect(res.success).toBe(true);
  });
});