import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { rbacRepository } from '../infrastructure/repositories/rbac.repository.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
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
    if (!Number.isInteger(p.roleId) || p.roleId <= 0) {
      throw new ValidationError('roleId is required and must be a positive integer');
    }
    if (!Array.isArray(p.permissionIds)) {
      throw new ValidationError('permissionIds must be an array');
    }
    const ids: number[] = [];
    for (const [index, value] of p.permissionIds.entries()) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new ValidationError(`permissionIds[${index}] must be a positive integer`);
      }
      ids.push(value);
    }
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('permissionIds must not contain duplicate ids');
    }
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as AssignRolePermissionsPayload;
    const role = await rbacRepository.getRoleById(p.roleId, conn);
    if (!role) throw new NotFoundError('Role');

    // Fail closed: this command is global-role only. Organisation-owned roles
    // must go through the organisation policy/transaction path.
    if (role.organisation_id != null) {
      throw new ForbiddenError('assign-role-permissions is restricted to global roles');
    }

    if (!canAssignPermission(role)) {
      throw new Error('Cannot assign permissions to an inactive or deleted role');
    }

    await rbacRepository.setRolePermissions(p.roleId, p.permissionIds, conn);

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
