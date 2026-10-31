import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { PaymobGateway } from '../paymob-gateway.js';
import type { GatewayConfig, PaymentRequest } from '../payment-gateway.types.js';

/**
 * P5-05 — Paymob Sandbox lifecycle (OFFLINE ONLY).
 *
 * Scope of this file: exercise the REAL `PaymobGateway` code through the
 * lifecycle shape of a Sandbox transaction — intention creation → checkout URL
 * → webhook verification → status polling → refund → refund-state lookup —
 * while the transport is fully stubbed. `globalThis.fetch` is replaced for
 * every test, so **no request can leave the process**. Assertions also pin
 * every URL to the single allowlisted origin, which is the only host the
 * gateway is permitted to use (see `paymob-sandbox-config.spec.ts`).
 *
 * NOT covered here (deliberately deferred, external dependency):
 *   - a real Sandbox card charge / 3DS redirect / real webhook delivery;
 *   - credential scope (test vs live keys) — cannot be proven locally;
 *   - provider-side refund settlement timing.
 * Those require an explicitly authorised external run and remain BLOCKED.
 */

const ALLOWED_ORIGIN = 'https://accept.paymob.com';
const TEST_HMAC_SECRET = 'p5-05-unit-test-hmac-secret-not-real';

const BASE_CONFIG: GatewayConfig = {
  provider: 'paymob',
  apiKey: 'unit-test-api-key',
  secretKey: 'unit-test-secret-key',
  publicKey: 'unit-test-public-key',
  merchantId: '5663993',
  hmacSecret: TEST_HMAC_SECRET,
  sandbox: true,
};

type FetchCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Route-shaped stub: no test can reach the network because fetch is replaced. */
function stubTransport(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    calls.push({ url, init });
    return handler(url, init);
  });
  return { calls, restore: () => spy.mockRestore() };
}

function gateway(overrides: Partial<GatewayConfig> = {}): PaymobGateway {
  return new PaymobGateway({ ...BASE_CONFIG, ...overrides });
}

function sandboxPaymentRequest(): PaymentRequest {
  return {
    amount: 250.5,
    currency: 'EGP',
    referenceId: 4242,
    referenceType: 'booking',
    customerEmail: 'player@example.test',
    customerPhone: '01000000000',
    customerName: 'Test Player',
    customerAddress: { city: 'Cairo', country: 'EG', street: 'Test Street' },
    returnUrl: 'http://localhost:5173/payments/return',
    idempotencyKey: 'prep-0001',
  };
}

/** Minimal Sandbox-shaped intention response. */
function intentionResponse() {
  return {
    id: 910001,
    intention_order_id: 810001,
    client_secret: 'cs_test_abc123',
  };
}

function authTokenResponse() {
  return { token: 'sandbox-auth-token', profile_id: 1 };
}

/** Intention webhook payload + signature helper (mirrors the gateway contract). */
function intentionWebhook(overrides: { success?: boolean; isRefunded?: boolean; amountCents?: number } = {}) {
  const payload: any = {
    obj: {
      amount_cents: overrides.amountCents ?? 25050,
      created_at: '2026-10-28T10:00:00.000000',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 910001,
      integration_id: 5663993,
      is_3d_secure: true,
      is_auth: false,
      is_capture: true,
      is_refunded: overrides.isRefunded ?? false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 810001 },
      owner: 12345,
      pending: false,
      source_data: { pan: '****', sub_type: 'Visa', type: 'card' },
      success: overrides.success ?? true,
    },
  };
  const obj = payload.obj;
  const concat = [
    obj.amount_cents, obj.created_at, obj.currency, obj.error_occured,
    obj.has_parent_transaction, obj.id, obj.integration_id, obj.is_3d_secure,
    obj.is_auth, obj.is_capture, obj.is_refunded, obj.is_standalone_payment,
    obj.is_voided, obj.order.id, obj.owner, obj.pending,
    obj.source_data.pan, obj.source_data.sub_type, obj.source_data.type, obj.success,
  ].map((v) => v ?? '').join('');
  const signature = createHmac('sha512', TEST_HMAC_SECRET).update(concat).digest('hex');
  return { payload, signature };
}

let restoreFetch: (() => void) | null = null;

