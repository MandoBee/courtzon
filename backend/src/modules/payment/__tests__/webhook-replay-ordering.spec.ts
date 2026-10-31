import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P5-03 — B39 webhook replay ordering.
 *
 * Current implementation writes the Redis replay key BEFORE resolving or
 * processing the payment. These tests establish the behaviour:
 *   - a processing failure leaves the replay key behind, so the gateway's retry
 *     is answered as a duplicate and never processed;
 *   - with Redis unavailable, the dedupe is skipped and processing continues.
 *
 * No fix is applied in P5-03; this is characterization evidence for B39.
 */

const mocks = vi.hoisted(() => {
  const get = vi.fn();
  const set = vi.fn();
  return {
    get,
    set,
    findByGatewayRef: vi.fn(),
    callOrder: [] as string[],
  };
});

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn(() => ({ execute: vi.fn(), query: vi.fn() })) }));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: () => ({ get: mocks.get, set: mocks.set }),
}));
vi.mock('../../wallet/application/wallet.service.js', () => ({ walletService: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: vi.fn(), on: vi.fn() } }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: vi.fn() } }));
vi.mock('../commands/process-payment.command.js', () => ({ processPaymentHandler: {} }));
vi.mock('../../../shared/services/gateway/gateway-factory.js', () => ({
  paymentGateway: {
    provider: 'paymob',
    verifyWebhook: vi.fn(async () => true),
    getTransactionStatus: vi.fn(),
  },
}));
vi.mock('../infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: {
    findByGatewayRef: mocks.findByGatewayRef,
    findByWebhookCorrelation: vi.fn(async () => null),
    findByReference: vi.fn(async () => null),
    persistGatewayReference: vi.fn(async () => true),
    lockByGatewayRef: vi.fn(async () => null),
    findById: vi.fn(async () => null),
  },
}));

import { PaymentService } from '../application/payment.service.js';

const PAYLOAD = { obj: { id: 'gw-1', success: true, pending: false } };

let svc: PaymentService;
const store = new Map<string, string>();

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  mocks.callOrder.length = 0;
  svc = new PaymentService();

  mocks.get.mockImplementation(async (key: string) => {
    const value = store.get(key) ?? null;
    mocks.callOrder.push(`redis:get:${value ?? 'null'}`);
    return value;
  });
  mocks.set.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
    mocks.callOrder.push('redis:set');
    return 'OK';
  });
  mocks.findByGatewayRef.mockImplementation(async () => {
    mocks.callOrder.push('repo:find');
    return null;
  });
});

describe('P5-03 B39 webhook replay ordering (characterization)', () => {
  it('marks the replay key BEFORE any payment lookup (current ordering)', async () => {
    await expect(svc.handleWebhook(PAYLOAD, 'sig')).rejects.toThrow(/Payment transaction/);

    const setIdx = mocks.callOrder.indexOf('redis:set');
    const repoIdx = mocks.callOrder.indexOf('repo:find');
    expect(setIdx).toBeGreaterThanOrEqual(0);
    expect(repoIdx).toBeGreaterThan(setIdx);
  });

  it('a processing failure leaves the key behind, so the retry is skipped as a duplicate', async () => {
    mocks.findByGatewayRef.mockImplementationOnce(async () => {
      mocks.callOrder.push('repo:find');
      throw new Error('database unavailable');
    });

    await expect(svc.handleWebhook(PAYLOAD, 'sig')).rejects.toThrow(/database unavailable/);
    expect(mocks.findByGatewayRef).toHaveBeenCalledTimes(1);
    expect(store.get('webhook:processed:gw-1')).toBe('1');

    // The gateway retries the same webhook: replay protection answers duplicate
    // and the repository is never asked again — the payment stays unprocessed.
    const retry = await svc.handleWebhook(PAYLOAD, 'sig');
    expect(retry).toEqual({ received: true, note: 'duplicate (replay protected)' });
    expect(mocks.findByGatewayRef).toHaveBeenCalledTimes(1);
  });

  it('a duplicate delivery (key already present) returns duplicate without processing', async () => {
    store.set('webhook:processed:gw-1', '1');

    const result = await svc.handleWebhook(PAYLOAD, 'sig');

    expect(result).toEqual({ received: true, note: 'duplicate (replay protected)' });
    expect(mocks.findByGatewayRef).not.toHaveBeenCalled();
  });

  it('Redis unavailable skips replay dedupe and continues processing (no key is stored)', async () => {
    mocks.get.mockRejectedValueOnce(new Error('redis down'));

    // Processing continues past replay protection; the unknown reference then
    // fails with the normal NotFound path (not a Redis error).
    await expect(svc.handleWebhook(PAYLOAD, 'sig')).rejects.toThrow(/Payment transaction/);

    expect(mocks.findByGatewayRef).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(0);
  });
});
