export interface PaymentRequest {
  amount: number;
  currency: string;
  referenceId: number;
  referenceType: 'booking' | 'order' | 'subscription' | 'wallet_topup';
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  customerAddress?: Record<string, any>;
  description?: string;
  returnUrl?: string;
  metadata?: Record<string, string>;
  /** Correlation token persisted on the local payment row (e.g. booking_prepare
   *  prepareId UUID). Used to build a parseable Paymob `special_reference` so the
   *  webhook can re-correlate even when the Accept order id differs from the
   *  intention order id. */
  idempotencyKey?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  gatewayReference?: string;
  paymentUrl?: string;
  clientSecret?: string;
  intentionId?: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  errorMessage?: string;
  rawResponse?: unknown;
}

export interface RefundRequest {
  transactionId: string;
  amount: number;
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  status: 'pending' | 'processed' | 'failed';
  errorMessage?: string;
}

/**
 * Gateway-side refund state, used to resolve an uncertain refund attempt
 * (crash between gateway success and local commit). The refund flow FAILS
 * CLOSED unless a provider returns a conclusive outcome:
 *  - 'refunded'      → the gateway confirms money moved (amount in minor units).
 *  - 'not_refunded'  → the gateway has no record of a refund — safe to re-execute.
 *  - 'unknown'       → provider unreachable / inconclusive — never execute nor
 *                      finalize; surface a retryable, reconcilable error.
 */
export type RefundState =
  | { outcome: 'refunded'; refundedCents: number; isFullyRefunded: boolean }
  | { outcome: 'not_refunded'; refundedCents: number }
  | { outcome: 'unknown'; reason: string };

export interface GatewayConfig {
  provider: 'mock' | 'paymob' | 'fawry';
  apiKey?: string;
  secretKey?: string;
  publicKey?: string;
  merchantId?: string;
  hmacSecret?: string;
  sandbox: boolean;
}

export interface PaymentGateway {
  readonly provider: string;
  charge(request: PaymentRequest): Promise<PaymentResult>;
  refund(request: RefundRequest): Promise<RefundResult>;
  /** Query the gateway for the true refund state of a transaction. MUST never throw — return 'unknown' on any failure. */
  getRefundState(transactionId: string): Promise<RefundState>;
  verifyWebhook(payload: unknown, signature: string): Promise<boolean>;
  getTransactionStatus(gatewayReference: string, orderId?: number): Promise<PaymentResult>;
}
