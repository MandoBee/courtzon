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
  verifyWebhook(payload: unknown, signature: string): Promise<boolean>;
  getTransactionStatus(gatewayReference: string, orderId?: number): Promise<PaymentResult>;
}
