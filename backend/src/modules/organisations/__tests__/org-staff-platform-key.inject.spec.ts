// ============================================================================
// B1 follow-up — HTTP-level proof that the organisation staff endpoints refuse
// the three platform marketplace capabilities:
//
//   marketplace.moderate
//   marketplace.complaints.approve
//   marketplace.player.activate
//
// Scope of realism:
//   - REAL Fastify routes  (`registerOrgPortalRoutes`)
//   - REAL controller      (`org-portal.controller.ts`)
//   - REAL service/policy  (`org-portal.service.ts` + `org-permission-policy`)
//   - MOCKED collaborators (repository + rbac repository + rbac service)
//
// No MySQL, no Redis, no network, no Live access: `database/mysql.js` is
// stubbed and every write-capable collaborator is a `vi.fn()`, so "no INSERT /
// no UPDATE" is asserted by proving none of them was called.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import { AppError } from '../../../shared/errors/app-error.js';

const repo = vi.hoisted(() => ({
  getAssignableOrgRole: vi.fn(),
  findUserByEmail: vi.fn(),
  getOrgOwnerId: vi.fn(),
  listOrgStaff: vi.fn(),
  addStaffScope: vi.fn(),
  removeStaffFromOrg: vi.fn(),
  branchBelongsToOrg: vi.fn(),
  resourceBelongsToOrg: vi.fn(),
}));

const rbacRepo = vi.hoisted(() => ({
  getPermissionsByIds: vi.fn(),
  getRoleById: vi.fn(),
  getRolePermissionsWithLabels: vi.fn(),
  cloneRoleForOrg: vi.fn(),
  setRolePermissions: vi.fn(),
  replaceRolePermissionsInTransaction: vi.fn(),
}));

const rbacService = vi.hoisted(() => ({
  setOrganisationRolePermissions: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

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

vi.mock('../infrastructure/repositories/org-portal.repository.js', () => repo);
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({
  rbacRepository: rbacRepo,
}));
vi.mock('../../rbac/application/rbac.service.js', () => ({ rbacService }));
vi.mock('../../audit-log/index.js', () => audit);
vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: vi.fn(), on: vi.fn() },
}));
vi.mock('../application/plan-limits.util.js', () => ({
  getPlanNumericLimit: vi.fn(async () => Infinity),
}));
vi.mock('../infrastructure/repositories/branch.repository.js', makeStubModule);
vi.mock('../infrastructure/repositories/cancellation-policy.repository.js', makeStubModule);
vi.mock('../infrastructure/repositories/branch-financial.repository.js', makeStubModule);
vi.mock('../application/organisation.service.js', makeStubModule);
vi.mock('../../financial/application/position.service.js', makeStubModule);
vi.mock('../../settlement/application/unified-settlement.service.js', makeStubModule);

import { registerOrgPortalRoutes } from '../presentation/org-portal.routes.js';
import { initRouteGuard } from '../../../shared/middleware/route-guard.js';
import { ASSIGNABLE_ORG_ROLE_SLUGS } from '../domain/org-staff-roles.js';

const ORG_ID = 38; // QA org id used throughout the C7–C12 UAT; mocked, never touched.
const ACTOR_ID = 1;
const STAFF_USER_ID = 42;
const ORG_ROLE_ID = 901;

const PERMISSION_IDS = {
  stockView: 601,
  transfersCreate: 604,
  moderate: 607,
  complaintsApprove: 608,
  playerActivate: 609,
} as const;

const PLATFORM_KEYS = [
  { id: PERMISSION_IDS.moderate, key: 'marketplace.moderate' },
  { id: PERMISSION_IDS.complaintsApprove, key: 'marketplace.complaints.approve' },
  { id: PERMISSION_IDS.playerActivate, key: 'marketplace.player.activate' },
] as const;

const app = Fastify({ logger: false });

