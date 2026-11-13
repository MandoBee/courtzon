// ============================================================================
// Refund Engine — route authorization matrix.
//
// Unit-only: the controllers are stubbed and auth dependencies are deterministic
// (no DB, Redis or network). Proves every `/refunds` route is protected by the
// dedicated permission and that a missing permission is denied before any
// handler executes.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';

const stub = vi.hoisted(() => {
  const ok = vi.fn(async () => ({ ok: true }));
  return {
    handlers: {
      listRefundCasesHandler: ok,
      exportRefundCasesHandler: ok,
      getRefundCaseHandler: ok,
      createRefundCaseHandler: ok,
      approveRefundCaseHandler: ok,
      rejectRefundCaseHandler: ok,
      retryOperationalHandler: ok,
      recordPayoutHandler: ok,
      confirmPayoutHandler: ok,
      failPayoutHandler: ok,
    },
  };
});

vi.mock('../presentation/refund.controller.js', () => stub.handlers);

import { refundRoutes } from '../presentation/refund.routes.js';
import { initAuthMiddleware } from '../../../shared/middleware/auth.middleware.js';

const app = Fastify({ logger: false });

const ROUTES = [
  { method: 'GET' as const, url: '/refunds', permission: 'refunds.view' },
  { method: 'GET' as const, url: '/refunds/export', permission: 'refunds.export' },
  { method: 'GET' as const, url: '/refunds/7', permission: 'refunds.view' },
  { method: 'POST' as const, url: '/refunds', permission: 'refunds.request' },
  { method: 'POST' as const, url: '/refunds/7/approve', permission: 'refunds.approve' },
  { method: 'POST' as const, url: '/refunds/7/reject', permission: 'refunds.reject' },
  { method: 'POST' as const, url: '/refunds/7/retry-operational', permission: 'refunds.retry' },
  { method: 'POST' as const, url: '/refunds/7/payouts', permission: 'refunds.payout' },
  { method: 'POST' as const, url: '/refunds/7/payouts/55/confirm', permission: 'refunds.payout.confirm' },
  { method: 'POST' as const, url: '/refunds/7/payouts/55/fail', permission: 'refunds.payout' },
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
  await app.register(refundRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function headers(user?: number, perms = ''): Record<string, string> {
  (globalThis as any).__perms = perms;
  return user ? { 'x-test-user': String(user) } : {};
}

describe('Refund Engine route authorization', () => {
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

  it('does not let a view-only user approve or pay', async () => {
    for (const route of ROUTES.filter((entry) => entry.permission !== 'refunds.view')) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        headers: headers(1, 'refunds.view'),
      });
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(403);
    }
  });
});
