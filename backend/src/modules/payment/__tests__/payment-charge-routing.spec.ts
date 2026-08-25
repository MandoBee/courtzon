import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set required env vars BEFORE any imports that trigger env.ts
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'courtzon2026';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.PAYMENT_GATEWAY_PROVIDER = 'paymob';
process.env.PAYMOB_API_KEY = 'test';
process.env.PAYMOB_SECRET = 'test';
process.env.PAYMOB_PUBLIC_KEY = 'test_pk';
process.env.PAYMOB_MERCHANT_ID = '12345';
process.env.NODE_ENV = 'test';

const mockGatewayCharge = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({ getRedisClient: vi.fn() }));
vi.mock('../../wallet/application/wallet.service.js', () => ({ walletService: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: vi.fn() } }));
vi.mock('../commands/process-payment.command.js', () => ({ processPaymentHandler: {} }));
vi.mock('../../../shared/services/gateway/gateway-factory.js', () => ({
  paymentGateway: {
    provider: 'paymob',
    charge: mockGatewayCharge,
  },
}));
vi.mock('../infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: {
    create: vi.fn().mockResolvedValue({ id: 100 }),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
  },
}));

import { PaymentService } from '../application/payment.service.js';

let svc: PaymentService;

beforeEach(() => {
  vi.clearAllMocks();
  svc = new PaymentService();
});

describe('PaymentService.charge() routing — card payments must reach the gateway', () => {
  it('card payment returns clientSecret and paymentUrl from the real gateway', async () => {
    mockGatewayCharge.mockResolvedValue({
      success: true,
      transactionId: 'gw_txn_1',
      gatewayReference: 'gw_ref_1',
      clientSecret: 'csk_test_abc123',
      intentionId: 'int_1',
      paymentUrl: 'https://accept.paymob.com/unifiedcheckout/?clientSecret=csk_test_abc123',
      status: 'pending',
      rawResponse: { id: 1, client_secret: 'csk_test_abc123' },
    });

    const result = await svc.charge(1, {
      referenceType: 'order',
      referenceId: 42,
      amount: 100,
      currency: 'EGP',
      paymentMethod: 'card',
      returnUrl: 'https://example.com/return',
    });

    expect(result.success).toBe(true);
    expect((result as any).clientSecret).toBe('csk_test_abc123');
    expect((result as any).paymentUrl).toContain('accept.paymob.com');
    expect((result as any).paymentId).toBe(100);
    expect(mockGatewayCharge).toHaveBeenCalledTimes(1);
  });

  it('card payment with gateway failure returns success: false with error details', async () => {
    mockGatewayCharge.mockResolvedValue({
      success: false,
      transactionId: '',
      status: 'failed',
      errorMessage: 'Insufficient funds',
    });

    const result = await svc.charge(1, {
      referenceType: 'order',
      referenceId: 55,
      amount: 500,
      currency: 'EGP',
      paymentMethod: 'card',
    });

    expect(result.success).toBe(false);
    expect((result as any).errorMessage).toBe('Insufficient funds');
    expect(mockGatewayCharge).toHaveBeenCalledTimes(1);
  });

  it('card payment never reaches chargeV2 (which lacks gateway integration)', async () => {
    mockGatewayCharge.mockResolvedValue({
      success: true,
      transactionId: 'gw_txn_3',
      clientSecret: 'csk_test_verify',
      paymentUrl: 'https://accept.paymob.com/unifiedcheckout/?clientSecret=csk_test_verify',
      status: 'pending',
      rawResponse: { id: 3 },
    });

    const result = await svc.charge(1, {
      referenceType: 'order',
      referenceId: 99,
      amount: 50,
      currency: 'EGP',
      paymentMethod: 'card',
    });

    // If chargeV2 ran, these would be undefined — the exact bug we fixed
    expect((result as any).clientSecret).toBeDefined();
    expect((result as any).paymentUrl).toBeDefined();
    expect(mockGatewayCharge).toHaveBeenCalled();
  });
});
