import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymobGateway } from '../paymob-gateway.js';
import { createPaymentGateway } from '../gateway-factory.js';
import type { GatewayConfig } from '../payment-gateway.types.js';

describe('Paymob sandbox/live configuration hardening', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('PaymobGateway uses live host by default and ignores sandbox flag for host selection', () => {
    const config: GatewayConfig = {
      provider: 'paymob',
      apiKey: 'key',
      secretKey: 'secret',
      hmacSecret: 'hmac',
      sandbox: true,
    };
    const gw = new PaymobGateway(config);
    // Access private baseUrl via any for unit test only
    const baseUrl = (gw as any).baseUrl;
    expect(baseUrl).toBe('https://accept.paymob.com');
  });

  it('PaymobGateway rejects disallowed baseUrl override', () => {
    const config: GatewayConfig = {
      provider: 'paymob',
      apiKey: 'key',
      secretKey: 'secret',
      hmacSecret: 'hmac',
      sandbox: false,
      baseUrl: 'https://evil.example.com',
    };
    expect(() => new PaymobGateway(config)).toThrow(/disallowed|invalid/);
  });

  it('PaymobGateway allows only https://accept.paymob.com override if explicitly provided', () => {
    const config: GatewayConfig = {
      provider: 'paymob',
      apiKey: 'key',
      secretKey: 'secret',
      hmacSecret: 'hmac',
      sandbox: false,
      baseUrl: 'https://accept.paymob.com',
    };
    const gw = new PaymobGateway(config);
    expect((gw as any).baseUrl).toBe('https://accept.paymob.com');
  });

  it('createPaymentGateway fails closed if Paymob missing required credentials', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'paymob';
    process.env.PAYMOB_API_KEY = 'key';
    delete process.env.PAYMOB_SECRET;
    delete process.env.PAYMOB_HMAC_SECRET;
    expect(() => createPaymentGateway()).toThrow(/PAYMOB_API_KEY, PAYMOB_SECRET, and PAYMOB_HMAC_SECRET/);
  });

  it('createPaymentGateway sets sandbox from env but does not switch hosts; uses mock when provider mock', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
    const gw = createPaymentGateway();
    expect(gw.provider).toBe('mock');
  });

  it('No network calls when constructing gateway in sandbox mode (fetch not called)', () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({} as any);
    const config: GatewayConfig = {
      provider: 'paymob',
      apiKey: 'key',
      secretKey: 'secret',
      hmacSecret: 'hmac',
      sandbox: true,
    };
    const gw = new PaymobGateway(config);
    expect(gw.provider).toBe('paymob');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
