import type {
  PaymentGateway, PaymentRequest, PaymentResult, RefundRequest, RefundResult, RefundState, GatewayConfig,
} from './payment-gateway.types.js';

/**
 * Paymob payment gateway integration.
 *
 * Flow:
 * 1. charge() — creates a payment intention via Paymob's Intention API
 * 2. Returns `clientSecret`, `intentionId`, and `paymentUrl` (Unified Checkout redirect)
 * 3. Paymob sends webhook to /payments/webhook
 * 4. verifyWebhook() — validates HMAC signature
 *
 * Docs: https://docs.paymob.com/
 */
export class PaymobGateway implements PaymentGateway {
  readonly provider = 'paymob';
  private config: GatewayConfig;
  private baseUrl: string;
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;

  /** Hard bound on pages scanned when following Paymob's `next` link. 5 pages
   *  × Paymob's default page size (10) = 50 records max — enough to locate the
   *  target transaction in normal merchant volumes, never unbounded. */
  private static readonly MAX_TRANSACTIONS_PAGES = 5;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.baseUrl = 'https://accept.paymob.com';
  }

  private async getAuthToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt) return this.cachedToken;

    const res = await fetch(`${this.baseUrl}/api/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.config.apiKey }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json() as any;
    if (!data.token) throw new Error('Paymob auth token not returned');
    this.cachedToken = data.token;
    this.tokenExpiresAt = now + 55 * 60 * 1000;
    return data.token;
  }

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    try {
      const body = {
        amount: Math.round(request.amount * 100),
        currency: request.currency || 'EGP',
        payment_methods: [Number(this.config.merchantId)],
        billing_data: {
          first_name: request.customerName?.split(' ')[0] || 'Customer',
          last_name: request.customerName?.split(' ').slice(1).join(' ') || 'User',
          phone_number: request.customerPhone || '0000000000',
          email: request.customerEmail || 'customer@example.com',
          city: request.customerAddress?.city || 'N/A',
          country: request.customerAddress?.country || 'EG',
          state: request.customerAddress?.state || 'N/A',
          building: request.customerAddress?.building || 'N/A',
          floor: request.customerAddress?.floor || 'N/A',
          apartment: request.customerAddress?.apartment || 'N/A',
          street: request.customerAddress?.street || 'N/A',
        },
        customer: {
          first_name: request.customerName?.split(' ')[0] || 'Customer',
          last_name: request.customerName?.split(' ').slice(1).join(' ') || 'User',
          email: request.customerEmail || 'customer@example.com',
          phone_number: request.customerPhone || '0000000000',
        },
        special_reference: `${request.referenceType}_${request.referenceId}_${Date.now()}`,
        notification_url: `${process.env.WEBHOOK_BASE_URL || process.env.APP_URL || 'http://localhost:3000'}/payments/webhook`,
        redirection_url: request.returnUrl || `${process.env.APP_URL || 'http://localhost:5173'}/payments/return`,
      };
      const response = await fetch(`${this.baseUrl}/v1/intention/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${this.config.secretKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });

      const data = await response.json() as any;

      if (!data.id || !data.client_secret) {
        return {
          success: false,
          transactionId: '',
          status: 'failed',
          errorMessage: 'Paymob intention creation failed',
          rawResponse: data,
        };
      }

      const publicKey = this.config.publicKey || '';
      const intentionId = String(data.id);
      const clientSecret = data.client_secret;
      const paymobOrderId = String(data.intention_order_id || data.order?.id || data.id);

      return {
        success: true,
        transactionId: intentionId,
        gatewayReference: paymobOrderId,
        clientSecret,
        intentionId,
        paymentUrl: `${this.baseUrl}/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`,
        status: 'pending',
        rawResponse: data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Paymob request failed';
      return {
        success: false,
        transactionId: '',
        status: 'failed',
        errorMessage: message,
      };
    }
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    try {
      const tokenRes = await fetch(`${this.baseUrl}/api/auth/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.config.apiKey }),
      });
      const tokenData = await tokenRes.json() as any;
      const authToken = tokenData.token;

      const refundRes = await fetch(`${this.baseUrl}/api/acceptance/void_refund/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          auth_token: authToken,
          transaction_id: Number(request.transactionId),
          amount_cents: Math.round(request.amount * 100),
        }),
      });
      const refundData = await refundRes.json() as any;

      return {
        success: refundData.id ? true : false,
        refundId: String(refundData.id || ''),
        status: refundData.id ? 'processed' : 'failed',
        errorMessage: refundData.message,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Paymob refund failed';
      return { success: false, refundId: '', status: 'failed', errorMessage: message };
    }
  }

  /**
   * Resolve the true refund state of a transaction — used ONLY to recover an
   * uncertain refund attempt (crash after the refund reached Paymob but before
   * our commit). Conservative by construction:
   *   - Reads ONLY well-documented Accept/Paymob fields (`refunded_amount_cents`,
   *     `is_refunded`, `payment_status`); never invents fields or endpoints.
   *   - Any network/parse/matching uncertainty → `{ outcome: 'unknown' }` so the
   *     caller fails closed (no second refund, no false finalize).
   *   - MUST never throw.
   *
   * Lookup strategy (in order, never unbounded):
   *   1. Numeric-id safety guard — synthetic/non-Paymob references cannot be
   *      resolved against Paymob and return 'unknown' immediately (prevents
   *      wasted scan and impossible matches; also closes the gap exposed by
   *      UAT where 637 local DB rows carry non-numeric gateway_reference).
   *   2. Accept transactions filtered by `?order_id=` — the deterministic
   *      Paymob filter (verified in sandbox) that returns only the matching
   *      order's records (original + refund children). One request, small
   *      result. Paymob's order API does NOT expose refund evidence, so it is
   *      NOT used as a lookup path here.
   *   3. Bounded pagination via `next` URL — only when step 2 fails, follow
   *      the Paymob `next` link up to MAX_TRANSACTIONS_PAGES, stopping early
   *      on match or when `next` is null. Never unbounded.
   *   4. No match → 'unknown'.
   */
  async getRefundState(transactionId: string): Promise<RefundState> {
    const FETCH_TIMEOUT_MS = 8000;

    // (1) Paymob order/transaction IDs are numeric. Non-numeric inputs are
    // synthetic/local and CANNOT be mapped to a Paymob record — return
    // 'unknown' immediately to keep the lookup bounded and deterministic.
    if (typeof transactionId !== 'string' || !/^\d+$/.test(transactionId)) {
      return { outcome: 'unknown', reason: 'unsupported paymob reference shape (non-numeric)' };
    }

    try {
      const authToken = await this.getAuthToken();
      if (!authToken) return { outcome: 'unknown', reason: 'Paymob auth failed' };

      // (2) Deterministic filtered lookup: only the target order's records.
      const filteredState = await this._readRefundStateFromOrderFiltered(authToken, transactionId, FETCH_TIMEOUT_MS);
      if (filteredState) return filteredState;

      // (3) Bounded paginated fallback: follow Paymob's `next` link.
      const pagedState = await this._readRefundStateFromPaginated(authToken, transactionId, FETCH_TIMEOUT_MS);
      if (pagedState) return pagedState;

      return { outcome: 'unknown', reason: `Paymob returned no conclusive refund state for transaction ${transactionId}` };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return { outcome: 'unknown', reason };
    }
  }

  /** Deterministic filtered lookup: `?order_id={id}` returns ONLY the target
   *  order's records (the original + any refund children). We pick the
   *  ORIGINAL record (is_refund !== true) so a refund child is never mistaken
   *  for the parent. Returns null when no record can be classified. */
  private async _readRefundStateFromOrderFiltered(
    authToken: string,
    transactionId: string,
    timeoutMs: number,
  ): Promise<RefundState | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/acceptance/transactions?order_id=${encodeURIComponent(transactionId)}`,
        { headers: { Authorization: `Bearer ${authToken}` }, signal: AbortSignal.timeout(timeoutMs) },
      );
      if (!res.ok) return null;
      const body = await res.json() as any;
      const list: any[] = Array.isArray(body) ? body : (body?.results ?? []);
      return this._classifyOriginalFromList(list, transactionId);
    } catch {
      return null;
    }
  }

  /** Bounded paginated fallback. Follows the Paymob `next` link at most
   *  MAX_TRANSACTIONS_PAGES times. Stops early when a definitive match is
   *  found or when `next` is null. Returns null when the bound is exhausted
   *  or any page fails — the caller reports 'unknown'. */
  private async _readRefundStateFromPaginated(
    authToken: string,
    transactionId: string,
    timeoutMs: number,
  ): Promise<RefundState | null> {
    let nextUrl: string | null = `${this.baseUrl}/api/acceptance/transactions?page=1`;
    for (let page = 1; page <= PaymobGateway.MAX_TRANSACTIONS_PAGES && nextUrl; page++) {
      try {
        const res = await fetch(nextUrl, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const body = await res.json() as any;
        const list: any[] = Array.isArray(body) ? body : (body?.results ?? []);
        const classified = this._classifyOriginalFromList(list, transactionId);
        if (classified) return classified;
        const candidate = typeof body?.next === 'string' && body.next ? body.next : null;
        nextUrl = candidate;
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Pick the ORIGINAL (non-refund) Paymob transaction matching `subject` and
   *  classify it via the existing field reader. A refund child transaction
   *  (`is_refund === true`, `parent_transaction` set) is NEVER selected as the
   *  match target — only the parent charge carries the cumulative refund
   *  evidence used by the recovery branch. */
  private _classifyOriginalFromList(list: any[], subject: string): RefundState | null {
    const original = list.find((t) => {
      if (!t || typeof t !== 'object') return false;
      if (t.is_refund === true) return false; // never match a refund child
      return String(t.id) === subject || String(t?.order?.id) === subject;
    });
    if (!original) return null;
    return this._readRefundFields(original);
  }

  /**
   * Interpret a Paymob order/transaction object for refund evidence.
   * Returns null when the payload is inconclusive (so the caller reports
   * 'unknown' instead of guessing). Explicit refund flags without an amount
   * are returned as 'refunded' with 0 cents — the caller's satisfied-check then
   * rejects (fail-closed) rather than risk a second refund.
   */
  private _readRefundFields(data: Record<string, any>): RefundState | null {
    const rawCents = data.refunded_amount_cents;
    let refundedCents: number = Number.NaN;
    if (typeof rawCents === 'number' && Number.isInteger(rawCents) && rawCents >= 0) {
      refundedCents = rawCents;
    } else if (typeof rawCents === 'string' && /^\d+$/.test(rawCents)) {
      refundedCents = Number(rawCents);
    }

    const paymentStatus = typeof data.payment_status === 'string' ? data.payment_status.toLowerCase() : '';
    const isRefunded = data.is_refunded === true;
    const refundFlag = isRefunded || paymentStatus === 'refunded' || paymentStatus === 'fully_refunded' || paymentStatus === 'partially_refunded';

    if (refundFlag) {
      const cents = Number.isNaN(refundedCents) ? 0 : refundedCents;
      return { outcome: 'refunded', refundedCents: cents, isFullyRefunded: cents > 0 };
    }
    if (Number.isNaN(refundedCents)) {
      // No refund field present: only conclusive if the transaction positively
      // shows as paid (then: definitely not refunded). Anything else → unknown.
      if (data.success === true || data.paid === true || paymentStatus === 'paid') {
        return { outcome: 'not_refunded', refundedCents: 0 };
      }
      return null;
    }
    if (refundedCents > 0) {
      const capturedCents = Number(data.amount_cents);
      return {
        outcome: 'refunded',
        refundedCents,
        isFullyRefunded: Number.isInteger(capturedCents) && capturedCents > 0 && refundedCents >= capturedCents,
      };
    }
    return { outcome: 'not_refunded', refundedCents: 0 };
  }

  async verifyWebhook(payload: unknown, signature: string): Promise<boolean> {
    if (!this.config.hmacSecret) {
      console.error('HMAC verification: no hmacSecret configured');
      return false;
    }
    const crypto = await import('node:crypto');

    const data = payload as Record<string, unknown>;

    // Intention API webhook (POST callback): HMAC computed on exactly 20
    // field VALUES from obj, concatenated in official Paymob order, no
    // separators, no keys.  HMAC-SHA512 with the HMAC secret.
    //
    // Spec: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback
    if (data.obj) {
      const obj = data.obj as Record<string, any>;
      const order = (obj.order ?? {}) as Record<string, any>;
      const sourceData = (obj.source_data ?? {}) as Record<string, any>;

      const concatStr = [
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
        sourceData.pan,
        sourceData.sub_type,
        sourceData.type,
        obj.success,
      ].map(v => v ?? '').join('');

      const computed = crypto
        .createHmac('sha512', this.config.hmacSecret)
        .update(concatStr)
        .digest('hex');
      const expected = signature;
      const match = computed === expected;
      if (!match) {
        console.error('Intention API HMAC mismatch', {
          computed: computed.slice(0, 20),
          expected: expected.slice(0, 20),
          concatStrLength: concatStr.length,
        });
      }
      return match;
    }

    // Accept API webhook: HMAC computed on concatenated field values
    const concatStr = [
      data.amount_cents, data.created_at, data.currency, data.error_occured,
      data.has_parent_transaction, data.id, data.integration_id, data.is_3d_secure,
      data.is_auth, data.is_capture, data.is_refunded, data.is_standalone_payment,
      data.is_voided,
      (data.order as Record<string, unknown>)?.id,
      (data.order as Record<string, unknown>)?.created_at,
      (data.order as Record<string, unknown>)?.merchant_order_id,
      data.owner, data.pending, data.refunded_amount_cents,
      (data.source_data as Record<string, unknown>)?.pan,
      (data.source_data as Record<string, unknown>)?.sub_type,
      (data.source_data as Record<string, unknown>)?.type,
      data.success,
    ].map(v => v ?? '').join('');

    const computed = crypto
      .createHmac('sha512', this.config.hmacSecret)
      .update(concatStr)
      .digest('hex');
    const match = computed === signature;
    if (!match) {
      console.error('Accept API HMAC mismatch', { computed: computed.slice(0, 20), received: signature?.slice(0, 20) });
    }
    return match;
  }

  async getTransactionStatus(gatewayReference: string, orderId?: number): Promise<PaymentResult> {
    const maxAttempts = 2;
    const FETCH_TIMEOUT_MS = 8000;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // ── Auth token (cached, 8s timeout) ──
        const authToken = await this.getAuthToken();
        if (!authToken) {
          return { success: false, transactionId: '', status: 'failed', errorMessage: 'Paymob auth failed' };
        }

        // ── PRIMARY: Order API (8s timeout) ──
        const orderRes = await fetch(
          `${this.baseUrl}/api/ecommerce/orders/${gatewayReference}`,
          { headers: { Authorization: `Bearer ${authToken}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
        );
        const orderText = await orderRes.text();
        let orderData: any;
        try { orderData = JSON.parse(orderText); } catch { orderData = {}; }

        if (orderRes.ok && orderData) {
          const orderStatus = (orderData.status || '').toLowerCase();
          const orderPaymentStatus = (orderData.payment_status || '').toLowerCase();
          const isPaid = orderData.paid === true || orderStatus === 'paid' || orderPaymentStatus === 'paid';
          const isFailed = orderStatus === 'failed' || orderStatus === 'cancelled' || orderStatus === 'expired' || orderPaymentStatus === 'failed';
          const resultStatus = isPaid ? 'paid' : isFailed ? 'failed' : 'pending';

          return {
            success: isPaid,
            transactionId: String(orderData.id || ''),
            gatewayReference,
            status: resultStatus,
            rawResponse: orderData,
          };
        }

        // ── FALLBACK: Transaction API (8s timeout) ──
        const txnRes = await fetch(
          `${this.baseUrl}/api/acceptance/transactions`,
          { headers: { Authorization: `Bearer ${authToken}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
        );
        const txnBody = await txnRes.json() as any;
        const txnList: any[] = txnBody?.results ?? (Array.isArray(txnBody) ? txnBody : []);

        if (txnList.length > 0) {
          const merchantRef = orderId != null
            ? `${gatewayReference.includes('booking') ? 'booking' : 'order'}_${orderId}`
            : null;

          const matchingTxn = merchantRef
            ? txnList.find(txn =>
                txn.order?.merchant_order_id?.startsWith(merchantRef) ||
                txn.order?.merchant_order_id === merchantRef)
            : txnList[0];

          if (matchingTxn) {
            const isPaid = matchingTxn.success === true;
            const isPending = matchingTxn.pending === true;
            const resultStatus = isPaid ? 'paid' : isPending ? 'pending' : 'failed';

            return {
              success: isPaid,
              transactionId: String(matchingTxn.id || ''),
              gatewayReference,
              status: resultStatus,
              rawResponse: matchingTxn,
            };
          }
        }

        return { success: false, transactionId: '', gatewayReference, status: 'pending', rawResponse: orderData };
      } catch (err: unknown) {
        lastError = err;

        // Fast backoff: 100ms, 300ms
        if (attempt < maxAttempts) {
          const delayMs = 100 * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    return { success: false, transactionId: '', gatewayReference, status: 'failed', errorMessage: message };
  }
}
