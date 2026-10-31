import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';

/**
 * P5-03 — payment route authorization.
 *
 * Expected access is derived exclusively from `payment.routes.ts`:
 *   POST /payments/webhook                            → public (gateway call)
 *   POST /payments/charge                             → financial.payment.charge
 *   POST /payments/confirm                            → financial.payment.confirm
 *   GET  /payments/status/:id                         → financial.payment.view
 *   POST /payments/:id/refund                         → financial.reconcile
 *   GET  /payments/transactions                       → financial.wallet.view
 *   POST /payments/sync|expire|recover/:ref           → financial.reconcile
 *   GET  /payments/health, /payments/production-readiness → financial.reconcile
 *   POST /payments/reconciliation/run, GET .../history → financial.reconcile
 *
 * The real `authMiddleware` / `requirePermission` run against deterministic
 * test dependencies; only the controllers are stubbed. No DB/provider call.
 */

const stub = vi.hoisted(() => {
  const ok = vi.fn(async () => ({ ok: true }));
  return {
    ok,
    handlers: {
      chargeHandler: ok,
      confirmPaymentHandler: ok,
      getPaymentStatusHandler: ok,
      refundHandler: ok,
      getTransactionsHandler: ok,
      syncHandler: ok,
      expireHandler: ok,
      recoverHandler: ok,
      healthHandler: ok,
      reconciliationRunHandler: ok,
      reconciliationHistoryHandler: ok,
      productionReadinessHandler: ok,
      webhookHandler: ok,
    },
  };
});

vi.mock('../presentation/payment.controller.js', () => stub.handlers);

import { paymentRoutes } from '../presentation/payment.routes.js';
import { initAuthMiddleware } from '../../../shared/middleware/auth.middleware.js';

const app = Fastify({ logger: false });

const ROUTES = [
  { method: 'POST' as const, url: '/payments/charge', permission: 'financial.payment.charge' },
  { method: 'POST' as const, url: '/payments/confirm', permission: 'financial.payment.confirm' },
  { method: 'GET' as const, url: '/payments/status/9', permission: 'financial.payment.view' },
  { method: 'POST' as const, url: '/payments/9/refund', permission: 'financial.reconcile' },
  { method: 'GET' as const, url: '/payments/transactions', permission: 'financial.wallet.view' },
  { method: 'POST' as const, url: '/payments/sync', permission: 'financial.reconcile' },
  { method: 'POST' as const, url: '/payments/expire', permission: 'financial.reconcile' },
  { method: 'POST' as const, url: '/payments/recover/gref-1', permission: 'financial.reconcile' },
  { method: 'GET' as const, url: '/payments/health', permission: 'financial.reconcile' },
  { method: 'POST' as const, url: '/payments/reconciliation/run', permission: 'financial.reconcile' },
  { method: 'GET' as const, url: '/payments/reconciliation/history', permission: 'financial.reconcile' },
  { method: 'GET' as const, url: '/payments/production-readiness', permission: 'financial.reconcile' },
];

beforeAll(async () => {
  initAuthMiddleware({
    resolveUser: async (request: any) =>
      request.headers['x-test-user'] ? Number(request.headers['x-test-user']) : null,
    checkPermission: async (_userId: number, permissions: string[]) => {
      const granted = String((globalThis as any).__perms ?? '').split(',');
      return permissions.every((p) => granted.includes(p));
    },
    checkRole: async () => false,
    checkOrgApproved: async () => true,
  });
  await app.register(paymentRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function headers(user?: number, perms = ''): Record<string, string> {
  (globalThis as any).__perms = perms;
  return {
    ...(user ? { 'x-test-user': String(user) } : {}),
    ...(perms ? { 'x-test-perms': perms } : {}),
  };
}

describe('P5-03 payment route authorization', () => {
  it('keeps the gateway webhook public', async () => {
    const res = await app.inject({ method: 'POST', url: '/payments/webhook', payload: {} });
    expect(res.statusCode).toBe(200);
  });

  it.each(ROUTES)('$method $url requires authentication', async (route) => {
    const res = await app.inject({ method: route.method, url: route.url, headers: headers() });
    expect(res.statusCode).toBe(401);
  });

  it.each(ROUTES)('$method $url denies a user without $permission', async (route) => {
    const res = await app.inject({
      method: route.method,
      url: route.url,
      headers: headers(1, 'some.other.permission'),
    });
    expect(res.statusCode).toBe(403);
  });

  it.each(ROUTES)('$method $url allows a user with $permission', async (route) => {
    const res = await app.inject({
      method: route.method,
      url: route.url,
      headers: headers(1, route.permission),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
