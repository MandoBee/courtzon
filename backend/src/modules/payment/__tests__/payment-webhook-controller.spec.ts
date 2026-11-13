import { describe, it, expect, vi, beforeEach } from 'vitest';

// The controller module now also pulls the refund guard chain (financial
// entitlement service / org access / config), so provide the unit-test env.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

/**
 * P5-02 — webhook controller signature handling.
 *
 * Invalid HMAC must map to HTTP 401 and must not record a successful webhook
 * audit; the state/event non-mutation is proven at the service boundary in
 * `webhook-signature-handling.spec.ts`. No provider or database call is made.
 */

const mocks = vi.hoisted(() => ({
  handleWebhook: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('../application/payment.service.js', () => ({
  paymentService: { handleWebhook: mocks.handleWebhook },
}));

vi.mock('../application/reconciliation.service.js', () => ({
  reconciliationService: { run: vi.fn(), history: vi.fn() },
}));

vi.mock('../../audit-log/index.js', () => ({
  recordAudit: mocks.recordAudit,
}));

const ctrl = await import('../presentation/payment.controller.js');

function makeReply() {
  const reply: any = {
    status: vi.fn(() => reply),
    send: vi.fn(() => reply),
  };
  return reply;
}

function makeRequest(overrides: Record<string, any> = {}): any {
  return {
    body: { obj: { id: 123, success: true, pending: false } },
    query: {},
    headers: {},
    ip: '127.0.0.1',
    userId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P5-02 webhook controller — signature rejection', () => {
  it('returns 401 for an invalid signature and does not audit a successful webhook', async () => {
    mocks.handleWebhook.mockRejectedValueOnce(new Error('Invalid webhook signature'));
    const request = makeRequest({ query: { hmac: 'bad-signature' } });
    const reply = makeReply();

    await ctrl.webhookHandler(request, reply);

    expect(mocks.handleWebhook).toHaveBeenCalledTimes(1);
    expect(mocks.handleWebhook).toHaveBeenCalledWith(request.body, 'bad-signature');
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid signature' });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('extracts the signature from the x-paymob-signature header when no query hmac is present', async () => {
    mocks.handleWebhook.mockRejectedValueOnce(new Error('Invalid webhook signature'));
    const request = makeRequest({ headers: { 'x-paymob-signature': 'header-sig' } });
    const reply = makeReply();

    await ctrl.webhookHandler(request, reply);

    expect(mocks.handleWebhook).toHaveBeenCalledWith(request.body, 'header-sig');
    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('prefers the Intention query hmac over the header', async () => {
    mocks.handleWebhook.mockRejectedValueOnce(new Error('Invalid webhook signature'));
    const request = makeRequest({
      query: { hmac: 'query-sig' },
      headers: { 'x-paymob-signature': 'header-sig' },
    });
    const reply = makeReply();

    await ctrl.webhookHandler(request, reply);

    expect(mocks.handleWebhook).toHaveBeenCalledWith(request.body, 'query-sig');
  });

  it('passes an empty string when no signature is supplied (service fails closed)', async () => {
    mocks.handleWebhook.mockRejectedValueOnce(new Error('Invalid webhook signature'));
    const request = makeRequest();
    const reply = makeReply();

    await ctrl.webhookHandler(request, reply);

    expect(mocks.handleWebhook).toHaveBeenCalledWith(request.body, '');
    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('maps a missing gateway reference to 400 (not a signature rejection)', async () => {
    mocks.handleWebhook.mockRejectedValueOnce(new Error('Missing gateway reference'));
    const reply = makeReply();

    await ctrl.webhookHandler(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Missing gateway reference' });
  });

  it('returns 500 for a non-signature processing error', async () => {
    mocks.handleWebhook.mockRejectedValueOnce(new Error('database unavailable'));
    const reply = makeReply();

    await ctrl.webhookHandler(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Webhook processing failed' });
  });

  it('audits and returns the service result for an accepted webhook', async () => {
    mocks.handleWebhook.mockResolvedValueOnce({ received: true });
    const reply = makeReply();
    const request = makeRequest({ query: { hmac: 'valid-sig' } });

    await ctrl.webhookHandler(request, reply);

    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({
      action: 'PAYMENT.WEBHOOK',
      entityType: 'payment',
    });
    expect(reply.send).toHaveBeenCalledWith({ received: true });
  });
});
