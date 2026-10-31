import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { PaymobGateway } from '../paymob-gateway.js';
import type { GatewayConfig } from '../payment-gateway.types.js';

/**
 * P5-02 — Paymob webhook HMAC verification (unit, no network).
 *
 * The tests follow the EXACT field list and serialization used by
 * `PaymobGateway.verifyWebhook` (values in the official Paymob order, `?? ''`,
 * concatenated with no separators, HMAC-SHA512 with the merchant HMAC secret):
 *   - Intention callback: 20 values from `payload.obj` (+ `obj.order.id`,
 *     `obj.source_data.*`);
 *   - Accept callback: 22 values from the flat payload (+ `order.*`,
 *     `source_data.*`).
 * These are local fixtures with a fake secret; no provider is contacted and no
 * production credentials are used.
 */

const TEST_SECRET = 'unit-test-hmac-secret-not-real';
const BASE_CONFIG: GatewayConfig = {
  provider: 'paymob',
  apiKey: 'unit-test-api-key',
  secretKey: 'unit-test-secret-key',
  publicKey: 'unit-test-public-key',
  merchantId: '000000',
  hmacSecret: TEST_SECRET,
  sandbox: true,
};

function gateway(config: Partial<GatewayConfig> = {}): PaymobGateway {
  return new PaymobGateway({ ...BASE_CONFIG, ...config });
}

function sign(values: unknown[]): string {
  const concat = values.map((v) => v ?? '').join('');
  return createHmac('sha512', TEST_SECRET).update(concat).digest('hex');
}

/** Official Paymob intention order (must match paymob-gateway.ts:355-376). */
function intentionValues(p: any): unknown[] {
  const obj = p.obj;
  const order = obj.order ?? {};
  const source = obj.source_data ?? {};
  return [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    order.id,
    obj.owner,
    obj.pending,
    source.pan,
    source.sub_type,
    source.type,
    obj.success,
  ];
}

/** Official Paymob Accept order (must match paymob-gateway.ts:395-408). */
function acceptValues(p: any): unknown[] {
  const order = p.order ?? {};
  const source = p.source_data ?? {};
  return [
    p.amount_cents,
    p.created_at,
    p.currency,
    p.error_occured,
    p.has_parent_transaction,
    p.id,
    p.integration_id,
    p.is_3d_secure,
    p.is_auth,
    p.is_capture,
    p.is_refunded,
    p.is_standalone_payment,
    p.is_voided,
    order.id,
    order.created_at,
    order.merchant_order_id,
    p.owner,
    p.pending,
    p.refunded_amount_cents,
    source.pan,
    source.sub_type,
    source.type,
    p.success,
  ];
}

function intentionPayload(): any {
  return {
    obj: {
      amount_cents: 12345,
      created_at: '2026-01-02T03:04:05.123456',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 987654,
      integration_id: 4242,
      is_3d_secure: true,
      is_auth: false,
      is_capture: true,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 555111 },
      owner: 777,
      pending: false,
      source_data: { pan: '4111111111111111', sub_type: 'MasterCard', type: 'card' },
      success: true,
    },
  };
}

function acceptPayload(): any {
  return {
    amount_cents: 55500,
    created_at: '2026-02-03T04:05:06.654321',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 112233,
    integration_id: 4343,
    is_3d_secure: true,
    is_auth: false,
    is_capture: true,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 666222, created_at: '2026-02-03T04:05:00.000000', merchant_order_id: 'order_42_123' },
    owner: 888,
    pending: false,
    refunded_amount_cents: 0,
    source_data: { pan: '5555555555554444', sub_type: 'Visa', type: 'card' },
    success: true,
  };
}

function setPath(obj: any, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts.slice(0, -1)) cur = cur[part];
  cur[parts[parts.length - 1]] = value;
}

function mutate(payload: any, path: string): any {
  const copy = structuredClone(payload);
  const parts = path.split('.');
  let cur: any = copy;
  for (const part of parts.slice(0, -1)) cur = cur[part];
  const key = parts[parts.length - 1];
  const old = cur[key];
  cur[key] = typeof old === 'boolean' ? !old : typeof old === 'number' ? old + 1 : `${old}-mutated`;
  return copy;
}

const INTENTION_PATHS = [
  'obj.amount_cents', 'obj.created_at', 'obj.currency', 'obj.error_occured',
  'obj.has_parent_transaction', 'obj.id', 'obj.integration_id', 'obj.is_3d_secure',
  'obj.is_auth', 'obj.is_capture', 'obj.is_refunded', 'obj.is_standalone_payment',
  'obj.is_voided', 'obj.order.id', 'obj.owner', 'obj.pending', 'obj.source_data.pan',
  'obj.source_data.sub_type', 'obj.source_data.type', 'obj.success',
];

const ACCEPT_PATHS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
  'is_standalone_payment', 'is_voided', 'order.id', 'order.created_at',
  'order.merchant_order_id', 'owner', 'pending', 'refunded_amount_cents',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
];

afterEach(() => vi.restoreAllMocks());

