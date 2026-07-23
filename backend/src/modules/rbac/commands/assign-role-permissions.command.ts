import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { rbacRepository } from '../infrastructure/repositories/rbac.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { canAssignPermission } from '../domain/rbac-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { RoleRecord } from '../domain/rbac-aggregate.js';

const log = createModuleLogger('rbac');

export interface AssignRolePermissionsPayload {
  roleId: number;
  permissionIds: number[];
  actorId?: number;
}

export interface AssignRolePermissionsResult {
  roleId: number;
  permissionCount: number;
}

export const assignRolePermissionsHandler: CommandHandler<Command, AssignRolePermissionsResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as AssignRolePermissionsPayload;
    if (!p.roleId || p.roleId <= 0) throw new Error('roleId is required and must be positive');
    if (!Array.isArray(p.permissionIds)) throw new Error('permissionIds must be an array');
  },

  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as AssignRolePermissionsPayload;
    const role = await rbacRepository.getRoleById(p.roleId);
    if (!role) throw new NotFoundError('Role');

    if (!canAssignPermission(role)) {
      throw new Error('Cannot assign permissions to an inactive or deleted role');
    }

    await rbacRepository.setRolePermissions(p.roleId, p.permissionIds);

    log.info({ roleId: p.roleId, permissionCount: p.permissionIds.length }, 'rbac.permissions_assigned');
    return { roleId: p.roleId, permissionCount: p.permissionIds.length };
  },

  events: (command, result) => {
    const p = command.payload as unknown as AssignRolePermissionsPayload;
    return [{
      eventName: 'rbac.permissions_assigned',
      payload: {
        roleId: result.roleId,
        permissionCount: result.permissionCount,
        actorId: p.actorId,
      },
      context: {
        aggregateType: 'rbac',
        aggregateId: String(result.roleId),
        aggregateVersion: 1,
        correlationId: command.correlationId,
        causationId: command.commandId,
      },
    }];
  },
};
