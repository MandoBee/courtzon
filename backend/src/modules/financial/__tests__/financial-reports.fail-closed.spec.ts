import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Financial Reports — fail-closed behavior when the dedicated authorization
 * dependency is not wired.
 *
 * `initAuthMiddleware` is a singleton, so this scenario needs its own module
 * instance (a separate spec file). No database is used.
 */

const { ledgerCtrlMock } = vi.hoisted(() => ({
  ledgerCtrlMock: {
    getRevenueHandler: vi.fn(),
    getLedgerHandler: vi.fn(),
    getWalletSummaryHandler: vi.fn(),
    getEntryHandler: vi.fn(),
  },
}));

vi.mock('../presentation/ledger.controller.js', () => ledgerCtrlMock);

import { initAuthMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { ledgerRoutes } from '../presentation/ledger.routes.js';

type Guard = (req: unknown, reply: unknown) => unknown;
type CapturedRoute = { path: string; preHandler: Guard[] };

function captureApp() {
  const routes: CapturedRoute[] = [];
  const app: any = {
    addHook: () => undefined,
    get: (path: string, opts: any) => {
      routes.push({ path, preHandler: (opts?.preHandler ?? []) as Guard[] });
      return app;
    },
  };
  return { app, routes };
}

function makeReply() {
  const reply: any = { statusCode: 0 };
  reply.status = vi.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = vi.fn(() => reply);
  return reply;
}

async function invoke(route: CapturedRoute, userId: number): Promise<number> {
  const reply = makeReply();
  for (const guard of route.preHandler) {
    await guard({ userId } as unknown, reply);
    if (reply.statusCode) return reply.statusCode;
  }
  return 0;
}

let routes: CapturedRoute[] = [];

beforeAll(async () => {
  initAuthMiddleware({
    resolveUser: vi.fn(async () => 7),
    checkRole: vi.fn(async () => true),
    checkPermission: vi.fn(async () => true),
    checkOrgApproved: vi.fn(async () => true),
    // checkFinancialReportsAccess intentionally omitted.
  });

  const captured = captureApp();
  await ledgerRoutes(captured.app);
  routes = captured.routes;
});

describe('Financial Reports — missing authorization dependency', () => {
  it('fails closed (500) on every report endpoint instead of allowing access', async () => {
    for (const path of [
      '/admin/financial/revenue',
      '/admin/financial/ledger',
      '/admin/financial/wallet-summary',
    ]) {
      const found = routes.find((r) => r.path === path);
      expect(found, path).toBeTruthy();
      expect(await invoke(found!, 7), path).toBe(500);
    }
  });
});
