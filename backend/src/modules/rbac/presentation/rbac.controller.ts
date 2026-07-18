import type { FastifyRequest, FastifyReply } from 'fastify';
import type mysql from 'mysql2/promise';
import { rbacService } from '../application/rbac.service.js';
import { getUserCountryScope } from '../application/user-country-scope.js';
import { getPool } from '../../../database/mysql.js';
import { CreateRoleSchema, UpdateRoleSchema, AssignRoleSchema, CreatePermissionSchema } from './rbac.dto.js';
import { recordAudit } from '../../audit-log/index.js';

type RowData = mysql.RowDataPacket[];

async function assertUserCountryAccess(requestUserId: number, targetUserId: number, reply: FastifyReply): Promise<boolean> {
  const scope = await getUserCountryScope(requestUserId);
  if (!scope.countryId) return true;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>('SELECT country_id FROM users WHERE id = ?', [targetUserId]);
  if (!rows.length || rows[0].country_id !== scope.countryId) {
    reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });
    return false;
  }
  return true;
}

export async function getModulesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const modules = await rbacService.getModules();
  return reply.send({ data: modules });
}

export async function getPermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { moduleId } = request.query as any;
  const permissions = await rbacService.getPermissions(moduleId ? Number(moduleId) : undefined);
  return reply.send({ data: permissions });
}

export async function createPermissionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreatePermissionSchema.parse(request.body);
  const perm = await rbacService.createPermission(body);
  return reply.status(201).send(perm);
}

export async function updatePermissionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { UpdatePermissionSchema } = await import('./rbac.dto.js');
  const body = UpdatePermissionSchema.parse(request.body);
  await rbacService.updatePermission(Number(id), body);
  return reply.send({ success: true });
}

export async function deletePermissionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await rbacService.deletePermission(Number(id));
  return reply.status(204).send();
}

export async function getRolesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { organisationId, includeDeleted } = request.query as any;
  const roles = await rbacService.getRoles(organisationId ? Number(organisationId) : null, includeDeleted === 'true');
  return reply.send({ data: roles });
}

export async function getRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const role = await rbacService.getRole(Number(id));
  return reply.send(role);
}

export async function createRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateRoleSchema.parse(request.body);
  const role = await rbacService.createRole(body);
  return reply.status(201).send(role);
}

export async function updateRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = UpdateRoleSchema.parse(request.body);
  const role = await rbacService.updateRole(Number(id), data);
  return reply.send(role);
}

export async function deleteRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await rbacService.deleteRole(Number(id));
  return reply.status(204).send();
}

export async function restoreRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const role = await rbacService.restoreRole(Number(id));
  return reply.send(role);
}

export async function setRolePermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { permissionIds } = request.body as any;
  if (!Array.isArray(permissionIds)) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'permissionIds must be an array' });
  }
  const role = await rbacService.setRolePermissions(Number(id), permissionIds);
  return reply.send(role);
}

export async function assignRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = AssignRoleSchema.parse(request.body);
  const assignedBy = (request as any).userId;
  await rbacService.assignRole(body.userId, body.roleId, assignedBy, body.scopes);
  return reply.status(201).send({ success: true });
}

export async function removeUserRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const { userId, roleId } = request.params as any;
  await rbacService.removeUserRole(Number(userId), Number(roleId));
  return reply.send({ success: true });
}

export async function getUserRolesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = request.params as any;
  const roles = await rbacService.getUserRoles(Number(userId));
  return reply.send({ data: roles });
}

export async function getUserScopesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const scopes = await rbacService.getUserScopes(userId);
  return reply.send({ data: scopes });
}

export async function listUsersHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit, search, status, country, role } = request.query as any;
  const scope = await getUserCountryScope((request as any).userId);
  const result = await rbacService.listUsers(
    page ? Number(page) : undefined,
    limit ? Number(limit) : undefined,
    { search, status, country, role, countryId: scope.countryId }
  );
  return reply.send(result);
}

export async function getUserHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const scope = await getUserCountryScope((request as any).userId);
  const user = await rbacService.getUserById(Number(id));
  if (!user) return reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });
  if (scope.countryId && user.country_id !== scope.countryId) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });
  }
  return reply.send({ data: user });
}

