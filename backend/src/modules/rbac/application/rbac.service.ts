import { getPool } from '../../../database/mysql.js';
import { rbacRepository } from '../infrastructure/repositories/rbac.repository.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { hashPassword } from '../../../shared/utils/password.js';
import { sanitizeUploadUrl } from '../../../shared/utils/upload-url.util.js';
import { cascadeRoleSoftDelete, cascadeUserSoftDelete } from '../../../shared/cascade/index.js';
import { cancelBooking } from '../../../platform/booking/BookingSaga.js';
import { CANCELLABLE_BOOKING_STATUSES } from '../../../shared/cascade/types.js';

export class RBACService {
  async getModules() {
    return rbacRepository.getPermissionModules();
  }

  async getPermissions(moduleId?: number) {
    return rbacRepository.getPermissions(moduleId);
  }

  async createPermission(data: { moduleId: number; permissionKey: string; description?: string }) {
    return rbacRepository.createPermission(data);
  }

  async updatePermission(id: number, data: { moduleId?: number; permissionKey?: string; description?: string }) {
    return rbacRepository.updatePermission(id, data);
  }

  async deletePermission(id: number) {
    return rbacRepository.deletePermission(id);
  }

  // Roles
  async getRoles(organisationId?: number | null, includeDeleted = false) {
    return rbacRepository.getRoles(organisationId, includeDeleted);
  }

  async restoreRole(id: number) {
    const role = await rbacRepository.getRoleById(id);
    if (!role) throw new NotFoundError('Role');
    if (!role.deleted_at) return role;
    await rbacRepository.restoreRole(id);
    return this.getRole(id);
  }

  async getRole(id: number) {
    const role = await rbacRepository.getRole(id);
    if (!role) throw new NotFoundError('Role');
    const permissionIds = await rbacRepository.getRolePermissions(id);
    return { ...role, permissionIds };
  }

  async createRole(data: { organisationId?: number | null; name: string; slug: string; description?: string }) {
    const role = await rbacRepository.createRole(data);
    return this.getRole(role);
  }

  async updateRole(id: number, data: any) {
    const role = await rbacRepository.getRole(id);
    if (!role) throw new NotFoundError('Role');
    if (data.isActive !== undefined) { data.is_active = data.isActive; delete data.isActive; }
    await rbacRepository.updateRole(id, data);
    return this.getRole(id);
  }

