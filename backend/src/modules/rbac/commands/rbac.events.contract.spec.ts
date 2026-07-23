import { describe, it, expect, vi } from 'vitest';
import { assignRolePermissionsHandler } from './assign-role-permissions.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/rbac.repository.js', () => ({
  RBACRepository: vi.fn(),
  rbacRepository: { getRoleById: vi.fn(), setRolePermissions: vi.fn() },
}));

describe('Event contract: rbac.permissions_assigned', () => {
  it('emits correct event name', () => {
    const events = assignRolePermissionsHandler.events!(
      { commandId: 'ec1', commandType: 'AssignRolePermissions', aggregateType: 'rbac', aggregateId: '1', payload: { roleId: 1, permissionIds: [1, 2] }, correlationId: 'corr-1' } as Command,
      { roleId: 1, permissionCount: 2 },
    );
    expect(events[0].eventName).toBe('rbac.permissions_assigned');
  });

  it('contains required payload fields', () => {
    const events = assignRolePermissionsHandler.events!(
      { commandId: 'ec2', commandType: 'AssignRolePermissions', aggregateType: 'rbac', aggregateId: '1', payload: { roleId: 1, permissionIds: [1, 2] } } as Command,
      { roleId: 1, permissionCount: 2 },
    );
    expect(events[0].payload).toHaveProperty('roleId', 1);
    expect(events[0].payload).toHaveProperty('permissionCount', 2);
  });

  it('contains required context fields', () => {
    const events = assignRolePermissionsHandler.events!(
      { commandId: 'ec3', commandType: 'AssignRolePermissions', aggregateType: 'rbac', aggregateId: '1', payload: { roleId: 1, permissionIds: [1, 2] }, correlationId: 'corr-1' } as Command,
      { roleId: 1, permissionCount: 2 },
    );
    expect(events[0].context).toHaveProperty('aggregateType', 'rbac');
    expect(events[0].context).toHaveProperty('aggregateId', '1');
    expect(events[0].context).toHaveProperty('correlationId', 'corr-1');
  });
});
