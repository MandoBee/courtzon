import type {
  PaymentGateway, PaymentRequest, PaymentResult, RefundRequest, RefundResult, GatewayConfig,
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

  constructor(config: GatewayConfig) {
    this.config = config;
    this.baseUrl = 'https://accept.paymob.com';
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
        redirection_url: request.returnUrl,
      };
      const response = await fetch(`${this.baseUrl}/v1/intention/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${this.config.secretKey}`,
        },
        body: JSON.stringify(body),
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
        paymentUrl: `https://accept.paymob.com/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`,
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

  async verifyWebhook(payload: unknown, signature: string): Promise<boolean> {
    if (!this.config.hmacSecret) return false;
    const crypto = await import('node:crypto');

    const data = payload as Record<string, unknown>;

    // Intention API webhook: HMAC computed on JSON.stringify(obj),
    // sent in body.hmac field or x-paymob-signature header
    if (data.obj) {
      const computed = crypto
        .createHmac('sha512', this.config.hmacSecret)
        .update(JSON.stringify(data.obj))
        .digest('hex');
      const expected = (data.hmac as string) || signature;
      return computed === expected;
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
    return computed === signature;
  }

  async getTransactionStatus(gatewayReference: string, orderId?: number): Promise<PaymentResult> {
    try {
      const tokenRes = await fetch(`${this.baseUrl}/api/auth/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.config.apiKey }),
      });
      const tokenData = await tokenRes.json() as any;
      const authToken = tokenData.token;

      if (!authToken) {
        return { success: false, transactionId: '', status: 'failed', errorMessage: 'Paymob auth failed' };
      }

      // ── PRIMARY: Query the Order API ──
      // gatewayReference is Paymob's intention_order_id.
      // NOTE: For Intention API payments the order always shows
      // payment_status="UNPAID" — the actual outcome comes via webhook only.
      // This path is useful primarily for legacy Accept-API orders.
      const orderRes = await fetch(
        `${this.baseUrl}/api/ecommerce/orders/${gatewayReference}`,
        { headers: { Authorization: `Bearer ${authToken}` } },
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

      // ── FALLBACK: Transaction API (pagination: { results: [...], next, previous }) ──
      // Only reached when Order API fails or returns no useful data.
      // The ?order= filter is a no-op (returns all merchant transactions), so we
      // filter locally by merchant_order_id when orderId is known.
      const txnRes = await fetch(
        `${this.baseUrl}/api/acceptance/transactions`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
      const txnBody = await txnRes.json() as any;
      const txnList: any[] = txnBody?.results ?? (Array.isArray(txnBody) ? txnBody : []);

      if (txnList.length > 0) {
        // Build a pattern to match our merchant_order_id
        // e.g. "order_10_*" or "booking_intent_9"
        const merchantRef = orderId != null
          ? `${gatewayReference.includes('booking') ? 'booking_intent' : 'order'}_${orderId}`
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
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, transactionId: '', gatewayReference, status: 'failed', errorMessage: message };
    }
  }
}