  async deleteRole(id: number) {
    const role = await rbacRepository.getRole(id);
    if (!role) throw new NotFoundError('Role');
    if (role.is_system) throw new Error('Cannot delete system roles');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeRoleSoftDelete(id, conn);
      await conn.execute(
        'UPDATE roles SET deleted_at = NOW() WHERE id = ? AND is_system = FALSE',
        [id],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async setRolePermissions(roleId: number, permissionIds: number[]) {
    const role = await rbacRepository.getRole(roleId);
    if (!role) throw new NotFoundError('Role');
    try {
      await rbacRepository.setRolePermissions(roleId, permissionIds);
    } catch (err: any) {
      throw new Error(`Failed to set permissions: ${err.message || err}`);
    }
    return this.getRole(roleId);
  }

  // User-role assignments
  async assignRole(userId: number, roleId: number, assignedBy: number, scopes?: { scopeType: string; scopeId: number }[]) {
    const role = await rbacRepository.getRole(roleId);
    if (!role) throw new NotFoundError('Role');
    const userRoleId = await rbacRepository.assignRole(userId, roleId, assignedBy);
    if (scopes?.length) {
      await rbacRepository.setUserRoleScope(userRoleId, scopes);
    }
  }

  async removeUserRole(userId: number, roleId: number) {
    await rbacRepository.removeUserRole(userId, roleId);
  }

  async getUserRoles(userId: number) {
    return rbacRepository.getUserRoles(userId);
  }

  async getUserScopes(userId: number) {
    return rbacRepository.getUserScopes(userId);
  }

  async listUsers(page?: number, limit?: number, filters?: { search?: string; status?: string; country?: string; role?: string; countryId?: number | null }) {
    const result = await rbacRepository.listUsers(page, limit, filters);
    return {
      ...result,
      data: result.data.map((u) => ({
        ...u,
        avatar_url: sanitizeUploadUrl(u.avatar_url),
      })),
    };
  }

  async getUserById(userId: number) {
    const user = await rbacRepository.getUserById(userId);
    if (!user) throw new NotFoundError('User');
    const roles = await rbacRepository.getUserRoles(userId);
    return { ...user, avatar_url: sanitizeUploadUrl(user.avatar_url), roles };
  }

  async updateUser(userId: number, data: any) {
    const user = await rbacRepository.getUserById(userId);
    if (!user) throw new NotFoundError('User');
    await rbacRepository.updateUser(userId, data);
    return this.getUserById(userId);
  }

  async deleteUser(userId: number, actorId: number) {
    if (userId === actorId) {
      throw new ConflictError('You cannot delete your own account');
    }
    const user = await rbacRepository.getUserById(userId);
    if (!user) throw new NotFoundError('User');
    const roles = await rbacRepository.getUserRoles(userId);
    const isSuperAdmin = roles.some(
      (r: { role_slug?: string }) =>
        r.role_slug === 'super_admin' || r.role_slug === 'super-admin'
    );
    if (isSuperAdmin) {
      throw new ConflictError('Cannot delete super admin users');
    }
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [userBookings] = await conn.execute(
        `SELECT id FROM bookings WHERE user_id = ? AND booking_status IN (${CANCELLABLE_BOOKING_STATUSES.map(() => '?').join(',')})`,
        [userId, ...CANCELLABLE_BOOKING_STATUSES],
      );
      for (const b of userBookings as any[]) {
        await cancelBooking(b.id, 0, 'Auto-cancelled: user deleted', 0, conn);
      }
      await cascadeUserSoftDelete(userId, conn);
      const [result] = await conn.execute(
        'UPDATE users SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
        [userId],
      );
      if (!(result as { affectedRows: number }).affectedRows) {
        throw new NotFoundError('User');
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return { id: userId, email: user.email, fullName: user.full_name };
  }

  async approveCoachApplication(userId: number, actorId: number) {
    const user = await rbacRepository.getUserById(userId);
    if (!user) throw new NotFoundError('User');
    if (user.coach_status !== 'pending') throw new Error('Coach application is not pending');
    await rbacRepository.updateCoachStatus(userId, 'approved');
    return this.getUserById(userId);
  }

  async rejectCoachApplication(userId: number, reason: string, actorId: number) {
    const user = await rbacRepository.getUserById(userId);
    if (!user) throw new NotFoundError('User');
    if (user.coach_status !== 'pending') throw new Error('Coach application is not pending');
    await rbacRepository.updateCoachStatus(userId, 'rejected', reason);
    return this.getUserById(userId);
  }

  async getUserBookings(userId: number) {
    return rbacRepository.getUserBookings(userId);
  }

  async getUserAcademyEnrollments(userId: number) {
    return rbacRepository.getUserAcademyEnrollments(userId);
  }

  async getUserOrders(userId: number) {
    return rbacRepository.getUserOrders(userId);
  }

  async getUserActivity(userId: number, limit?: number) {
    return rbacRepository.getUserActivity(userId, limit);
  }

  async getUserOrganisations(userId: number) {
    return rbacRepository.getUserOrganisations(userId);
  }

  async getUserBranchAccess(userId: number) {
    return rbacRepository.getUserBranchAccess(userId);
  }

  async getPlayerLevels() {
    return rbacRepository.getPlayerLevels();
  }

  async getUserBookingDetail(bookingId: number) {
    const booking = await rbacRepository.getUserBookingDetail(bookingId);
    if (!booking) throw new NotFoundError('Booking');
    return booking;
  }

  async getUserOrderDetail(orderId: number) {
    const order = await rbacRepository.getUserOrderDetail(orderId);
    if (!order) throw new NotFoundError('Order');
    return order;
  }

  async changeUserPassword(userId: number, newPassword: string) {
    const hashed = hashPassword(newPassword);
    await rbacRepository.changeUserPassword(userId, hashed);
  }


  async getFeatureFlags() {
    return rbacRepository.getFeatureFlags();
  }

  async getEnabledFeatureFlags() {
    return rbacRepository.getEnabledFeatureFlags();
  }

  async isFeatureEnabled(flagKey: string) {
    return rbacRepository.isFeatureEnabled(flagKey);
  }

  async createFlag(data: { flagKey: string; label: string; description?: string; module?: string }) {
    const id = await rbacRepository.createFlag(data);
    return { id, ...data };
  }

  async updateFlag(id: number, data: any) {
    await rbacRepository.updateFlag(id, data);
  }

  async toggleFlag(id: number) {
    const flag = await rbacRepository.toggleFlag(id);
    return flag;
  }

  async deleteFlag(id: number) {
    await rbacRepository.deleteFlag(id);
  }

  async getDashboardStats() {
    return rbacRepository.getDashboardStats();
  }

  async getDashboardTrends() {
    return rbacRepository.getDashboardTrends();
  }

  // ── UI Permissions ────────────────────────────────────────────────────

  async getUIPermissionsWithRoles(): Promise<any[]> {
    return rbacRepository.getUIPermissionsWithRoles();
  }

  async getPermissionRoleAssignments(permissionId: number): Promise<any[]> {
    return rbacRepository.getPermissionRoleAssignments(permissionId);
  }

  async getUserPermissionKeys(userId: number): Promise<string[]> {
    return rbacRepository.getUserPermissionKeys(userId);
  }

  async syncUIRegistry(elements: {
    permissionKey: string;
    moduleSlug: string;
    elementType: string;
    elementLabel: string;
    componentPath?: string;
  }[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    for (const el of elements) {
      let mod = await rbacRepository.getModuleBySlug(el.moduleSlug);
      if (!mod) {
        const modId = await rbacRepository.createModule(el.moduleSlug);
        mod = await rbacRepository.getModuleBySlug(el.moduleSlug);
      }
      await rbacRepository.upsertUIPermission({
        permissionKey: el.permissionKey,
        moduleId: mod!.id,
        elementType: el.elementType,
        elementLabel: el.elementLabel,
        componentPath: el.componentPath,
      });
    }
    return { inserted, updated };
  }
}

export const rbacService = new RBACService();
