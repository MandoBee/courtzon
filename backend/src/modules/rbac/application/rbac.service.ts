import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { rbacRepository } from '../infrastructure/repositories/rbac.repository.js';
import { permissionMatchesTemplate, TEMPLATE_SLUGS } from './role-permission-templates.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { eventBus } from '../../../shared/event-bus/index.js';
import { hashPassword } from '../../../shared/utils/password.js';
import { sanitizeUploadUrl } from '../../../shared/utils/upload-url.util.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { cancelBookingHandler } from '../../booking/commands/cancel-booking.command.js';
import { CANCELLABLE_BOOKING_STATUSES } from '../../booking/domain/booking-constants.js';
import type { Command } from '../../../shared/command/command-base.js';

type RowData = mysql.RowDataPacket[];

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
      await conn.execute(`DELETE FROM user_roles WHERE role_id = ?`, [id]);
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
    // Referee is an independent actor — provision its identity row so the
    // Referee module never depends on another actor's profile table.
    if (role.slug === 'referee') {
      const pool = getPool();
      await pool.execute(
        `INSERT INTO referees (user_id, status) VALUES (?, 'approved')
         ON DUPLICATE KEY UPDATE status = 'approved', deleted_at = NULL`,
        [userId],
      );
    }
    try { eventBus.emit('user.role.changed' as any, { userId, roleId, roleSlug: role.slug, assignedBy }); } catch {}
  }

  async removeUserRole(userId: number, roleId: number) {
    await rbacRepository.removeUserRole(userId, roleId);
    try { eventBus.emit('user.role.changed' as any, { userId, roleId, action: 'removed' }); } catch {}
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
    const prevStatus = user.account_status;
    await rbacRepository.updateUser(userId, data);
    if (data.accountStatus && data.accountStatus !== prevStatus) {
      if (data.accountStatus === 'suspended') {
        try { eventBus.emit('user:suspended' as any, { userId, reason: 'Admin action' }); } catch {}
      } else if (data.accountStatus === 'active' && prevStatus === 'suspended') {
        try { eventBus.emit('user:activated' as any, { userId }); } catch {}
      }
    }
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
        const cancelCommand: Command = {
          commandId: `CancelBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          commandType: 'CancelBooking',
          aggregateType: 'booking',
          aggregateId: String(b.id),
          payload: { bookingId: b.id, reason: 'Auto-cancelled: user deleted' },
          correlationId: `corr_${Date.now()}`,
        };
        const cancelResult = await commandPipeline.execute(cancelCommand, {
          validate: async () => cancelBookingHandler.validate(cancelCommand),
          execute: async (cmd, c) => cancelBookingHandler.execute(cmd, c),
          events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
        });
        if (cancelResult.status === 'error') throw new Error(`CancelBooking failed: ${cancelResult.message}`);
      }
      await this.#cascadeDeleteUser(userId, conn);
      const [result] = await conn.execute(
        'UPDATE users SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
        [userId],
      );
      if (!(result as { affectedRows: number }).affectedRows) {
        throw new NotFoundError('User');
      }
      await conn.commit();
      try { eventBus.emit('user:deleted' as any, { userId, actorId }); } catch {}
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

  async getUserCoach(userId: number) {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    const coach = await activitiesRepository.findCoachByUserId(userId);
    if (!coach) return null;
    const coachId = coach.id;
    const [agreements, availability, blackouts, reviews, sessions, summary] = await Promise.all([
      activitiesRepository.listOrgAgreements(coachId),
      activitiesRepository.getCoachAvailability(coachId),
      activitiesRepository.getCoachBlackouts(coachId),
      activitiesRepository.listCoachReviews(coachId),
      activitiesRepository.findCoachSessions({ coachId, page: 1, limit: 500 }),
      activitiesRepository.getCoachSummary(coachId),
    ]);
    return { coach, agreements, availability, blackouts, reviews, sessions, summary };
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

  /**
   * Apply role templates to role_permissions (INSERT-only by default).
   * Super Admin receives every permission in the database.
   * Mirrors backend/scripts/sync-role-permissions.mjs.
   */
  async applyRoleTemplates(prune = false): Promise<{
    granted: number;
    pruned: number;
    roles: { slug: string; organisationId: number | null; target: number; granted: number; pruned: number }[];
  }> {
    const pool = getPool();
    const [permissions] = await pool.execute<RowData>(
      'SELECT id, permission_key FROM permissions ORDER BY permission_key',
    );
    const permByKey = new Map<string, number>();
    for (const p of permissions as any[]) {
      permByKey.set(p.permission_key as string, p.id as number);
    }

    const [roles] = await pool.execute<RowData>(
      `SELECT id, slug, name, organisation_id, is_system
       FROM roles WHERE deleted_at IS NULL ORDER BY id`,
    );

    let totalGranted = 0;
    let totalPruned = 0;
    const summary: { slug: string; organisationId: number | null; target: number; granted: number; pruned: number }[] = [];

    for (const role of roles as any[]) {
      const templateSlug: string = role.slug as string;
      const isSuperAdmin = templateSlug === 'super_admin';

      if (!isSuperAdmin && !TEMPLATE_SLUGS.includes(templateSlug)) continue;

      const targetPermIds = new Set<number>();
      for (const p of permissions as any[]) {
        if (isSuperAdmin || permissionMatchesTemplate(templateSlug, p.permission_key as string)) {
          targetPermIds.add(p.id as number);
        }
      }

      const [existing] = await pool.execute<RowData>(
        'SELECT permission_id FROM role_permissions WHERE role_id = ?',
        [role.id],
      );
      const existingIds = new Set<number>((existing as any[]).map((r) => r.permission_id as number));

      let granted = 0;
      for (const permId of targetPermIds) {
        if (!existingIds.has(permId)) {
          await pool.execute(
            'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
            [role.id, permId],
          );
          granted++;
        }
      }

      let pruned = 0;
      if (prune && !isSuperAdmin) {
        for (const permId of existingIds) {
          if (!targetPermIds.has(permId)) {
            await pool.execute(
              'DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?',
              [role.id, permId],
            );
            pruned++;
          }
        }
      }

      totalGranted += granted;
      totalPruned += pruned;
      summary.push({
        slug: templateSlug,
        organisationId: role.organisation_id as number | null,
        target: targetPermIds.size,
        granted,
        pruned,
      });
    }

    // Ensure platform.admin on super_admin (API adminGuard fallback)
    const platformAdminId = permByKey.get('platform.admin');
    if (platformAdminId) {
      const [superRoles] = await pool.execute<RowData>(
        `SELECT id FROM roles WHERE slug IN ('super_admin', 'super-admin') AND deleted_at IS NULL`,
      );
      for (const r of superRoles as any[]) {
        await pool.execute(
          'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [r.id, platformAdminId],
        );
      }
    }

    return { granted: totalGranted, pruned: totalPruned, roles: summary };
  }

  async #cascadeDeleteUser(userId: number, conn: any): Promise<void> {
    await conn.execute(
      `UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = ? AND is_revoked = FALSE`,
      [userId],
    );
    await conn.execute(
      `UPDATE coach_sessions cs LEFT JOIN coach_profiles cp ON cp.id = cs.coach_id
       SET cs.status = 'cancelled'
       WHERE (cp.user_id = ? OR cs.player_id = ?) AND cs.status IN ('scheduled', 'confirmed', 'in_progress')`,
      [userId, userId],
    );
    await conn.execute(
      `UPDATE coach_org_agreements coa INNER JOIN coach_profiles cp ON cp.id = coa.coach_id
       SET coa.status = 'rejected', coa.is_active = 0
       WHERE cp.user_id = ? AND coa.status = 'pending'`,
      [userId],
    );
    await conn.execute(
      `UPDATE coach_profiles SET deleted_at = NOW(), status = 'rejected'
       WHERE user_id = ? AND deleted_at IS NULL`,
      [userId],
    );
    await conn.execute(
      `UPDATE professional_profiles SET is_available = 0 WHERE user_id = ?`,
      [userId],
    );
    await conn.execute(
      `UPDATE seller_profiles SET deleted_at = NOW() WHERE user_id = ? AND deleted_at IS NULL`,
      [userId],
    );
    await conn.execute(
      `UPDATE referees SET deleted_at = NOW(), status = 'inactive'
       WHERE user_id = ? AND deleted_at IS NULL`,
      [userId],
    );
    await conn.execute(
      `UPDATE branch_player_access SET status = 'rejected', review_note = 'User deleted'
       WHERE player_id = ? AND status = 'pending'`,
      [userId],
    );
    await conn.execute(
      `UPDATE organisation_upgrade_requests
       SET status = 'rejected', notes = CONCAT(COALESCE(notes, ''), ' | Requester deleted')
       WHERE requested_by = ? AND status = 'pending'`,
      [userId],
    );
    await conn.execute(
      `UPDATE withdrawal_requests SET status = 'cancelled' WHERE user_id = ? AND status = 'pending'`,
      [userId],
    );
    await conn.execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);
    await conn.execute(
      `UPDATE users SET account_status = 'deleted' WHERE id = ? AND deleted_at IS NULL`,
      [userId],
    );
  }
}

export const rbacService = new RBACService();