beforeAll(async () => {
  initRouteGuard({
    checkOrgAccess: async () => true,
    checkOrgManage: async () => true,
    checkOrgPermission: async () => true,
  });

  app.addHook('onRequest', async (request) => {
    const raw = request.headers['x-user'];
    (request as any).userId = raw ? Number(raw) : undefined;
  });
  app.setErrorHandler((error: any, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.errorCode, message: error.message });
    }
    if (error?.name === 'ZodError' || Array.isArray(error?.issues)) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR' });
    }
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: error?.message });
  });

  await app.register(registerOrgPortalRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
  for (const fn of Object.values(rbacRepo)) fn.mockReset();
  rbacService.setOrganisationRolePermissions.mockReset();
  audit.recordAudit.mockClear();

  repo.getOrgOwnerId.mockResolvedValue(999);
  repo.listOrgStaff.mockResolvedValue([]);
  repo.addStaffScope.mockResolvedValue({ success: true });
  repo.removeStaffFromOrg.mockResolvedValue({ success: true });
  rbacRepo.cloneRoleForOrg.mockResolvedValue(ORG_ROLE_ID);
  rbacRepo.setRolePermissions.mockResolvedValue(undefined);
  rbacRepo.replaceRolePermissionsInTransaction.mockResolvedValue(undefined);
  rbacService.setOrganisationRolePermissions.mockResolvedValue(undefined);
});

function postStaff(payload: Record<string, unknown>, user: number | undefined = ACTOR_ID) {
  return app.inject({
    method: 'POST',
    url: `/org/${ORG_ID}/staff`,
    headers: user ? { 'x-user': String(user) } : {},
    payload: payload as any,
  });
}

function putStaffPermissions(permissionIds: number[], user: number | undefined = ACTOR_ID) {
  return app.inject({
    method: 'PUT',
    url: `/org/${ORG_ID}/staff/${STAFF_USER_ID}/permissions`,
    headers: user ? { 'x-user': String(user) } : {},
    payload: { permissionIds } as any,
  });
}

/** A template lookup stub that accepts every assignable role slug. */
function stubTemplates() {
  repo.getAssignableOrgRole.mockImplementation(async (slug: string) => ({
    id: 100 + ASSIGNABLE_ORG_ROLE_SLUGS.indexOf(slug as any),
    slug,
    name: slug,
    organisation_id: null,
  }));
}

function stubExistingStaff() {
  repo.listOrgStaff.mockResolvedValue([
    { user_id: STAFF_USER_ID, role_id: ORG_ROLE_ID, role_slug: 'marketplace-manager' },
  ]);
  rbacRepo.getRoleById.mockResolvedValue({
    id: ORG_ROLE_ID,
    organisation_id: ORG_ID,
    slug: 'marketplace-manager',
  });
}

/** No write-capable collaborator may run before the policy rejection. */
function expectNoWrites() {
  expect(rbacRepo.cloneRoleForOrg).not.toHaveBeenCalled();
  expect(rbacRepo.setRolePermissions).not.toHaveBeenCalled();
  expect(rbacRepo.replaceRolePermissionsInTransaction).not.toHaveBeenCalled();
  expect(rbacService.setOrganisationRolePermissions).not.toHaveBeenCalled();
  expect(repo.addStaffScope).not.toHaveBeenCalled();
  expect(repo.removeStaffFromOrg).not.toHaveBeenCalled();
  expect(audit.recordAudit).not.toHaveBeenCalled();
}

