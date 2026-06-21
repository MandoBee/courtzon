import type {
  PaymentGateway, PaymentRequest, PaymentResult, RefundRequest, RefundResult, GatewayConfig,
} from './payment-gateway.types.js';

/**
 * Mock payment gateway for development/testing.
 * Always succeeds and returns a fake transaction reference.
 */
export class MockGateway implements PaymentGateway {
  readonly provider = 'mock';
  private config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    const transactionId = `mock_txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      success: true,
      transactionId,
      gatewayReference: transactionId,
      clientSecret: `mock_csk_test_${Date.now()}`,
      intentionId: `mock_int_${Date.now()}`,
      paymentUrl: `https://accept.paymobsandbox.com/unifiedcheckout/?publicKey=${this.config.publicKey || 'mock_pk'}&clientSecret=mock_csk_test_${Date.now()}`,
      status: 'paid',
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    return {
      success: true,
      refundId: `mock_ref_${Date.now()}`,
      status: 'processed',
    };
  }

  async verifyWebhook(_payload: unknown, _signature: string): Promise<boolean> {
    return true;
  }

  async getTransactionStatus(gatewayReference: string): Promise<PaymentResult> {
    return {
      success: true,
      transactionId: gatewayReference,
      gatewayReference,
      status: 'paid',
    };
  }
}
