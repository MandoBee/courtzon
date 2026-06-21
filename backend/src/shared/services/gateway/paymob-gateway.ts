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
        special_reference: `${request.referenceType}_${request.referenceId}`,
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

  async getTransactionStatus(gatewayReference: string): Promise<PaymentResult> {
    try {
      const tokenRes = await fetch(`${this.baseUrl}/api/auth/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.config.apiKey }),
      });
      const tokenData = await tokenRes.json() as any;

      const res = await fetch(
        `${this.baseUrl}/api/acceptance/transactions/${gatewayReference}`,
        { headers: { Authorization: `Bearer ${tokenData.token}` } }
      );
      const data = await res.json() as any;
      const success = data.success === true;
      return {
        success,
        transactionId: String(data.id || ''),
        gatewayReference,
        status: success ? 'paid' : 'failed',
        rawResponse: data,
      };
    } catch {
      return { success: false, transactionId: '', status: 'failed' };
    }
  }
}
