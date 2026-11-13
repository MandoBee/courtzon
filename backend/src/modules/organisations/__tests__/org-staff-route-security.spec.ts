// ============================================================================
// P0 — organization staff permission route: real route + real guards + Zod.
//
// The controller module is the REAL one; its collaborators are stubbed.
// `initRouteGuard` uses deterministic test deps. No DB, Redis or network.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';

const mocks = vi.hoisted(() => ({
  updateStaffPermissions: vi.fn(async () => ({ success: true })),
  manageAllowed: false,
}));

const makeStubModule = vi.hoisted(() => () => {
  const target: Record<string, any> = {};
  return new Proxy(target, {
    get(obj, prop) {
      if (prop === 'then' || prop === '__esModule' || typeof prop === 'symbol') return undefined;
      if (!(prop in obj)) obj[prop as string] = vi.fn();
      return obj[prop as string];
    },
    has: () => true,
  });
});

vi.mock('../application/org-portal.service.js', () => ({
  updateStaffPermissions: mocks.updateStaffPermissions,
}));
vi.mock('../infrastructure/repositories/org-portal.repository.js', makeStubModule);
vi.mock('../infrastructure/repositories/branch.repository.js', makeStubModule);
vi.mock('../application/organisation.service.js', makeStubModule);
vi.mock('../infrastructure/repositories/cancellation-policy.repository.js', makeStubModule);
vi.mock('../infrastructure/repositories/branch-financial.repository.js', makeStubModule);
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', makeStubModule);
vi.mock('../../../database/mysql.js', makeStubModule);
vi.mock('../../audit-log/index.js', makeStubModule);
vi.mock('../../financial/application/position.service.js', makeStubModule);
vi.mock('../../settlement/application/unified-settlement.service.js', makeStubModule);
vi.mock('../presentation/organisation.controller.js', makeStubModule);

import { registerOrgPortalRoutes } from '../presentation/org-portal.routes.js';
import { initRouteGuard } from '../../../shared/middleware/route-guard.js';

const app = Fastify({ logger: false });

beforeAll(async () => {
  initRouteGuard({
    checkOrgAccess: async () => true,
    checkOrgManage: async () => mocks.manageAllowed,
    checkOrgPermission: async () => true,
  });

  app.addHook('onRequest', async (request) => {
    const raw = request.headers['x-user'];
    (request as any).userId = raw ? Number(raw) : undefined;
  });
  app.setErrorHandler((error: any, _request, reply) => {
    if (error?.name === 'ZodError' || Array.isArray(error?.issues)) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR' });
    }
    return reply.status(500).send({ error: 'INTERNAL_ERROR' });
  });

  await app.register(registerOrgPortalRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  mocks.updateStaffPermissions.mockClear();
  mocks.manageAllowed = false;
});

function inject(payload: unknown, opts: { user?: number; manage?: boolean; orgId?: string } = {}) {
  mocks.manageAllowed = opts.manage ?? false;
  return app.inject({
    method: 'PUT',
    url: `/org/${opts.orgId ?? '7'}/staff/42/permissions`,
    headers: opts.user ? { 'x-user': String(opts.user) } : {},
    payload: payload as any,
  });
}

describe('PUT /org/:orgId/staff/:userId/permissions', () => {
  it('returns 401 without an authenticated user', async () => {
    const res = await inject({ permissionIds: [1] });
    expect(res.statusCode).toBe(401);
    expect(mocks.updateStaffPermissions).not.toHaveBeenCalled();
  });

  it('returns 403 when the actor cannot manage the organisation', async () => {
    const res = await inject({ permissionIds: [1] }, { user: 1, manage: false });
    expect(res.statusCode).toBe(403);
    expect(mocks.updateStaffPermissions).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing/empty permissionIds payload', async () => {
    const missing = await inject({}, { user: 1, manage: true });
    expect(missing.statusCode).toBe(400);

    const empty = await inject({ permissionIds: [] }, { user: 1, manage: true });
    expect(empty.statusCode).toBe(400);

    expect(mocks.updateStaffPermissions).not.toHaveBeenCalled();
  });

  it('returns 400 for duplicate or non-positive ids', async () => {
    for (const permissionIds of [[1, 1], [0], [-1], [1.5], ['1']]) {
      const res = await inject({ permissionIds }, { user: 1, manage: true });
      expect(res.statusCode, JSON.stringify(permissionIds)).toBe(400);
    }
    expect(mocks.updateStaffPermissions).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid route organisation id', async () => {
    const res = await inject({ permissionIds: [1] }, { user: 1, manage: true, orgId: 'abc' });
    expect(res.statusCode).toBe(400);
    expect(mocks.updateStaffPermissions).not.toHaveBeenCalled();
  });

  it('invokes the service with parsed ids only after guard + schema pass', async () => {
    const res = await inject({ permissionIds: [1, 2] }, { user: 1, manage: true });

    expect(res.statusCode).toBe(200);
    expect(mocks.updateStaffPermissions).toHaveBeenCalledWith(7, 42, [1, 2], 1);
  });
});
