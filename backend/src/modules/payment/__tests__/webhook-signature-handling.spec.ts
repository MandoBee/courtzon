import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P5-02 — invalid webhook signature must fail before any payment-state read/write
 * or downstream event. The HMAC computation itself is covered by
 * `shared/services/gateway/__tests__/paymob-webhook-hmac.spec.ts`; here the
 * gateway verifier is mocked to return false so the test is deterministic and
 * never contacts Paymob.
 */

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(async () => false),
  findByGatewayRef: vi.fn(async () => null),
  findById: vi.fn(async () => null),
  emit: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: vi.fn(() => ({ execute: vi.fn(), query: vi.fn(), getConnection: vi.fn() })),
  closePool: vi.fn(),
}));

vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: vi.fn(() => ({ get: vi.fn(async () => null), set: vi.fn(async () => 'OK') })),
}));

vi.mock('../../../shared/services/gateway/gateway-factory.js', () => ({
  paymentGateway: {
    provider: 'paymob',
    verifyWebhook: mocks.verifyWebhook,
  },
  createPaymentGateway: vi.fn(),
}));

vi.mock('../infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: {
    findByGatewayRef: mocks.findByGatewayRef,
    findById: mocks.findById,
    findByWebhookCorrelation: vi.fn(async () => null),
    findByReference: vi.fn(async () => null),
    persistGatewayReference: vi.fn(async () => true),
    lockByGatewayRef: vi.fn(async () => null),
    idempotency: {},
  },
}));

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    emit: mocks.emit,
    on: vi.fn(),
    subscribe: vi.fn(),
  },
}));

import { paymentService } from '../application/payment.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyWebhook.mockResolvedValue(false);
});

describe('P5-02 invalid signature — no payment side effects', () => {
  it('throws Invalid webhook signature and performs no repository read', async () => {
    const payload = { obj: { id: 1001, success: true, pending: false } };

    await expect(paymentService.handleWebhook(payload, 'invalid-signature')).rejects.toThrow(
      /Invalid webhook signature/i,
    );

    expect(mocks.verifyWebhook).toHaveBeenCalledTimes(1);
    expect(mocks.verifyWebhook).toHaveBeenCalledWith(payload, 'invalid-signature');
    expect(mocks.findByGatewayRef).not.toHaveBeenCalled();
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('emits no payment:succeeded / payment:completed / payment:failed / payment:failed-event', async () => {
    await expect(
      paymentService.handleWebhook({ amount_cents: 100, success: true }, ''),
    ).rejects.toThrow(/Invalid webhook signature/i);

    expect(mocks.emit).not.toHaveBeenCalled();
    const emittedNames = mocks.emit.mock.calls.map((c) => String(c[0]));
    expect(emittedNames).not.toContain('payment:succeeded');
    expect(emittedNames).not.toContain('payment:completed');
    expect(emittedNames).not.toContain('payment:failed-event');
    expect(emittedNames).not.toContain('payment:failed');
  });

  it('rejects a valid-signature-shaped payload too when the verifier says false (no fallback path)', async () => {
    mocks.verifyWebhook.mockResolvedValueOnce(false);
    const payload = { obj: { id: 'intention-order-1', success: true, pending: false } };

    await expect(paymentService.handleWebhook(payload, 'a'.repeat(128))).rejects.toThrow(
      /Invalid webhook signature/i,
    );
    expect(mocks.findByGatewayRef).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });
});
