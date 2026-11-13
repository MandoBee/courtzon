// ============================================================================
// P0 — RBAC service hardening.
//
// Unit-only: repository, transaction, audit, pool and event bus are mocked.
// Proves strict permission-id validation, organization-role policy enforcement,
// atomic replacement and the global-only role-template scope.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRole: vi.fn(),
  lockRoleById: vi.fn(),
  getPermissionsByIds: vi.fn(),
  getRolePermissions: vi.fn(),
  setRolePermissions: vi.fn(),
  withTransaction: vi.fn(),
  recordAudit: vi.fn(),
  poolExecute: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: mocks.poolExecute, getConnection: vi.fn() }),
}));
vi.mock('../../../database/database.transaction.js', () => ({
  withTransaction: mocks.withTransaction,
}));
vi.mock('../infrastructure/repositories/rbac.repository.js', () => ({
  rbacRepository: {
    getRole: mocks.getRole,
    lockRoleById: mocks.lockRoleById,
    getPermissionsByIds: mocks.getPermissionsByIds,
    getRolePermissions: mocks.getRolePermissions,
    setRolePermissions: mocks.setRolePermissions,
  },
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: mocks.emit } }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({
  ratingService: { recalculateSelfDeclaredForUser: vi.fn() },
}));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: vi.fn() } }));
vi.mock('../../booking/commands/cancel-booking.command.js', () => ({
  cancelBookingHandler: { validate: vi.fn(), execute: vi.fn(), events: vi.fn() },
}));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

const { rbacService } = await import('../application/rbac.service.js');

const ORG_ROLE = { id: 501, organisation_id: 7, slug: 'branch-mgr', name: 'Branch Manager' };
const ACCOUNTANT_ROLE = { id: 502, organisation_id: 7, slug: 'accountant', name: 'Accountant' };
const GLOBAL_ROLE = { id: 1, organisation_id: null, slug: 'master-admin', name: 'Master Admin' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTransaction.mockImplementation(async (fn: any) => fn({}));
  mocks.getRolePermissions.mockResolvedValue([]);
  mocks.getRole.mockImplementation(async (id: number) =>
    id === 501 ? ORG_ROLE : id === 502 ? ACCOUNTANT_ROLE : GLOBAL_ROLE,
  );
  mocks.lockRoleById.mockImplementation(async (id: number) =>
    id === 501
      ? { ...ORG_ROLE, is_active: true, deleted_at: null }
      : id === 502
        ? { ...ACCOUNTANT_ROLE, is_active: true, deleted_at: null }
        : { ...GLOBAL_ROLE, is_active: true, deleted_at: null },
  );
  mocks.getPermissionsByIds.mockImplementation(async (ids: number[]) =>
    ids.map((id) => ({
      id,
      permission_key:
        id === 1
          ? 'financial.reconcile'
          : id === 2
            ? 'refunds.view'
            : id === 3
              ? 'refunds.export'
              : 'org.accounting.view',
    })),
  );
});