afterEach(() => {
  if (restoreFetch) { restoreFetch(); restoreFetch = null; }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('P5-05 Paymob Sandbox lifecycle — charge → checkout (offline)', () => {
  it('creates an intention and returns a checkout URL on the allowlisted origin only', async () => {
    const stub = stubTransport((url) => {
      if (url.endsWith('/v1/intention/')) return jsonResponse(intentionResponse());
      throw new Error(`unexpected URL in charge test: ${url}`);
    });
    restoreFetch = stub.restore;

    const result = await gateway().charge(sandboxPaymentRequest());

    expect(result.success).toBe(true);
    expect(result.status).toBe('pending');
    expect(result.intentionId).toBe('910001');
    expect(result.clientSecret).toBe('cs_test_abc123');
    expect(result.gatewayReference).toBe('810001');
    expect(result.paymentUrl).toContain('/unifiedcheckout/?publicKey=');
    expect(new URL(result.paymentUrl!).origin).toBe(ALLOWED_ORIGIN);

    // Exactly one call, to the allowlisted host, with the documented payload shape.
    expect(stub.calls).toHaveLength(1);
    expect(new URL(stub.calls[0].url).origin).toBe(ALLOWED_ORIGIN);
    const body = JSON.parse(String(stub.calls[0].init?.body));
    expect(body.amount).toBe(25050); // minor units
    expect(body.currency).toBe('EGP');
    expect(body.payment_methods).toEqual([5663993]);
    expect(body.special_reference).toMatch(/^booking_4242_\d+$/);
    expect(body.notification_url).toContain('/payments/webhook');
    expect(String(stub.calls[0].init?.headers && JSON.stringify(stub.calls[0].init?.headers))).not.toContain('unit-test-api-key');
  });

  it('fails closed (no throw) when the intention response lacks id/client_secret', async () => {
    const stub = stubTransport(() => jsonResponse({ detail: 'invalid integration' }));
    restoreFetch = stub.restore;

    const result = await gateway().charge(sandboxPaymentRequest());

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('Paymob intention creation failed');
    expect(stub.calls.every((c) => new URL(c.url).origin === ALLOWED_ORIGIN)).toBe(true);
  });

  it('fails closed (no throw) when the transport rejects', async () => {
    const stub = stubTransport(() => { throw new Error('ECONNREFUSED'); });
    restoreFetch = stub.restore;

    const result = await gateway().charge(sandboxPaymentRequest());

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('ECONNREFUSED');
  });
});

describe('P5-05 Paymob Sandbox lifecycle — webhook (offline)', () => {
  it('accepts a correctly signed intention callback for the lifecycle transaction', async () => {
    const { payload, signature } = intentionWebhook();
    await expect(gateway().verifyWebhook(payload, signature)).resolves.toBe(true);
  });

  it('rejects the same callback when the amount is tampered with', async () => {
    const { payload, signature } = intentionWebhook();
    payload.obj.amount_cents = 1;
    await expect(gateway().verifyWebhook(payload, signature)).resolves.toBe(false);
  });

  it('rejects when no HMAC secret is configured (fail closed)', async () => {
    const { payload, signature } = intentionWebhook();
    await expect(gateway({ hmacSecret: undefined }).verifyWebhook(payload, signature)).resolves.toBe(false);
  });
});

describe('P5-05 Paymob Sandbox lifecycle — status polling (offline)', () => {
  it('maps a paid order to success/paid', async () => {
    const stub = stubTransport((url) => {
      if (url.includes('/api/auth/tokens')) return jsonResponse(authTokenResponse());
      if (url.includes('/api/ecommerce/orders/')) return jsonResponse({ id: 810001, paid: true, status: 'paid' });
      throw new Error(`unexpected URL: ${url}`);
    });
    restoreFetch = stub.restore;

    const result = await gateway().getTransactionStatus('810001', 4242);

    expect(result.success).toBe(true);
    expect(result.status).toBe('paid');
    expect(stub.calls.every((c) => new URL(c.url).origin === ALLOWED_ORIGIN)).toBe(true);
  });

  it('maps a declined order to failed without a second charge attempt', async () => {
    const stub = stubTransport((url) => {
      if (url.includes('/api/auth/tokens')) return jsonResponse(authTokenResponse());
      if (url.includes('/api/ecommerce/orders/')) return jsonResponse({ id: 810001, paid: false, status: 'failed' });
      throw new Error(`unexpected URL: ${url}`);
    });
    restoreFetch = stub.restore;

    const result = await gateway().getTransactionStatus('810001', 4242);

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    // status polling must never POST a charge/intention
    expect(stub.calls.some((c) => c.url.includes('/v1/intention/'))).toBe(false);
  });

  it('reports pending (not failed) for an inconclusive response', async () => {
    const stub = stubTransport((url) => {
      if (url.includes('/api/auth/tokens')) return jsonResponse(authTokenResponse());
      if (url.includes('/api/ecommerce/orders/')) return jsonResponse({ id: 810001, paid: false, status: 'pending' });
      throw new Error(`unexpected URL: ${url}`);
    });
    restoreFetch = stub.restore;

    const result = await gateway().getTransactionStatus('810001', 4242);

    expect(result.success).toBe(false);
    expect(result.status).toBe('pending');
  });
});

describe('P5-05 Paymob Sandbox lifecycle — refund and refund-state recovery (offline)', () => {
  it('performs a refund and returns the provider refund id', async () => {
    const stub = stubTransport((url) => {
      if (url.includes('/api/auth/tokens')) return jsonResponse(authTokenResponse());
      if (url.includes('/api/acceptance/void_refund/refund')) return jsonResponse({ id: 770011, success: true });
      throw new Error(`unexpected URL: ${url}`);
    });
    restoreFetch = stub.restore;

    const result = await gateway().refund({ transactionId: '910001', amount: 250.5, reason: 'sandbox lifecycle test' } as any);

    expect(result.success).toBe(true);
    expect(result.refundId).toBe('770011');
    expect(result.status).toBe('processed');
    const refundCall = stub.calls.find((c) => c.url.includes('/void_refund/refund'))!;
    const body = JSON.parse(String(refundCall.init?.body));
    expect(body.amount_cents).toBe(25050);
    expect(body.transaction_id).toBe(910001);
    expect(stub.calls.every((c) => new URL(c.url).origin === ALLOWED_ORIGIN)).toBe(true);
  });

  it('fails closed when the refund response carries no id', async () => {
    const stub = stubTransport((url) => {
      if (url.includes('/api/auth/tokens')) return jsonResponse(authTokenResponse());
      if (url.includes('/api/acceptance/void_refund/refund')) return jsonResponse({ message: 'refund declined' });
      throw new Error(`unexpected URL: ${url}`);
    });
    restoreFetch = stub.restore;

    const result = await gateway().refund({ transactionId: '910001', amount: 250.5 } as any);

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('declined');
  });

  it('recovers a fully refunded state from the filtered transaction lookup', async () => {
    const stub = stubTransport((url) => {
      if (url.includes('/api/auth/tokens')) return jsonResponse(authTokenResponse());
      if (url.includes('/api/acceptance/transactions?order_id=810001')) {
        return jsonResponse({
          results: [
            {
              id: 910001,
              order: { id: 810001 },
              is_refund: false,
              refunded_amount_cents: 25050,
              amount_cents: 25050,
              payment_status: 'refunded',
            },
            // Refund child must never be selected as the match target.
            { id: 910002, order: { id: 810001 }, is_refund: true, refunded_amount_cents: 25050 },
          ],
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    restoreFetch = stub.restore;

    const state = await gateway().getRefundState('810001');

    expect(state.outcome).toBe('refunded');
    expect(state.refundedCents).toBe(25050);
    expect(state.isFullyRefunded).toBe(true);
    expect(stub.calls.every((c) => new URL(c.url).origin === ALLOWED_ORIGIN)).toBe(true);
  });

  it('returns unknown (fail closed) for a non-numeric reference without any call', async () => {
    const stub = stubTransport(() => jsonResponse({}));
    restoreFetch = stub.restore;

    const state = await gateway().getRefundState('sandbox_prepare_abc');

    expect(state.outcome).toBe('unknown');
    expect(stub.calls).toHaveLength(0);
  });
});

describe('P5-05 Paymob Sandbox lifecycle — transport containment', () => {
  it('never leaves the allowlisted origin across a full simulated lifecycle', async () => {
    const stub = stubTransport((url) => {
      if (url.endsWith('/v1/intention/')) return jsonResponse(intentionResponse());
      if (url.includes('/api/auth/tokens')) return jsonResponse(authTokenResponse());
      if (url.includes('/api/ecommerce/orders/')) return jsonResponse({ id: 810001, paid: true, status: 'paid' });
      if (url.includes('/void_refund/refund')) return jsonResponse({ id: 770011 });
      if (url.includes('/api/acceptance/transactions')) {
        return jsonResponse({
          results: [
            { id: 910001, order: { id: 810001 }, is_refund: false, refunded_amount_cents: 25050, amount_cents: 25050 },
          ],
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    restoreFetch = stub.restore;

    const gw = gateway();
    const charge = await gw.charge(sandboxPaymentRequest());
    const webhook = await gw.verifyWebhook(...Object.values(intentionWebhook()) as [any, string]);
    const status = await gw.getTransactionStatus('810001', 4242);
    const refund = await gw.refund({ transactionId: '910001', amount: 250.5 } as any);
    const state = await gw.getRefundState('810001');

    expect(charge.success).toBe(true);
    expect(webhook).toBe(true);
    expect(status.status).toBe('paid');
    expect(refund.success).toBe(true);
    expect(state.outcome).toBe('refunded');

    expect(stub.calls.length).toBeGreaterThan(0);
    for (const call of stub.calls) {
      expect(new URL(call.url).origin).toBe(ALLOWED_ORIGIN);
    }
  });

  it('rejects a disallowed base URL override before any transport use', async () => {
    const stub = stubTransport(() => jsonResponse({}));
    restoreFetch = stub.restore;

    expect(() => gateway({ baseUrl: 'https://accept.paymobsandbox.com' })).toThrow(/disallowed|invalid/);
    expect(stub.calls).toHaveLength(0);
  });
});