export async function deleteUserHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const targetId = Number(id);
  const actorId = (request as any).userId;
  if (!(await assertUserCountryAccess(actorId, targetId, reply))) return;
  let before: { email?: string; full_name?: string };
  try {
    before = await rbacService.getUserById(targetId);
  } catch {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'User not found' });
  }
  const deleted = await rbacService.deleteUser(targetId, actorId);
  recordAudit({
    actorId,
    action: 'USER.DELETE',
    entityType: 'user',
    entityId: targetId,
    beforeState: { email: before.email, fullName: before.full_name },
    afterState: deleted,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function updateUserHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const user = await rbacService.updateUser(Number(id), body);
  if (body.isCoach !== undefined) {
    const actorId = (request as any).userId;
    recordAudit({
      actorId,
      action: body.isCoach ? 'COACH.ASSIGN' : 'COACH.UNASSIGN',
      entityType: 'user',
      entityId: Number(id),
      afterState: { isCoach: body.isCoach },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
  return reply.send({ data: user });
}

export async function approveCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const actorId = (request as any).userId;
  const user = await rbacService.approveCoachApplication(Number(id), actorId);
  recordAudit({
    actorId,
    action: 'COACH.APPROVE',
    entityType: 'user',
    entityId: Number(id),
    afterState: { coachStatus: 'approved' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ data: user });
}

export async function rejectCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { reason } = request.body as any;
  const actorId = (request as any).userId;
  const user = await rbacService.rejectCoachApplication(Number(id), reason || '', actorId);
  recordAudit({
    actorId,
    action: 'COACH.REJECT',
    entityType: 'user',
    entityId: Number(id),
    afterState: { coachStatus: 'rejected', reason: reason || '' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ data: user });
}

export async function getUserBookingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const ok = await assertUserCountryAccess((request as any).userId, Number(id), reply);
  if (!ok) return;
  const bookings = await rbacService.getUserBookings(Number(id));
  return reply.send({ data: bookings });
}

export async function getUserAcademyEnrollmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const ok = await assertUserCountryAccess((request as any).userId, Number(id), reply);
  if (!ok) return;
  const enrollments = await rbacService.getUserAcademyEnrollments(Number(id));
  return reply.send({ data: enrollments });
}

export async function getUserOrdersHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const ok = await assertUserCountryAccess((request as any).userId, Number(id), reply);
  if (!ok) return;
  const orders = await rbacService.getUserOrders(Number(id));
  return reply.send({ data: orders });
}

export async function getUserActivityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const ok = await assertUserCountryAccess((request as any).userId, Number(id), reply);
  if (!ok) return;
  const { limit } = request.query as any;
  const activity = await rbacService.getUserActivity(Number(id), limit ? Number(limit) : undefined);
  return reply.send({ data: activity });
}

export async function getUserOrganisationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const ok = await assertUserCountryAccess((request as any).userId, Number(id), reply);
  if (!ok) return;
  const orgs = await rbacService.getUserOrganisations(Number(id));
  return reply.send({ data: orgs });
}

export async function getUserBranchAccessHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const ok = await assertUserCountryAccess((request as any).userId, Number(id), reply);
  if (!ok) return;
  const access = await rbacService.getUserBranchAccess(Number(id));
  return reply.send({ data: access });
}

export async function getPlayerLevelsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const levels = await rbacService.getPlayerLevels();
  return reply.send({ data: levels });
}

export async function getUserBookingDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  const { bookingId } = request.params as any;
  const booking = await rbacService.getUserBookingDetail(Number(bookingId));
  if (!booking) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
  const ok = await assertUserCountryAccess((request as any).userId, booking.user_id, reply);
  if (!ok) return;
  return reply.send({ data: booking });
}

export async function getUserOrderDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orderId } = request.params as any;
  const order = await rbacService.getUserOrderDetail(Number(orderId));
  if (!order) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Order not found' });
  const ok = await assertUserCountryAccess((request as any).userId, order.buyer_id, reply);
  if (!ok) return;
  return reply.send({ data: order });
}

export async function changeUserPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { newPassword } = request.body as any;
  if (!newPassword || newPassword.length < 6) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' });
  }
  await rbacService.changeUserPassword(Number(id), newPassword);
  return reply.send({ success: true });
}


export async function getFeatureFlagsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const flags = await rbacService.getFeatureFlags();
  return reply.send({ data: flags });
}

export async function createFlagHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const flag = await rbacService.createFlag(body);
  return reply.status(201).send(flag);
}

export async function updateFlagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  await rbacService.updateFlag(Number(id), body);
  return reply.send({ success: true });
}

export async function toggleFlagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await rbacService.toggleFlag(Number(id));
  return reply.send(result);
}

export async function deleteFlagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await rbacService.deleteFlag(Number(id));
  return reply.status(204).send();
}

export async function getDashboardStatsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const stats = await rbacService.getDashboardStats();
  return reply.send({ data: stats });
}

// ── UI Permissions ─────────────────────────────────────────────────────

export async function getUIPermissionsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const permissions = await rbacService.getUIPermissionsWithRoles();
  const result = [];
  for (const perm of permissions) {
    const roleAssignments = await rbacService.getPermissionRoleAssignments(perm.id);
    result.push({ ...perm, roles: roleAssignments });
  }
  return reply.send({ data: result });
}

export async function getMyPermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const permissions = await rbacService.getUserPermissionKeys(userId);
  return reply.send({ data: permissions });
}

export async function syncUIRegistryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { elements } = request.body as { elements: any[] };
  const result = await rbacService.syncUIRegistry(elements);
  return reply.send(result);
}

export async function getDashboardTrendsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const trends = await rbacService.getDashboardTrends();
  return reply.send({ data: trends });
}
