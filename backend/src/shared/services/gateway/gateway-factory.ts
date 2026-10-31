import type { GatewayConfig, PaymentGateway } from './payment-gateway.types.js';
import { MockGateway } from './mock-gateway.js';
import { PaymobGateway } from './paymob-gateway.js';

/**
 * Factory that returns the configured payment gateway.
 *
 * Config is read from environment variables:
 *   PAYMENT_GATEWAY_PROVIDER = 'mock' | 'paymob' | 'fawry'
 *   PAYMOB_API_KEY, PAYMOB_SECRET, PAYMOB_MERCHANT_ID, PAYMOB_HMAC_SECRET
 *   PAYMOB_SANDBOX = 'true' | 'false'  (configuration state only; not proof of credential scope)
 *   PAYMOB_BASE_URL = explicit override (only https://accept.paymob.com allowed by gateway)
 */
export function createPaymentGateway(): PaymentGateway {
  const provider = process.env.PAYMENT_GATEWAY_PROVIDER || 'mock';
  const sandboxRaw = process.env.PAYMOB_SANDBOX;
  const sandbox = sandboxRaw === undefined || sandboxRaw === null ? true : sandboxRaw !== 'false';

  const config: GatewayConfig = {
    provider: provider as GatewayConfig['provider'],
    apiKey: process.env.PAYMOB_API_KEY,
    secretKey: process.env.PAYMOB_SECRET,
    publicKey: process.env.PAYMOB_PUBLIC_KEY,
    merchantId: process.env.PAYMOB_MERCHANT_ID,
    hmacSecret: process.env.PAYMOB_HMAC_SECRET,
    sandbox,
    baseUrl: process.env.PAYMOB_BASE_URL,
  };

  if (provider === 'paymob') {
    // Fail closed if required credentials are missing in non-mock contexts where possible.
    // This does not validate credential scope (test vs live) — only presence of keys needed for API calls.
    if (!config.apiKey || !config.secretKey || !config.hmacSecret) {
      throw new Error('Paymob gateway requires PAYMOB_API_KEY, PAYMOB_SECRET, and PAYMOB_HMAC_SECRET');
    }
  }

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
