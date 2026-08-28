import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymobGateway } from '../../../shared/services/gateway/paymob-gateway.js';

type FetchCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, httpStatus = 200): Response {
  return new Response(JSON.stringify(body), { status: httpStatus, headers: { 'Content-Type': 'application/json' } });
}

function authTokenResponse() { return jsonResponse({ token: 'TEST_TOKEN', profile_id: 1 }); }

const PAYMOB_BASE = 'https://accept.paymob.com';

function buildGateway(): PaymobGateway {
  return new PaymobGateway({
    provider: 'paymob',
    apiKey: 'ak',
    secretKey: 'sk',
    publicKey: 'pk',
    merchantId: '5663993',
    hmacSecret: 'h',
    sandbox: true,
  });
}

function captureFetch(): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    calls.push({ url, init });
    return jsonResponse({});
  });
  return { calls, restore: () => { spy.mockRestore(); } };
}

beforeEach(() => {
  // Reset cached auth token between tests.
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PaymobGateway.getRefundState — lookup strategy & safety', () => {
  it('1. returns unknown immediately for non-numeric (synthetic) references', async () => {
    const { calls, restore } = captureFetch();
    try {
      const gw = buildGateway();
      for (const ref of ['test_nxpr_01_1', 'test_topup_x', 'mock_1', 'abc', '', 'ORDER-123']) {
        const result = await gw.getRefundState(ref);
        expect(result.outcome).toBe('unknown');
        expect(result.reason).toMatch(/non-numeric|unsupported/);
      }
      // ZERO Paymob HTTP calls for invalid refs.
      expect(calls.length).toBe(0);
    } finally { restore(); }
  });

  it('2. matches the ORIGINAL transaction via ?order_id= filter and classifies refunded state with exact cents', async () => {
    const { calls, restore } = captureFetch();
    try {
      const gw = buildGateway();
      const orderId = '595014617';
      const originalTxnId = '522258011';

      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        calls.push({ url });
        if (url === `${PAYMOB_BASE}/api/auth/tokens`) return authTokenResponse();
        if (url.startsWith(`${PAYMOB_BASE}/api/ecommerce/orders/${orderId}`)) {
          return jsonResponse({ id: Number(orderId), amount_cents: 27600, paid_amount_cents: 27600, payment_status: 'PAID' });
        }
        if (url.startsWith(`${PAYMOB_BASE}/api/acceptance/transactions?order_id=${orderId}`)) {
          return jsonResponse({
            results: [
              // Refund child — must NOT be selected as the match target.
              { id: 524225952, is_refund: true, parent_transaction: Number(originalTxnId), amount_cents: 5000, order: { id: Number(orderId) } },
              // The ORIGINAL purchase transaction.
              { id: Number(originalTxnId), amount_cents: 27600, currency: 'EGP', is_refunded: true, refunded_amount_cents: 5000, success: true, pending: false, order: { id: Number(orderId) } },
            ],
          });
        }
        return jsonResponse({}, 404);
      });

      const result = await gw.getRefundState(orderId);
      expect(result).toEqual({ outcome: 'refunded', refundedCents: 5000, isFullyRefunded: true });
      // Must NOT have made a pagination request — filter resolved it.
      const txnCalls = calls.filter(c => c.url.includes('/api/acceptance/transactions'));
      expect(txnCalls.length).toBe(1);
      expect(txnCalls[0].url).toContain(`order_id=${orderId}`);
    } finally { restore(); }
  });

  it('3. matches ORIGINAL transaction only — never a refund child when its id equals subject', async () => {
    const { calls, restore } = captureFetch();
    try {
      const gw = buildGateway();
      const refundTxnId = '524225952'; // child, is_refund=true
      const orderId = '595014617';

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        calls.push({ url });
        if (url === `${PAYMOB_BASE}/api/auth/tokens`) return authTokenResponse();
        // No ?order_id filter would be tried first; we hit ?order_id= which returns the child only.
        if (url.includes('/api/acceptance/transactions')) {
          return jsonResponse({
            results: [
              { id: Number(refundTxnId), is_refund: true, parent_transaction: 522258011, amount_cents: 5000, refunded_amount_cents: 0, order: { id: Number(orderId) } },
            ],
          });
        }
        return jsonResponse({}, 404);
      });

      // Pass the refund CHILD id; even though t.id===subject, it is is_refund=true → must not match.
      const result = await gw.getRefundState(refundTxnId);
      expect(result.outcome).toBe('unknown');
    } finally { restore(); }
  });

  it('4. falls through to bounded pagination when ?order_id= filter returns no original', async () => {
    const { calls, restore } = captureFetch();
    try {
      const gw = buildGateway();
      const targetOrderId = '999000001';
      const originalTxnId = '999000002';

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        calls.push({ url });
        if (url === `${PAYMOB_BASE}/api/auth/tokens`) return authTokenResponse();
        if (url.includes('order_id=999000001')) {
          // Filter returns nothing.
          return jsonResponse({ results: [] });
        }
        if (url.includes('/api/acceptance/transactions')) {
          // First page returns noise; second page returns the target.
          if (url.includes('page=1')) {
            return jsonResponse({
              results: [{ id: 111, order: { id: 1 }, is_refunded: false, refunded_amount_cents: 0, success: true, amount_cents: 100 }],
              next: `${PAYMOB_BASE}/api/acceptance/transactions?page=2`,
            });
          }
          if (url.includes('page=2')) {
            return jsonResponse({
              results: [
                { id: 222, order: { id: 2 }, is_refunded: false, refunded_amount_cents: 0, success: true, amount_cents: 200 },
                { id: Number(originalTxnId), order: { id: Number(targetOrderId) }, is_refunded: true, refunded_amount_cents: 7500, success: true, pending: false, amount_cents: 30000 },
              ],
              next: null,
            });
          }
        }
        return jsonResponse({}, 404);
      });

      const result = await gw.getRefundState(targetOrderId);
      expect(result).toEqual({ outcome: 'refunded', refundedCents: 7500, isFullyRefunded: true });
      // Should have hit at most 2 transactions pages (filter + page1 + page2 = 3 total /transactions calls).
      const txnCalls = calls.filter(c => c.url.includes('/api/acceptance/transactions'));
      expect(txnCalls.length).toBe(3);
    } finally { restore(); }
  });

  it('5. bounded pagination — never scans more than MAX_TRANSACTIONS_PAGES pages', async () => {
    const { calls, restore } = captureFetch();
    try {
      const gw = buildGateway();
      const missingOrderId = '888888888';

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        calls.push({ url });
        if (url === `${PAYMOB_BASE}/api/auth/tokens`) return authTokenResponse();
        if (url.includes('order_id=888888888')) return jsonResponse({ results: [] });
        // Always a non-empty page that links to next.
        return jsonResponse({
          results: [{ id: Math.floor(Math.random() * 1e9), order: { id: 1 }, is_refunded: false, refunded_amount_cents: 0, success: true, amount_cents: 100 }],
          next: `${PAYMOB_BASE}/api/acceptance/transactions?page=${(calls.length)}`,
        });
      });

      const result = await gw.getRefundState(missingOrderId);
      expect(result.outcome).toBe('unknown');
      // Bound: 1 (filter) + 5 (paginated MAX) = 6 transactions calls max.
      const txnCalls = calls.filter(c => c.url.includes('/api/acceptance/transactions'));
      expect(txnCalls.length).toBeLessThanOrEqual(6);
      expect(txnCalls.length).toBeGreaterThanOrEqual(6);
    } finally { restore(); }
  });

  it('6. not_refunded: conclusive paid transaction with no refund flags', async () => {
    const { calls, restore } = captureFetch();
    try {
      const gw = buildGateway();
      const orderId = '777777777';
      const txnId = '777777778';

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        calls.push({ url });
        if (url === `${PAYMOB_BASE}/api/auth/tokens`) return authTokenResponse();
        if (url.includes(`order_id=${orderId}`)) {
          return jsonResponse({
            results: [
              { id: Number(txnId), order: { id: Number(orderId) }, success: true, pending: false, is_refunded: false, refunded_amount_cents: 0, amount_cents: 10000, currency: 'EGP' },
            ],
          });
        }
        return jsonResponse({}, 404);
      });

      const result = await gw.getRefundState(orderId);
      expect(result).toEqual({ outcome: 'not_refunded', refundedCents: 0 });
    } finally { restore(); }
  });

  it('7a. unknown: timeout / network error → no throw, returns unknown', async () => {
    const { restore } = captureFetch();
    try {
      const gw = buildGateway();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('ECONNRESET'); });
      const result = await gw.getRefundState('12345');
      expect(result.outcome).toBe('unknown');
      expect(result.reason).toMatch(/ECONNRESET|fetch|aborted/);
    } finally { restore(); }
  });

  it('7b. unknown: auth 5xx / no token', async () => {
    const { restore } = captureFetch();
    try {
      const gw = buildGateway();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ message: 'bad creds' }, 401));
      const result = await gw.getRefundState('12345');
      expect(result.outcome).toBe('unknown');
      expect(result.reason).toMatch(/auth|token|401|Unauthorized/i);
    } finally { restore(); }
  });

  it('7c. unknown: malformed JSON body', async () => {
    const { restore } = captureFetch();
    try {
      const gw = buildGateway();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        if (url === `${PAYMOB_BASE}/api/auth/tokens`) return authTokenResponse();
        if (url.includes(`/api/ecommerce/orders/`)) {
          return new Response('not-json{', { status: 200 });
        }
        if (url.includes('/api/acceptance/transactions')) {
          return new Response('<<<malformed', { status: 200 });
        }
        return new Response('not-json', { status: 200 });
      });
      const result = await gw.getRefundState('12345');
      expect(result.outcome).toBe('unknown');
    } finally { restore(); }
  });

  it('7d. unknown: target not found anywhere within bound', async () => {
    const { restore } = captureFetch();
    try {
      const gw = buildGateway();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        if (url === `${PAYMOB_BASE}/api/auth/tokens`) return authTokenResponse();
        if (url.includes('/api/acceptance/transactions')) {
          // Always empty results, no next.
          return jsonResponse({ results: [], next: null });
        }
        return jsonResponse({}, 404);
      });
      const result = await gw.getRefundState('55555');
      expect(result.outcome).toBe('unknown');
      expect(result.reason).toMatch(/no conclusive/);
    } finally { restore(); }
  });

  it('8. preserves fail-closed: NEVER throws regardless of upstream behaviour', async () => {
    const { restore } = captureFetch();
    try {
      const gw = buildGateway();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new TypeError('cannot read property'); });
      // Must not throw; must return unknown.
      const result = await gw.getRefundState('12345');
      expect(result.outcome).toBe('unknown');
    } finally { restore(); }
  });

  it('9. payment_service integration contract: numeric gateway_reference resolves; refund-intent-aware recovery relies on the correct outcome', async () => {
    // Demonstrates the deployed recovery path receives a concrete RefundState —
    // and that payment.service.ts can rely on the contract unchanged.
    const { restore } = captureFetch();
    try {
      const gw = buildGateway();
      const orderId = '123456789';
      const txnId = '123456790';
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? '');
        if (url === `${PAYMOB_BASE}/api/auth/tokens`) return authTokenResponse();
        if (url.includes(`order_id=${orderId}`)) {
          return jsonResponse({
            results: [
              // Partial refund child
              { id: 999, is_refund: true, parent_transaction: Number(txnId), amount_cents: 5000, refunded_amount_cents: 0, order: { id: Number(orderId) } },
              // Original — partial state
              { id: Number(txnId), order: { id: Number(orderId) }, success: true, pending: false, is_refunded: true, refunded_amount_cents: 5000, amount_cents: 27600, currency: 'EGP' },
            ],
          });
        }
        return jsonResponse({}, 404);
      });
      const state = await gw.getRefundState(orderId);
      // Recovery branch math: refundedCents (5000) - priorRefundedCents (0) < operationAmountCents (27600) → fail-closed
      expect(state).toEqual({ outcome: 'refunded', refundedCents: 5000, isFullyRefunded: true });
      // Confirm a synthetic reference short-circuits BEFORE any HTTP call.
      const synthetic = await gw.getRefundState('test_nxpr_01_xxx');
      expect(synthetic.outcome).toBe('unknown');
    } finally { restore(); }
  });
});