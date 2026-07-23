import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assignRolePermissionsHandler } from '../commands/assign-role-permissions.command.js';
import type { Command } from '../../../shared/command/command-base.js';

const mockRole = { id: 1, organisation_id: null, name: 'Manager', slug: 'manager', is_system: false, is_active: true, deleted_at: null, aggregate_version: 1 };

vi.mock('../infrastructure/repositories/rbac.repository.js', () => ({
  RBACRepository: vi.fn(),
  rbacRepository: { getRoleById: vi.fn(), setRolePermissions: vi.fn() },
}));

const { rbacRepository } = await import('../infrastructure/repositories/rbac.repository.js');

function makeCommand(overrides: Record<string, unknown> = {}): Command {
  return {
    commandId: 'rbac-test-1',
    commandType: 'AssignRolePermissions',
    aggregateType: 'rbac',
    aggregateId: '1',
    payload: { roleId: 1, permissionIds: [1, 2, 3], ...overrides },
    correlationId: 'corr-1',
  };
}

describe('AssignRolePermissions command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates a valid command', async () => {
    await expect(assignRolePermissionsHandler.validate(makeCommand())).resolves.not.toThrow();
  });

  it('rejects missing roleId', async () => {
    await expect(assignRolePermissionsHandler.validate(makeCommand({ roleId: 0 }))).rejects.toThrow('roleId is required');
  });

  it('rejects non-array permissionIds', async () => {
    await expect(assignRolePermissionsHandler.validate(makeCommand({ permissionIds: 'not-array' }))).rejects.toThrow('permissionIds must be an array');
  });

  it('assigns permissions to role', async () => {
    vi.mocked(rbacRepository.getRoleById).mockResolvedValue(mockRole);

    const result = await assignRolePermissionsHandler.execute(makeCommand(), {} as any);

    expect(result.roleId).toBe(1);
    expect(result.permissionCount).toBe(3);
    expect(rbacRepository.setRolePermissions).toHaveBeenCalledWith(1, [1, 2, 3]);
  });

  it('throws NotFoundError for unknown role', async () => {
    vi.mocked(rbacRepository.getRoleById).mockResolvedValue(null);
    await expect(assignRolePermissionsHandler.execute(makeCommand(), {} as any)).rejects.toThrow();
  });

  it('rejects assigning to inactive role', async () => {
    vi.mocked(rbacRepository.getRoleById).mockResolvedValue({ ...mockRole, is_active: false });
    await expect(assignRolePermissionsHandler.execute(makeCommand(), {} as any)).rejects.toThrow('Cannot assign permissions');
  });

  it('emits rbac.permissions_assigned event', () => {
    const events = assignRolePermissionsHandler.events!(
      makeCommand({ actorId: 99 }),
      { roleId: 1, permissionCount: 3 },
    );

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('rbac.permissions_assigned');
    expect(events[0].payload).toMatchObject({ roleId: 1, permissionCount: 3, actorId: 99 });
    expect(events[0].context).toMatchObject({ aggregateType: 'rbac', aggregateId: '1' });
  });
});
