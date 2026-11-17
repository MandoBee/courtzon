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
  addOrgStaff: vi.fn(async () => ({ userId: 42, roleSlug: 'org-admin' })),
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
  addOrgStaff: mocks.addOrgStaff,
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
  mocks.addOrgStaff.mockClear();
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

// ============================================================================
// POST /org/:orgId/staff — the request schema must accept exactly the
// repository allowlist. This guards against the validation layer drifting away
// from `ASSIGNABLE_ORG_ROLE_SLUGS` (which is the runtime gate).
// ============================================================================
describe('POST /org/:orgId/staff — assignable role validation', () => {
  function postStaff(payload: Record<string, unknown>, opts: { user?: number; manage?: boolean } = {}) {
    mocks.manageAllowed = opts.manage ?? false;
    return app.inject({
      method: 'POST',
      url: '/org/7/staff',
      headers: opts.user ? { 'x-user': String(opts.user) } : {},
      payload: payload as any,
    });
  }

  it.each(['org-admin', 'shop-admin', 'branch-mgr', 'resource-mgr', 'coach', 'accountant', 'marketplace-manager', 'receptionist'])(
    'accepts %s through the schema for a manager',
    async (roleSlug) => {
      const res = await postStaff({ email: 'qa.staff@courtzon.test', roleSlug }, { user: 1, manage: true });
      expect(res.statusCode, roleSlug).toBe(201);
      expect(mocks.addOrgStaff).toHaveBeenCalled();
    },
  );

  it('rejects platform roles at the schema layer', async () => {
    for (const roleSlug of ['super_admin', 'super-admin', 'master-admin', 'auditor', 'read-only-admin', 'finance-manager', 'player']) {
      const res = await postStaff({ email: 'qa.staff@courtzon.test', roleSlug }, { user: 1, manage: true });
      expect(res.statusCode, roleSlug).toBe(400);
    }
    expect(mocks.addOrgStaff).not.toHaveBeenCalled();
  });

  it('denies provisioning without authentication or organisation management', async () => {
    mocks.addOrgStaff.mockClear();

    const anonymous = await postStaff({ email: 'qa.staff@courtzon.test', roleSlug: 'receptionist' });
    expect(anonymous.statusCode).toBe(401);

    const notManager = await postStaff(
      { email: 'qa.staff@courtzon.test', roleSlug: 'receptionist' },
      { user: 1, manage: false },
    );
    expect(notManager.statusCode).toBe(403);
    expect(mocks.addOrgStaff).not.toHaveBeenCalled();
  });

  it('recognises super admin management through the org-manage guard dependency', async () => {
    // `checkOrgManage` is the sole authority (owner | super_admin | scoped
    // org.staff.manage). A super-admin session resolves to `manage: true`.
    const res = await postStaff(
      { email: 'qa.staff@courtzon.test', roleSlug: 'marketplace-manager' },
      { user: 1, manage: true },
    );
    expect(res.statusCode).toBe(201);
  });
});
