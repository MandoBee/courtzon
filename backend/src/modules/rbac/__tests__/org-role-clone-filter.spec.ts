// ============================================================================
// R4 — organization role cloning filters by the role-aware policy.
// Unit-only: the mysql pool is mocked; no DB connection is opened.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execute = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute }),
}));

const { RBACRepository } = await import('../infrastructure/repositories/rbac.repository.js');

const TEMPLATE = (overrides: Record<string, unknown> = {}) => ({
  id: 900,
  organisation_id: null,
  name: 'Accountant',
  slug: 'accountant',
  description: null,
  deleted_at: null,
  ...overrides,
});

function arrangeClone(params: {
  template: Record<string, unknown>;
  permissions: Array<{ permission_id: number; permission_key: string }>;
}) {
  execute
    // getRoleById(templateRoleId)
    .mockResolvedValueOnce([[params.template], []])
    // INSERT IGNORE INTO roles
    .mockResolvedValueOnce([{ insertId: 0 }, []])
    // SELECT id FROM roles (org clone)
    .mockResolvedValueOnce([[{ id: 901 }], []])
    // SELECT rp.permission_id, p.permission_key (template permissions)
    .mockResolvedValueOnce([params.permissions, []])
    // INSERT IGNORE INTO role_permissions
    .mockResolvedValueOnce([{ affectedRows: 0 }, []]);
}

describe('cloneRoleForOrg — organization policy filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies org capabilities and allowed refunds, but never platform-only permissions', async () => {
    arrangeClone({
      template: TEMPLATE(),
      permissions: [
        { permission_id: 1, permission_key: 'org.accounting.view' },
        { permission_id: 2, permission_key: 'refunds.view' },
        { permission_id: 3, permission_key: 'refunds.export' },
        { permission_id: 4, permission_key: 'financial.reconcile' },
        { permission_id: 5, permission_key: 'users.view' },
      ],
    });

    const repo = new RBACRepository();
    const roleId = await repo.cloneRoleForOrg(900, 7);

    expect(roleId).toBe(901);
    const insert = execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT IGNORE INTO role_permissions'),
    );
    expect(insert).toBeDefined();
    expect(insert![0]).toContain('(901, 1)');
    expect(insert![0]).toContain('(901, 2)');
    // accountant may hold refunds.export
    expect(insert![0]).toContain('(901, 3)');
    expect(insert![0]).not.toContain('(901, 4)');
    expect(insert![0]).not.toContain('(901, 5)');
  });

  it('drops refunds.export for a role that is not org-admin/accountant', async () => {
    arrangeClone({
      template: TEMPLATE({ id: 910, slug: 'branch-mgr', name: 'Branch Manager' }),
      permissions: [
        { permission_id: 1, permission_key: 'bookings.view' },
        { permission_id: 2, permission_key: 'refunds.view' },
        { permission_id: 3, permission_key: 'refunds.export' },
      ],
    });

    const repo = new RBACRepository();
    await repo.cloneRoleForOrg(910, 7);

    const insert = execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT IGNORE INTO role_permissions'),
    );
    expect(insert![0]).toContain('(901, 1)');
    expect(insert![0]).toContain('(901, 2)');
    expect(insert![0]).not.toContain('(901, 3)');
  });

  it('refuses to clone a role that belongs to another organisation', async () => {
    execute.mockResolvedValueOnce([[TEMPLATE({ organisation_id: 999 })], []]);

    const repo = new RBACRepository();
    await expect(repo.cloneRoleForOrg(900, 7)).rejects.toThrow(
      /Only global template roles can be cloned/,
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // B1 follow-up — marketplace-manager / receptionist organisation clones must
  // never inherit platform-wide capabilities.
  it('marketplace-manager clone keeps org marketplace + Inventory keys and drops platform keys', async () => {
    arrangeClone({
      template: TEMPLATE({ id: 960, slug: 'marketplace-manager', name: 'Marketplace Manager' }),
      permissions: [
        { permission_id: 1, permission_key: 'marketplace.products.manage' },
        { permission_id: 2, permission_key: 'marketplace.admin.products' },
        { permission_id: 3, permission_key: 'inventory.stock.view' },
        { permission_id: 4, permission_key: 'inventory.transfers.create' },
        { permission_id: 5, permission_key: 'inventory.reports.export' },
        { permission_id: 6, permission_key: 'platform.admin' },
        { permission_id: 7, permission_key: 'sidebar.marketplace' },
        { permission_id: 8, permission_key: 'financial.reconcile' },
        { permission_id: 9, permission_key: 'users.view' },
        { permission_id: 10, permission_key: 'org.marketplace.manage' },
        // Platform marketplace moderation / refund approval — not under
        // `marketplace.admin.` but equally platform-only.
        { permission_id: 11, permission_key: 'marketplace.moderate' },
        { permission_id: 12, permission_key: 'marketplace.complaints.approve' },
      ],
    });

    const repo = new RBACRepository();
    const roleId = await repo.cloneRoleForOrg(960, 7);

    expect(roleId).toBe(901);
    const insert = execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT IGNORE INTO role_permissions'),
    );
    expect(insert).toBeDefined();
    const sql = String(insert![0]);
    // Allowed organisation capabilities
    expect(sql).toContain('(901, 1)');
    expect(sql).toContain('(901, 3)');
    expect(sql).toContain('(901, 4)');
    expect(sql).toContain('(901, 10)');
    // Platform-only / out-of-matrix keys
    expect(sql).not.toContain('(901, 2)');
    expect(sql).not.toContain('(901, 5)');
    expect(sql).not.toContain('(901, 6)');
    expect(sql).not.toContain('(901, 7)');
    expect(sql).not.toContain('(901, 8)');
    expect(sql).not.toContain('(901, 9)');
    expect(sql).not.toContain('(901, 11)');
    expect(sql).not.toContain('(901, 12)');
  });

  it('receptionist clone keeps read-only Inventory keys and drops write/platform keys', async () => {
    arrangeClone({
      template: TEMPLATE({ id: 970, slug: 'receptionist', name: 'Receptionist' }),
      permissions: [
        { permission_id: 1, permission_key: 'bookings.view' },
        { permission_id: 2, permission_key: 'bookings.create' },
        { permission_id: 3, permission_key: 'inventory.stock.view' },
        { permission_id: 4, permission_key: 'inventory.transfers.view' },
        { permission_id: 5, permission_key: 'inventory.transfers.create' },
        { permission_id: 6, permission_key: 'inventory.stock.adjust' },
        { permission_id: 7, permission_key: 'platform.admin' },
        { permission_id: 8, permission_key: 'sidebar.reception' },
        { permission_id: 9, permission_key: 'admin.users' },
      ],
    });

    const repo = new RBACRepository();
    await repo.cloneRoleForOrg(970, 7);

    const insert = execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT IGNORE INTO role_permissions'),
    );
    const sql = String(insert![0]);
    expect(sql).toContain('(901, 1)');
    expect(sql).toContain('(901, 2)');
    expect(sql).toContain('(901, 3)');
    expect(sql).toContain('(901, 4)');
    expect(sql).not.toContain('(901, 5)');
    expect(sql).not.toContain('(901, 6)');
    expect(sql).not.toContain('(901, 7)');
    expect(sql).not.toContain('(901, 8)');
    expect(sql).not.toContain('(901, 9)');
  });
});
