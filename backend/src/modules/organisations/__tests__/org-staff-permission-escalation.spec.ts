// ============================================================================
// R4 — organisation RBAC escalation tests.
//
// Unit-only: every repository/module is mocked; no DB, Redis or gateway is used.
// Covers:
//   - organisation role cloning cannot inherit platform-only permissions,
//   - direct `permissionIds` grants are validated against canonical records,
//   - the organisation endpoint cannot rewrite a GLOBAL template role.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const repoMock = vi.hoisted(() => ({
  getAssignableOrgRole: vi.fn(),
  findUserByEmail: vi.fn(),
  getOrgOwnerId: vi.fn(),
  listOrgStaff: vi.fn(),
  branchBelongsToOrg: vi.fn(),
  resourceBelongsToOrg: vi.fn(),
  addStaffScope: vi.fn(),
  removeStaffFromOrg: vi.fn(),
}));

const rbacMock = vi.hoisted(() => ({
  cloneRoleForOrg: vi.fn(),
  setRolePermissions: vi.fn(),
  getRoleById: vi.fn(),
  getPermissionsByIds: vi.fn(),
}));

const rbacServiceMock = vi.hoisted(() => ({
  setOrganisationRolePermissions: vi.fn(),
}));

vi.mock('../infrastructure/repositories/org-portal.repository.js', () => repoMock);
vi.mock('../infrastructure/repositories/branch.repository.js', () => ({ branchRepository: {} }));
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({ rbacRepository: rbacMock }));
vi.mock('../../rbac/application/rbac.service.js', () => ({ rbacService: rbacServiceMock }));
vi.mock('../application/plan-limits.util.js', () => ({ getPlanNumericLimit: vi.fn(async () => 10) }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn(() => ({ execute: vi.fn(async () => [[], []]) })) }));

const { addOrgStaff, updateStaffPermissions, changeOrgStaffRole } = await import('../application/org-portal.service.js');

const ORG_ID = 7;
const STAFF_ROLE = { id: 900, slug: 'accountant', name: 'Accountant', organisation_id: null };
const STAFF = [{ user_id: 42, role_id: 901, role_slug: 'accountant', role_name: 'Accountant' }];

const PERMISSION_KEYS: Record<number, string> = {
  512: 'financial.reconcile',
  513: 'financial.payment.refund',
  700: 'org.accounting.view',
  801: 'refunds.view',
  802: 'refunds.request',
  803: 'refunds.approve',
  804: 'refunds.reject',
  805: 'refunds.payout',
  806: 'refunds.payout.confirm',
  807: 'refunds.retry',
  808: 'refunds.export',
  809: 'refunds.future',
};
const REFUND_IDS = [801, 802, 803, 804, 805, 806, 807, 808];

