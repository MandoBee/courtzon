import type {
  PaymentGateway, PaymentRequest, PaymentResult, RefundRequest, RefundResult, RefundState, GatewayConfig,
} from './payment-gateway.types.js';

/**
 * Mock payment gateway for development/testing.
 * Always succeeds and returns a fake transaction reference.
 *
 * Refunds are recorded in an in-memory ledger keyed by transaction reference so
 * getRefundState() can deterministically answer the refund crash-window
 * recovery path (refunded / not_refunded / injected-unknown).
 */
export class MockGateway implements PaymentGateway {
  readonly provider = 'mock';
  private config: GatewayConfig;
  private refundLedger = new Map<string, number>();
  private injectedRefundState: RefundState | undefined;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  private keyOf(transactionId: string): string {
    return `txn:${transactionId}`;
  }

  /** Total refunded cents on record for a transaction reference. */
  getRefundedCents(transactionId: string): number {
    return this.refundLedger.get(this.keyOf(transactionId)) || 0;
  }

  /** Force a specific refund state (test injection). */
  injectRefundState(state: RefundState | undefined): void {
    this.injectedRefundState = state;
  }

  /** Clear the in-memory refund ledger (test isolation). */
  clearRefundLedger(): void {
    this.refundLedger.clear();
    this.injectedRefundState = undefined;
  }

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    const transactionId = `mock_txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      success: true,
      transactionId,
      gatewayReference: transactionId,
      clientSecret: `mock_csk_test_${Date.now()}`,
      intentionId: `mock_int_${Date.now()}`,
      paymentUrl: `https://accept.paymob.com/unifiedcheckout/?publicKey=${this.config.publicKey || 'mock_pk'}&clientSecret=mock_csk_test_${Date.now()}`,
      status: 'paid',
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const cents = Math.round(request.amount * 100);
    const existing = this.refundLedger.get(this.keyOf(request.transactionId)) || 0;
    this.refundLedger.set(this.keyOf(request.transactionId), existing + cents);
    return {
      success: true,
      refundId: `mock_ref_${Date.now()}`,
      status: 'processed',
    };
  }

  async getRefundState(transactionId: string): Promise<RefundState> {
    if (this.injectedRefundState) return this.injectedRefundState;
    const cents = this.refundLedger.get(this.keyOf(transactionId)) || 0;
    if (cents > 0) {
      return { outcome: 'refunded', refundedCents: cents, isFullyRefunded: true };
    }
    return { outcome: 'not_refunded', refundedCents: 0 };
  }

  async verifyWebhook(_payload: unknown, _signature: string): Promise<boolean> {
    return true;
  }

  async getTransactionStatus(gatewayReference: string, _orderId?: number): Promise<PaymentResult> {
    return {
      success: true,
      transactionId: gatewayReference,
      gatewayReference,
      status: 'paid',
    };
  }
}