describe('setRolePermissions — strict input validation', () => {
  it.each([
    ['non-array', 'not-an-array'],
    ['null', null],
    ['undefined', undefined],
    ['zero', [0]],
    ['negative', [-1]],
    ['decimal', [1.5]],
    ['string id', ['1']],
    ['NaN', [Number.NaN]],
    ['duplicate', [1, 1]],
    ['mixed valid/invalid', [1, 0]],
  ])('rejects %s before any DB write', async (_label, ids) => {
    await expect(
      rbacService.setRolePermissions(1, ids as any, 99),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mocks.setRolePermissions).not.toHaveBeenCalled();
    expect(mocks.withTransaction).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('rejects unknown permission ids before deleting existing permissions', async () => {
    mocks.getPermissionsByIds.mockResolvedValueOnce([]);

    await expect(rbacService.setRolePermissions(1, [999], 99)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mocks.setRolePermissions).not.toHaveBeenCalled();
    // The transaction may be opened before the ID lookup, but it must not write.
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('rejects an invalid role id', async () => {
    await expect(rbacService.setRolePermissions(0, [1], 99)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('setRolePermissions — organization role policy', () => {
  it('rejects a platform-only permission for an organization role', async () => {
    await expect(rbacService.setRolePermissions(501, [1], 99)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mocks.setRolePermissions).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('rejects refunds.export for a non-admin/non-accountant organization role', async () => {
    await expect(rbacService.setRolePermissions(501, [3], 99)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mocks.setRolePermissions).not.toHaveBeenCalled();
  });

  it('allows refunds.export for accountant and replaces permissions atomically', async () => {
    await rbacService.setRolePermissions(502, [2, 3], 99);

    expect(mocks.withTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.setRolePermissions).toHaveBeenCalledWith(502, [2, 3], expect.anything());
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 99,
        action: 'RBAC.ROLE_PERMISSIONS_UPDATED',
        entityType: 'role',
        entityId: 502,
        afterState: expect.objectContaining({ organisationId: 7 }),
      }),
    );
  });

  it('still allows platform permissions on global platform roles', async () => {
    await rbacService.setRolePermissions(1, [1], 99);

    expect(mocks.setRolePermissions).toHaveBeenCalledWith(1, [1], expect.anything());
    expect(mocks.recordAudit).toHaveBeenCalled();
  });

  it('allows an explicit empty array to clear a global role, with audit', async () => {
    await rbacService.setRolePermissions(1, [], 99);

    expect(mocks.setRolePermissions).toHaveBeenCalledWith(1, [], expect.anything());
    expect(mocks.recordAudit).toHaveBeenCalled();
  });

  it('rejects an explicit empty array for an organization-owned role through the Super Admin path', async () => {
    await expect(rbacService.setRolePermissions(501, [], 99)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mocks.setRolePermissions).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('propagates a failed atomic write without auditing a false success', async () => {
    mocks.setRolePermissions.mockRejectedValueOnce(new Error('insert failed'));

    await expect(rbacService.setRolePermissions(502, [2], 99)).rejects.toThrow('insert failed');
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe('setOrganisationRolePermissions — atomic org-owned updates', () => {
  it('rejects an empty array for an organization role', async () => {
    await expect(
      rbacService.setOrganisationRolePermissions(7, 502, [], 99),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mocks.withTransaction).not.toHaveBeenCalled();
    expect(mocks.setRolePermissions).not.toHaveBeenCalled();
  });

  it('rejects a role that belongs to another organisation before any write', async () => {
    mocks.lockRoleById.mockResolvedValueOnce({
      ...ACCOUNTANT_ROLE,
      organisation_id: 8,
      is_active: true,
      deleted_at: null,
    });

    await expect(
      rbacService.setOrganisationRolePermissions(7, 502, [2], 99),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mocks.setRolePermissions).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('rejects platform-only permissions for an organisation role', async () => {
    await expect(
      rbacService.setOrganisationRolePermissions(7, 501, [1], 99),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mocks.setRolePermissions).not.toHaveBeenCalled();
  });

  it('replaces permissions atomically for accountant and audits the committed state', async () => {
    await rbacService.setOrganisationRolePermissions(7, 502, [2, 3], 99);

    expect(mocks.withTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.setRolePermissions).toHaveBeenCalledWith(502, [2, 3], expect.anything());
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 99,
        action: 'RBAC.ORGANISATION_ROLE_PERMISSIONS_UPDATED',
        entityId: 502,
        beforeState: { permissionIds: [], organisationId: 7 },
        afterState: expect.objectContaining({ permissionIds: [2, 3], organisationId: 7 }),
      }),
    );
  });

  it('does not audit when the transaction fails', async () => {
    mocks.setRolePermissions.mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      rbacService.setOrganisationRolePermissions(7, 502, [2], 99),
    ).rejects.toThrow('insert failed');
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe('applyRoleTemplates — global roles only', () => {
  it('queries only global roles', async () => {
    mocks.poolExecute
      .mockResolvedValueOnce([[{ id: 10, permission_key: 'platform.admin' }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await rbacService.applyRoleTemplates(false);

    const rolesQuery = String(mocks.poolExecute.mock.calls[1][0]);
    expect(rolesQuery).toContain('organisation_id IS NULL');
    expect(rolesQuery).toContain('deleted_at IS NULL');
  });

  it('never grants or prunes permissions for an organization-owned role', async () => {
    mocks.poolExecute
      // permissions catalogue
      .mockResolvedValueOnce([[{ id: 10, permission_key: 'platform.admin' }], []])
      // roles: one global super_admin + one organization accountant
      .mockResolvedValueOnce([
        [
          { id: 1, slug: 'super_admin', organisation_id: null },
          { id: 501, slug: 'accountant', organisation_id: 7 },
        ],
        [],
      ])
      // existing permissions for role 1
      .mockResolvedValueOnce([[], []])
      // insert platform.admin for role 1
      .mockResolvedValueOnce([{}, []])
      // super_admin lookup
      .mockResolvedValueOnce([[{ id: 1 }], []])
      // ensure platform.admin for super_admin
      .mockResolvedValueOnce([{}, []]);

    const result = await rbacService.applyRoleTemplates(true);

    expect(result.roles).toHaveLength(1);
    expect(result.roles[0]).toMatchObject({ slug: 'super_admin', organisationId: null });
    expect(result.roles.some((role) => role.organisationId === 7)).toBe(false);

    const writes = mocks.poolExecute.mock.calls.filter((call) =>
      /INSERT IGNORE INTO role_permissions/.test(String(call[0])),
    );
    for (const call of writes) {
      expect(call[1][0]).not.toBe(501);
    }
    const deletes = mocks.poolExecute.mock.calls.filter((call) =>
      /DELETE FROM role_permissions/.test(String(call[0])),
    );
    expect(deletes).toHaveLength(0);
  });
});