describe('R4 — organisation staff permission escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.getAssignableOrgRole.mockResolvedValue(STAFF_ROLE);
    repoMock.findUserByEmail.mockResolvedValue({ id: 42 });
    repoMock.getOrgOwnerId.mockResolvedValue(1);
    repoMock.listOrgStaff.mockResolvedValue(STAFF);
    rbacMock.cloneRoleForOrg.mockResolvedValue(901);
    rbacMock.getRoleById.mockResolvedValue({ id: 901, organisation_id: ORG_ID, slug: 'accountant' });
    rbacMock.getPermissionsByIds.mockImplementation(async (ids: number[]) =>
      ids.map((id) => ({ id, permission_key: PERMISSION_KEYS[id] ?? 'org.accounting.view' }))
    );
  });

  it('rejects a direct financial.reconcile grant and creates NOTHING', async () => {
    await expect(
      addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1, undefined, undefined, [512]),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
    expect(repoMock.addStaffScope).not.toHaveBeenCalled();
  });

  it('rejects the new financial.payment.refund permission for organisation staff', async () => {
    await expect(
      addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1, undefined, undefined, [513]),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('rejects unknown permission ids before cloning', async () => {
    rbacMock.getPermissionsByIds.mockResolvedValueOnce([]);
    await expect(
      addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1, undefined, undefined, [999999]),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('rejects a MIXED allowed/disallowed grant entirely (no partial grant)', async () => {
    await expect(
      addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1, undefined, undefined, [700, 512]),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('accepts a legitimate organisation permission set', async () => {
    const result = await addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1, undefined, undefined, [700]);
    expect(rbacServiceMock.setOrganisationRolePermissions).toHaveBeenCalledWith(ORG_ID, 901, [700], 1);
    expect(result).toMatchObject({ userId: 42 });
  });

  it('keeps the filtered clone when no permission override is supplied', async () => {
    await addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1);
    expect(rbacMock.cloneRoleForOrg).toHaveBeenCalledWith(STAFF_ROLE.id, ORG_ID);
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('updateStaffPermissions rejects a GLOBAL template role (cannot rewrite platform roles)', async () => {
    rbacMock.getRoleById.mockResolvedValueOnce({ id: 901, organisation_id: null, slug: 'accountant' });
    await expect(updateStaffPermissions(ORG_ID, 42, [700])).rejects.toMatchObject({ statusCode: 400 });
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('updateStaffPermissions rejects platform-only ids', async () => {
    await expect(updateStaffPermissions(ORG_ID, 42, [512])).rejects.toMatchObject({ statusCode: 403 });
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('updateStaffPermissions applies validated org-scoped ids', async () => {
    const result = await updateStaffPermissions(ORG_ID, 42, [700], 1);
    expect(rbacServiceMock.setOrganisationRolePermissions).toHaveBeenCalledWith(ORG_ID, 901, [700], 1);
    expect(result).toMatchObject({ success: true, roleId: 901, permissionCount: 1 });
  });

  it('accepts all eight approved refund permissions for the accountant role', async () => {
    await addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1, undefined, undefined, REFUND_IDS);
    expect(rbacServiceMock.setOrganisationRolePermissions).toHaveBeenCalledWith(
      ORG_ID,
      901,
      REFUND_IDS,
      1,
    );
  });

  it('rejects refunds.export for a non-admin/non-accountant organisation role', async () => {
    repoMock.getAssignableOrgRole.mockResolvedValueOnce({
      id: 902, slug: 'branch-mgr', name: 'Branch Manager', organisation_id: null,
    });
    rbacMock.getRoleById.mockResolvedValueOnce({ id: 901, organisation_id: ORG_ID, slug: 'branch-mgr' });

    await expect(
      addOrgStaff(ORG_ID, 'staff@example.com', 'branch-mgr', 1, undefined, undefined, [801, 808]),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('rejects an unknown future refund permission (fail-closed)', async () => {
    await expect(
      addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1, undefined, undefined, [809]),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();
  });

  it('rejects assigning a role to a user outside the organisation', async () => {
    await expect(changeOrgStaffRole(ORG_ID, 99, 'accountant', 1)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repoMock.removeStaffFromOrg).not.toHaveBeenCalled();
    expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();
  });

  it('rejects updating permissions for a user outside the organisation', async () => {
    await expect(updateStaffPermissions(ORG_ID, 99, [700])).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('rejects cloning when the resolved role is not a global template', async () => {
    repoMock.getAssignableOrgRole.mockResolvedValueOnce({
      id: 903, slug: 'accountant', name: 'Accountant', organisation_id: 999,
    });

    await expect(
      addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();
    expect(repoMock.addStaffScope).not.toHaveBeenCalled();
  });

  it('rejects an empty permission list on the update path instead of clearing the role', async () => {
    await expect(updateStaffPermissions(ORG_ID, 42, [])).rejects.toMatchObject({ statusCode: 400 });
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('rejects missing permissionIds on the update path', async () => {
    await expect(updateStaffPermissions(ORG_ID, 42, undefined as any)).rejects.toMatchObject({ statusCode: 400 });
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', [0]],
    ['negative', [-1]],
    ['decimal', [1.5]],
    ['string', ['700']],
    ['NaN', [Number.NaN]],
    ['duplicate', [700, 700]],
    ['mixed valid/invalid', [700, 0]],
  ])('rejects %s permission ids without touching the role', async (_label, ids) => {
    await expect(updateStaffPermissions(ORG_ID, 42, ids as any)).rejects.toMatchObject({ statusCode: 400 });
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
  });

  it('does not silently filter invalid ids from an add-staff override', async () => {
    await expect(
      addOrgStaff(ORG_ID, 'staff@example.com', 'accountant', 1, undefined, undefined, [700, 0] as any),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(rbacMock.setRolePermissions).not.toHaveBeenCalled();
    expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
    expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();
  });
});

// ============================================================================
// B1 follow-up — organisation-scoped provisioning for marketplace-manager and
// receptionist. The clone must be organisation-bound, the scope must be the
// organisation (never global), and platform-only overrides must be rejected
// before any role is created.
// ============================================================================
describe('organisation staff provisioning — marketplace-manager / receptionist', () => {
  const NEW_PERMISSION_KEYS: Record<number, string> = {
    601: 'marketplace.products.manage',
    602: 'marketplace.admin.products',
    603: 'platform.admin',
    604: 'inventory.stock.view',
    605: 'inventory.transfers.view',
    606: 'inventory.transfers.create',
  };

  const TEMPLATES: Record<string, { id: number; slug: string; name: string; organisation_id: null }> = {
    'marketplace-manager': {
      id: 960,
      slug: 'marketplace-manager',
      name: 'Marketplace Manager',
      organisation_id: null,
    },
    receptionist: { id: 970, slug: 'receptionist', name: 'Receptionist', organisation_id: null },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['marketplace-manager', 'receptionist'])(
    'clones the %s template into the organisation and records ONLY an organisation scope',
    async (slug) => {
      repoMock.getAssignableOrgRole.mockResolvedValue(TEMPLATES[slug]);
      repoMock.findUserByEmail.mockResolvedValue({ id: 42 });
      repoMock.getOrgOwnerId.mockResolvedValue(1);
      repoMock.listOrgStaff.mockResolvedValue([]);
      rbacMock.cloneRoleForOrg.mockResolvedValue(901);

      const result = await addOrgStaff(ORG_ID, 'qa.staff@courtzon.test', slug, 1);

      expect(result).toMatchObject({ userId: 42, roleSlug: slug });
      expect(rbacMock.cloneRoleForOrg).toHaveBeenCalledWith(TEMPLATES[slug].id, ORG_ID);
      expect(repoMock.addStaffScope).toHaveBeenCalledWith(42, 901, ORG_ID, 1, undefined, undefined);
      // No global role assignment path is used.
      expect(rbacServiceMock.setOrganisationRolePermissions).not.toHaveBeenCalled();
    },
  );

  it.each(['marketplace-manager', 'receptionist'])(
    'rejects a platform-only permission override for %s before cloning',
    async (slug) => {
      repoMock.getAssignableOrgRole.mockResolvedValue(TEMPLATES[slug]);
      repoMock.findUserByEmail.mockResolvedValue({ id: 42 });
      repoMock.getOrgOwnerId.mockResolvedValue(1);
      repoMock.listOrgStaff.mockResolvedValue([]);
      rbacMock.getPermissionsByIds.mockResolvedValue([
        { id: 602, permission_key: 'marketplace.admin.products' },
        { id: 603, permission_key: 'platform.admin' },
      ]);

      await expect(
        addOrgStaff(ORG_ID, 'qa.staff@courtzon.test', slug, 1, undefined, undefined, [602, 603]),
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();
      expect(repoMock.addStaffScope).not.toHaveBeenCalled();
    },
  );

  it('rejects an Inventory capability outside the marketplace-manager matrix', async () => {
    repoMock.getAssignableOrgRole.mockResolvedValue(TEMPLATES['marketplace-manager']);
    repoMock.findUserByEmail.mockResolvedValue({ id: 42 });
    repoMock.getOrgOwnerId.mockResolvedValue(1);
    repoMock.listOrgStaff.mockResolvedValue([]);
    rbacMock.getPermissionsByIds.mockResolvedValue([
      { id: 599, permission_key: 'inventory.reports.export' },
    ]);

    await expect(
      addOrgStaff(ORG_ID, 'qa.staff@courtzon.test', 'marketplace-manager', 1, undefined, undefined, [599]),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();
  });

  it('rejects inventory writes for receptionist but accepts its read-only Inventory keys', async () => {
    repoMock.getAssignableOrgRole.mockResolvedValue(TEMPLATES.receptionist);
    repoMock.findUserByEmail.mockResolvedValue({ id: 42 });
    repoMock.getOrgOwnerId.mockResolvedValue(1);
    repoMock.listOrgStaff.mockResolvedValue([]);
    rbacMock.cloneRoleForOrg.mockResolvedValue(901);

    // write key → rejected, nothing created
    rbacMock.getPermissionsByIds.mockResolvedValue([
      { id: 606, permission_key: 'inventory.transfers.create' },
    ]);
    await expect(
      addOrgStaff(ORG_ID, 'qa.staff@courtzon.test', 'receptionist', 1, undefined, undefined, [606]),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rbacMock.cloneRoleForOrg).not.toHaveBeenCalled();

    // read-only keys → accepted through the policy-enforcing service
    rbacMock.getPermissionsByIds.mockResolvedValue([
      { id: 604, permission_key: 'inventory.stock.view' },
      { id: 605, permission_key: 'inventory.transfers.view' },
    ]);
    const result = await addOrgStaff(
      ORG_ID,
      'qa.staff@courtzon.test',
      'receptionist',
      1,
      undefined,
      undefined,
      [604, 605],
    );
    expect(result.roleSlug).toBe('receptionist');
    expect(rbacMock.cloneRoleForOrg).toHaveBeenCalledWith(TEMPLATES.receptionist.id, ORG_ID);
    expect(rbacServiceMock.setOrganisationRolePermissions).toHaveBeenCalledWith(
      ORG_ID,
      901,
      [604, 605],
      1,
    );
  });

  it('accepts marketplace-manager organisation marketplace + Inventory overrides', async () => {
    repoMock.getAssignableOrgRole.mockResolvedValue(TEMPLATES['marketplace-manager']);
    repoMock.findUserByEmail.mockResolvedValue({ id: 42 });
    repoMock.getOrgOwnerId.mockResolvedValue(1);
    repoMock.listOrgStaff.mockResolvedValue([]);
    rbacMock.cloneRoleForOrg.mockResolvedValue(901);
    rbacMock.getPermissionsByIds.mockResolvedValue([
      { id: 601, permission_key: 'marketplace.products.manage' },
      { id: 604, permission_key: 'inventory.stock.view' },
    ]);

    const result = await addOrgStaff(
      ORG_ID,
      'qa.staff@courtzon.test',
      'marketplace-manager',
      1,
      undefined,
      undefined,
      [601, 604],
    );

    expect(result.roleSlug).toBe('marketplace-manager');
    expect(rbacServiceMock.setOrganisationRolePermissions).toHaveBeenCalledWith(
      ORG_ID,
      901,
      [601, 604],
      1,
    );
  });
});
