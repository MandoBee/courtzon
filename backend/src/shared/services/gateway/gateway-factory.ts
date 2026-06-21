import type { GatewayConfig, PaymentGateway } from './payment-gateway.types.js';
import { MockGateway } from './mock-gateway.js';
import { PaymobGateway } from './paymob-gateway.js';

/**
 * Factory that returns the configured payment gateway.
 *
 * Config is read from environment variables:
 *   PAYMENT_GATEWAY_PROVIDER = 'mock' | 'paymob' | 'fawry'
 *   PAYMOB_API_KEY, PAYMOB_SECRET, PAYMOB_MERCHANT_ID, PAYMOB_HMAC_SECRET
 *   PAYMOB_SANDBOX = 'true' | 'false'
 */
export function createPaymentGateway(): PaymentGateway {
  const provider = process.env.PAYMENT_GATEWAY_PROVIDER || 'mock';

  const config: GatewayConfig = {
    provider: provider as GatewayConfig['provider'],
    apiKey: process.env.PAYMOB_API_KEY,
    secretKey: process.env.PAYMOB_SECRET,
    publicKey: process.env.PAYMOB_PUBLIC_KEY,
    merchantId: process.env.PAYMOB_MERCHANT_ID,
    hmacSecret: process.env.PAYMOB_HMAC_SECRET,
    sandbox: process.env.PAYMOB_SANDBOX !== 'false',
  };

  switch (provider) {
    case 'paymob':
      return new PaymobGateway(config);
    case 'fawry':
      // Fawry gateway would go here
      return new MockGateway({ ...config, provider: 'fawry' });
    case 'mock':
    default:
      return new MockGateway(config);
  }
}

export const paymentGateway = createPaymentGateway();