describe('POST /org/:orgId/staff — platform marketplace keys are rejected over HTTP', () => {
  it('returns 403 for marketplace.player.activate before any role clone or insert', async () => {
    stubTemplates();
    rbacRepo.getPermissionsByIds.mockResolvedValue([
      { id: PERMISSION_IDS.playerActivate, permission_key: 'marketplace.player.activate' },
    ]);

    const res = await postStaff({
      email: 'qa.staff@courtzon.test',
      roleSlug: 'marketplace-manager',
      permissionIds: [PERMISSION_IDS.playerActivate],
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
    expect(res.json().message).toContain('marketplace.player.activate');

    // Rejection happens while resolving the ids: no user lookup, no owner
    // lookup, no clone, no permission write, no scope insert, no audit row.
    expect(repo.findUserByEmail).not.toHaveBeenCalled();
    expect(repo.getOrgOwnerId).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(PLATFORM_KEYS)('returns 403 for $key', async ({ id, key }) => {
    stubTemplates();
    rbacRepo.getPermissionsByIds.mockResolvedValue([{ id, permission_key: key }]);

    const res = await postStaff({
      email: 'qa.staff@courtzon.test',
      roleSlug: 'receptionist',
      permissionIds: [id],
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain(key);
    expectNoWrites();
  });

  it.each([...ASSIGNABLE_ORG_ROLE_SLUGS])(
    'returns 403 for all three keys combined on role %s',
    async (roleSlug) => {
      stubTemplates();
      rbacRepo.getPermissionsByIds.mockResolvedValue(
        PLATFORM_KEYS.map((p) => ({ id: p.id, permission_key: p.key })),
      );

      const res = await postStaff({
        email: 'qa.staff@courtzon.test',
        roleSlug,
        permissionIds: PLATFORM_KEYS.map((p) => p.id),
      });

      expect(res.statusCode, roleSlug).toBe(403);
      expectNoWrites();
    },
  );

  // Control: proves the harness really reaches the write path, so the "no
  // writes" assertions above are meaningful rather than an artefact of a
  // broken mock.
  it('allows the approved Inventory key and then performs the writes (control)', async () => {
    stubTemplates();
    rbacRepo.getPermissionsByIds.mockResolvedValue([
      { id: PERMISSION_IDS.stockView, permission_key: 'inventory.stock.view' },
    ]);
    repo.findUserByEmail.mockResolvedValue({
      id: STAFF_USER_ID,
      full_name: 'QA Staff',
      email: 'qa.staff@courtzon.test',
    });

    const res = await postStaff({
      email: 'qa.staff@courtzon.test',
      roleSlug: 'marketplace-manager',
      permissionIds: [PERMISSION_IDS.stockView],
    });

    expect(res.statusCode).toBe(201);
    expect(rbacRepo.cloneRoleForOrg).toHaveBeenCalledTimes(1);
    expect(rbacService.setOrganisationRolePermissions).toHaveBeenCalledWith(
      ORG_ID,
      ORG_ROLE_ID,
      [PERMISSION_IDS.stockView],
      ACTOR_ID,
    );
    expect(repo.addStaffScope).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /org/:orgId/staff/:userId/permissions — platform keys are rejected over HTTP', () => {
  it.each(PLATFORM_KEYS)('returns 403 for $key with no write', async ({ id, key }) => {
    stubExistingStaff();
    rbacRepo.getPermissionsByIds.mockResolvedValue([{ id, permission_key: key }]);

    const res = await putStaffPermissions([id]);

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
    expect(res.json().message).toContain(key);
    expectNoWrites();
  });

  it('returns 403 even when the platform key is mixed with an allowed key', async () => {
    stubExistingStaff();
    rbacRepo.getPermissionsByIds.mockResolvedValue([
      { id: PERMISSION_IDS.stockView, permission_key: 'inventory.stock.view' },
      { id: PERMISSION_IDS.playerActivate, permission_key: 'marketplace.player.activate' },
    ]);

    const res = await putStaffPermissions([PERMISSION_IDS.stockView, PERMISSION_IDS.playerActivate]);

    expect(res.statusCode).toBe(403);
    expectNoWrites();
  });

  // Control: the same endpoint still performs the atomic replacement for an
  // approved Inventory key, proving the 403s come from the policy.
  it('applies an approved Inventory key (control)', async () => {
    stubExistingStaff();
    rbacRepo.getPermissionsByIds.mockResolvedValue([
      { id: PERMISSION_IDS.stockView, permission_key: 'inventory.stock.view' },
    ]);

    const res = await putStaffPermissions([PERMISSION_IDS.stockView]);

    expect(res.statusCode).toBe(200);
    expect(rbacService.setOrganisationRolePermissions).toHaveBeenCalledWith(
      ORG_ID,
      ORG_ROLE_ID,
      [PERMISSION_IDS.stockView],
      ACTOR_ID,
    );
  });
});