describe('P5-02 Paymob Intention webhook HMAC', () => {
  it('accepts the signature computed over the exact 20-field order', async () => {
    const payload = intentionPayload();
    await expect(gateway().verifyWebhook(payload, sign(intentionValues(payload)))).resolves.toBe(true);
  });

  it.each(INTENTION_PATHS)('rejects when signed field %s is mutated', async (path) => {
    const payload = intentionPayload();
    const signature = sign(intentionValues(payload));
    const tampered = mutate(payload, path);
    // The mutation must actually change the signed string.
    expect(intentionValues(tampered).join('')).not.toBe(intentionValues(payload).join(''));

    await expect(gateway().verifyWebhook(tampered, signature)).resolves.toBe(false);
  });

  it('treats absent/null source fields as empty strings (implementation contract)', async () => {
    const payload = intentionPayload();
    payload.obj.source_data = undefined;
    const sig = sign(intentionValues(payload));
    await expect(gateway().verifyWebhook(payload, sig)).resolves.toBe(true);

    const nulled = intentionPayload();
    nulled.obj.source_data = { pan: null, sub_type: null, type: null };
    const nullSig = sign(intentionValues(nulled));
    await expect(gateway().verifyWebhook(nulled, nullSig)).resolves.toBe(true);
  });

  it('ignores fields that are not part of the signed list', async () => {
    const payload = intentionPayload();
    const signature = sign(intentionValues(payload));
    payload.obj.extra_untrusted = 'ignored';
    payload.extra = 'ignored';
    await expect(gateway().verifyWebhook(payload, signature)).resolves.toBe(true);
  });
});

describe('P5-02 Paymob Accept webhook HMAC', () => {
  it('accepts the signature computed over the exact 22-field order (flat payload)', async () => {
    const payload = acceptPayload();
    await expect(gateway().verifyWebhook(payload, sign(acceptValues(payload)))).resolves.toBe(true);
  });

  it.each(ACCEPT_PATHS)('rejects when signed field %s is mutated', async (path) => {
    const payload = acceptPayload();
    const signature = sign(acceptValues(payload));
    const tampered = mutate(payload, path);
    expect(acceptValues(tampered).join('')).not.toBe(acceptValues(payload).join(''));

    await expect(gateway().verifyWebhook(tampered, signature)).resolves.toBe(false);
  });

  it('treats absent order/source fields as empty strings (implementation contract)', async () => {
    const payload = acceptPayload();
    payload.order = undefined;
    payload.source_data = undefined;
    const sig = sign(acceptValues(payload));
    await expect(gateway().verifyWebhook(payload, sig)).resolves.toBe(true);
  });
});

describe('P5-02 Paymob HMAC rejection cases', () => {
  it('rejects an incorrect signature', async () => {
    const payload = intentionPayload();
    const sig = sign(intentionValues(payload)).replace(/[0-9a-f]/, (c) => (c === 'a' ? 'b' : 'a'));
    await expect(gateway().verifyWebhook(payload, sig)).resolves.toBe(false);
  });

  it('rejects an empty signature', async () => {
    await expect(gateway().verifyWebhook(intentionPayload(), '')).resolves.toBe(false);
    await expect(gateway().verifyWebhook(acceptPayload(), '')).resolves.toBe(false);
  });

  it('rejects a truncated signature (first 32 hex chars)', async () => {
    const payload = acceptPayload();
    const sig = sign(acceptValues(payload)).slice(0, 32);
    await expect(gateway().verifyWebhook(payload, sig)).resolves.toBe(false);
  });

  it('rejects an over-long / non-hex / uppercase / whitespace-padded signature', async () => {
    const payload = intentionPayload();
    const valid = sign(intentionValues(payload));

    await expect(gateway().verifyWebhook(payload, `${valid}00`)).resolves.toBe(false);
    await expect(gateway().verifyWebhook(payload, 'z'.repeat(valid.length))).resolves.toBe(false);
    await expect(gateway().verifyWebhook(payload, valid.toUpperCase())).resolves.toBe(false);
    await expect(gateway().verifyWebhook(payload, ` ${valid} `)).resolves.toBe(false);
  });

  it('rejects null/undefined signatures', async () => {
    const payload = intentionPayload();
    await expect(gateway().verifyWebhook(payload, null as any)).resolves.toBe(false);
    await expect(gateway().verifyWebhook(payload, undefined as any)).resolves.toBe(false);

    const accept = acceptPayload();
    await expect(gateway().verifyWebhook(accept, null as any)).resolves.toBe(false);
    await expect(gateway().verifyWebhook(accept, undefined as any)).resolves.toBe(false);
  });

  it('fails closed when the HMAC secret is missing or empty', async () => {
    const payload = intentionPayload();
    const valid = sign(intentionValues(payload));

    await expect(gateway({ hmacSecret: undefined }).verifyWebhook(payload, valid)).resolves.toBe(false);
    await expect(gateway({ hmacSecret: '' }).verifyWebhook(payload, valid)).resolves.toBe(false);
  });

  it('does not log the secret (only a short computed/expected preview on mismatch)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const payload = acceptPayload();
    const valid = sign(acceptValues(payload));

    await gateway().verifyWebhook(payload, valid); // valid → no log
    expect(errorSpy).not.toHaveBeenCalled();

    await gateway().verifyWebhook(payload, '0'.repeat(valid.length));
    const output = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(output).not.toContain(TEST_SECRET);
    expect(output).not.toContain(valid);
  });
});
