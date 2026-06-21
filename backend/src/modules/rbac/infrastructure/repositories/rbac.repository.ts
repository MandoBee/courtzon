import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export class RBACRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async getPermissionModules(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM permission_modules WHERE is_active = TRUE ORDER BY sort_order`
    );
    return rows;
  }

  async getPermissions(moduleId?: number): Promise<any[]> {
    let sql = `SELECT p.*, pm.slug as module_slug FROM permissions p
               JOIN permission_modules pm ON pm.id = p.module_id`;
    const params: any[] = [];
    if (moduleId) {
      sql += ` WHERE p.module_id = ?`;
      params.push(moduleId);
    }
    sql += ` ORDER BY pm.sort_order, p.permission_key`;
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows;
  }

  async createPermission(data: { moduleId: number; permissionKey: string; description?: string }): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO permissions (module_id, permission_key, description) VALUES (?, ?, ?)`,
      [data.moduleId, data.permissionKey, data.description || null]
    );
    return result.insertId;
  }

  async updatePermission(id: number, data: { moduleId?: number; permissionKey?: string; description?: string }): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    if (data.moduleId !== undefined) { fields.push('module_id = ?'); values.push(data.moduleId); }
    if (data.permissionKey !== undefined) { fields.push('permission_key = ?'); values.push(data.permissionKey); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (!fields.length) return;
    values.push(id);
    await this.pool.execute(`UPDATE permissions SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async deletePermission(id: number): Promise<void> {
    await this.pool.execute(`DELETE FROM role_permissions WHERE permission_id = ?`, [id]);
    await this.pool.execute(`DELETE FROM permissions WHERE id = ?`, [id]);
  }

  async getRoles(organisationId?: number | null, includeDeleted = false): Promise<any[]> {
    let sql = `SELECT r.id, r.name, r.slug, r.is_system, r.is_active, r.organisation_id, r.deleted_at, o.name as organisation_name
               FROM roles r
               LEFT JOIN organisations o ON o.id = r.organisation_id
               WHERE 1=1`;
    const params: any[] = [];
    if (!includeDeleted) {
      sql += ` AND r.deleted_at IS NULL`;
    }
    if (organisationId != null) {
      sql += ` AND (r.organisation_id = ? OR (r.organisation_id IS NULL AND r.is_system = TRUE))`;
      params.push(organisationId);
    }
    sql += ` ORDER BY r.is_system DESC, r.name, r.organisation_id`;
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows;
  }

  async restoreRole(id: number): Promise<void> {
    await this.pool.execute(`UPDATE roles SET deleted_at = NULL WHERE id = ?`, [id]);
  }

  async getRole(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT r.*, o.name as organisation_name FROM roles r
       LEFT JOIN organisations o ON o.id = r.organisation_id
       WHERE r.id = ? AND r.deleted_at IS NULL`, [id]
    );
    return rows.length ? rows[0] : null;
  }

  async getRoleById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT r.*, o.name as organisation_name FROM roles r
       LEFT JOIN organisations o ON o.id = r.organisation_id
       WHERE r.id = ?`, [id]
    );
    return rows.length ? rows[0] : null;
  }

  async createRole(data: { organisationId?: number | null; name: string; slug: string; description?: string }): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO roles (organisation_id, name, slug, description) VALUES (?, ?, ?, ?)`,
      [data.organisationId || null, data.name, data.slug, data.description || null]
    );
    return result.insertId;
  }

  async updateRole(id: number, data: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    for (const key of ['name', 'slug', 'description', 'is_active']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (!fields.length) return;
    values.push(id);
    await this.pool.execute(`UPDATE roles SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async deleteRole(id: number): Promise<void> {
    await this.pool.execute(
      `UPDATE roles SET deleted_at = NOW() WHERE id = ? AND is_system = FALSE`, [id]
    );
  }

  async getRoleBySlug(slug: string): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1`,
      [slug]
    );
    return rows.length ? rows[0] : null;
  }

  async getTemplateRoleBySlug(slug: string): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM roles WHERE slug = ? AND organisation_id IS NULL AND deleted_at IS NULL LIMIT 1',
      [slug]
    );
    return rows.length ? rows[0] : null;
  }

  async getRolePermissions(roleId: number): Promise<number[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT permission_id FROM role_permissions WHERE role_id = ?`, [roleId]
    );
    return rows.map(r => r.permission_id);
  }

  async getRolePermissionsWithLabels(roleId: number): Promise<{ id: number; permission_key: string; element_label: string | null }[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT p.id, p.permission_key, p.element_label
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ?
       ORDER BY p.permission_key`, [roleId]
    );
    return rows as any[];
  }

  async cloneRoleForOrg(templateRoleId: number, orgId: number): Promise<number> {
    const template = await this.getRoleById(templateRoleId);
    if (!template) throw new Error('Template role not found');

    await this.pool.execute(
      'INSERT IGNORE INTO roles (organisation_id, name, slug, description) VALUES (?, ?, ?, ?)',
      [orgId, template.name, template.slug, template.description || null]
    );

    const [rows] = await this.pool.execute<RowData>(
      'SELECT id FROM roles WHERE organisation_id = ? AND slug = ? AND deleted_at IS NULL',
      [orgId, template.slug]
    );
    if (!rows.length) throw new Error('Failed to create or find org role');
    const roleId = (rows[0] as any).id;

    // Copy permissions if not already done
    const [perms] = await this.pool.execute<RowData>(
      'SELECT permission_id FROM role_permissions WHERE role_id = ?', [templateRoleId]
    );
    if ((perms as any[]).length) {
      const values = (perms as any[]).map((p: any) => `(${roleId}, ${p.permission_id})`).join(',');
      await this.pool.execute(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ${values}`
      );
    }

    return roleId;
  }

  async setRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    await this.pool.execute(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);
    if (permissionIds.length) {
      const values = permissionIds.map(pid => `(${roleId}, ${pid})`).join(',');
      await this.pool.execute(`INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}`);
    }
  }

  async addRolePermission(roleId: number, permissionId: number): Promise<void> {
    await this.pool.execute(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
      [roleId, permissionId]
    );
  }

  async removeRolePermission(roleId: number, permissionId: number): Promise<void> {
    await this.pool.execute(
      `DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?`,
      [roleId, permissionId]
    );
  }

  async getUserRoles(userId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT ur.*, r.name as role_name, r.slug as role_slug, r.is_system, r.organisation_id,
               o.name as organisation_name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN organisations o ON o.id = r.organisation_id
       WHERE ur.user_id = ? AND ur.is_active = TRUE
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId]
    );
    return rows;
  }

  async assignRole(userId: number, roleId: number, assignedBy: number): Promise<number> {
    await this.pool.execute(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = TRUE, assigned_by = VALUES(assigned_by)`,
      [userId, roleId, assignedBy]
    );
    const [rows] = await this.pool.execute<RowData>(
      `SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?`,
      [userId, roleId]
    );
    return rows[0]?.id;
  }

  async removeUserRole(userId: number, roleId: number): Promise<void> {
    await this.pool.execute(
      `UPDATE user_roles SET is_active = FALSE WHERE user_id = ? AND role_id = ?`,
      [userId, roleId]
    );
  }

  async setUserRoleScope(userRoleId: number, scopes: { scopeType: string; scopeId: number }[]): Promise<void> {
    await this.pool.execute(
      `DELETE FROM user_role_scopes WHERE user_role_id = ?`, [userRoleId]
    );
    for (const scope of scopes) {
      await this.pool.execute(
        `INSERT INTO user_role_scopes (user_role_id, scope_type, scope_id) VALUES (?, ?, ?)`,
        [userRoleId, scope.scopeType, scope.scopeId]
      );
    }
  }

  async getUserScopes(userId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT 'organisation' AS scope_type, o.id AS scope_id,
              o.name, o.logo_url, o.is_verified, o.is_active
       FROM organisations o
       WHERE o.deleted_at IS NULL
         AND (
           o.owner_id = ?
           OR o.id IN (
             SELECT urs.scope_id
             FROM user_role_scopes urs
             JOIN user_roles ur ON ur.id = urs.user_role_id
             WHERE ur.user_id = ? AND ur.is_active = TRUE
               AND urs.scope_type = 'organisation'
           )
           OR o.id IN (
             SELECT r.organisation_id
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = ? AND ur.is_active = TRUE
               AND r.organisation_id IS NOT NULL AND r.deleted_at IS NULL
           )
         )
       ORDER BY o.name`,
      [userId, userId, userId]
    );
    return rows;
  }


  async listUsers(page: number = 1, limit: number = 50, filters?: { search?: string; status?: string; country?: string; role?: string; countryId?: number | null }): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const whereParts: string[] = ['u.deleted_at IS NULL'];
    const params: any[] = [];

    if (filters?.search) {
      whereParts.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.full_phone LIKE ? OR u.phone_number LIKE ?)');
      const s = `%${filters.search}%`;
      params.push(s, s, s, s);
    }
    if (filters?.status) {
      whereParts.push('u.account_status = ?');
      params.push(filters.status);
    }
    if (filters?.country) {
      whereParts.push('c.name LIKE ?');
      params.push(`%${filters.country}%`);
    }
    if (filters?.role) {
      whereParts.push(`u.id IN (SELECT ur2.user_id FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id WHERE ur2.is_active = TRUE AND r2.name = ?)`);
      params.push(filters.role);
    }
    if (filters?.countryId) {
      whereParts.push('u.country_id = ?');
      params.push(filters.countryId);
    }

    const whereClause = whereParts.join(' AND ');

    const [countRows] = await this.pool.query<RowData>(
      `SELECT COUNT(*) as total FROM users u
       LEFT JOIN countries c ON c.id = u.country_id
       WHERE ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    const [rows] = await this.pool.query<RowData>(
      `SELECT u.id, u.public_id, u.full_name, u.email, u.phone_number, u.full_phone, u.account_status,
              u.avatar_url, u.gender,
              u.is_phone_verified, u.is_email_verified, u.created_at,
              COALESCE(pp.main_sport_id, 0) as main_sport_id, pp.is_coach, pp.is_seller,
              c.name as country_name, c.iso_code as country_iso, c.flag_emoji as country_flag,
              GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') as role_names
       FROM users u
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN countries c ON c.id = u.country_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = TRUE
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE ${whereClause}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { data: rows, total };
  }

  async getFeatureFlags(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM feature_flags ORDER BY module, flag_key'
    );
    return rows;
  }

  async getEnabledFeatureFlags(): Promise<Record<string, boolean>> {
    const [rows] = await this.pool.execute<RowData>(
      "SELECT flag_key, is_enabled FROM feature_flags WHERE is_enabled = TRUE"
    );
    const map: Record<string, boolean> = {};
    for (const row of rows) {
      map[row.flag_key as string] = true;
    }
    return map;
  }

  async isFeatureEnabled(flagKey: string): Promise<boolean> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT is_enabled FROM feature_flags WHERE flag_key = ? LIMIT 1',
      [flagKey]
    );
    return rows.length > 0 && !!rows[0].is_enabled;
  }

  async createFlag(data: { flagKey: string; label: string; description?: string; module?: string }): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      'INSERT INTO feature_flags (flag_key, label, description, module) VALUES (?, ?, ?, ?)',
      [data.flagKey, data.label, data.description || null, data.module || 'general']
    );
    return result.insertId;
  }

  async updateFlag(id: number, data: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    for (const key of ['flag_key', 'label', 'description', 'module']) {
      if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]); }
    }
    if (!fields.length) return;
    values.push(id);
    await this.pool.execute(`UPDATE feature_flags SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async toggleFlag(id: number): Promise<any> {
    const [rows] = await this.pool.execute<RowData>('SELECT id, is_enabled FROM feature_flags WHERE id = ?', [id]);
    if (!rows.length) throw new Error('Feature flag not found');
    const newVal = rows[0].is_enabled ? 0 : 1;
    await this.pool.execute('UPDATE feature_flags SET is_enabled = ? WHERE id = ?', [newVal, id]);
    return { id, isEnabled: !!newVal };
  }

  async deleteFlag(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM feature_flags WHERE id = ?', [id]);
  }

  // ── UI Permissions ─────────────────────────────────────────────────────

  async getUIPermissionsWithRoles(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT p.id, p.permission_key, p.module_id, p.element_type, p.element_label,
              p.component_path, pm.slug as module_slug
       FROM permissions p
       JOIN permission_modules pm ON pm.id = p.module_id
       WHERE p.is_ui_element = TRUE
       ORDER BY pm.sort_order, p.permission_key`
    );
    return rows;
  }

  async getPermissionRoleAssignments(permissionId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT r.id as role_id, r.name as role_name, r.slug as role_slug,
              IF(rp.id IS NOT NULL, TRUE, FALSE) as has_permission
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = ?
       WHERE r.deleted_at IS NULL
       ORDER BY r.is_system DESC, r.name`,
      [permissionId]
    );
    return rows;
  }

  async getUserPermissionKeys(userId: number): Promise<string[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT DISTINCT p.permission_key FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND ur.is_active = TRUE
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
         AND r.deleted_at IS NULL`,
      [userId]
    );
    return rows.map((r: any) => r.permission_key);
  }

  async upsertUIPermission(data: {
    permissionKey: string;
    moduleId: number;
    elementType: string;
    elementLabel: string;
    componentPath?: string;
  }): Promise<void> {
    const description = `Controls visibility of "${data.elementLabel}" (${data.elementType})`;
    await this.pool.execute(
      `INSERT INTO permissions (module_id, permission_key, element_type, element_label, component_path, is_ui_element, description)
       VALUES (?, ?, ?, ?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE
         element_type = VALUES(element_type),
         element_label = VALUES(element_label),
         component_path = VALUES(component_path),
         is_ui_element = TRUE`,
      [
        data.moduleId,
        data.permissionKey,
        data.elementType,
        data.elementLabel,
        data.componentPath || null,
        description,
      ]
    );
  }

  async getModuleBySlug(slug: string): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM permission_modules WHERE slug = ?`, [slug]
    );
    return rows[0] || null;
  }

  async createModule(slug: string, sortOrder?: number): Promise<number> {
    const maxSort = sortOrder ?? 99;
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO permission_modules (slug, sort_order) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE id=id`,
      [slug, maxSort]
    );
    if (result.insertId) return result.insertId;
    const mod = await this.getModuleBySlug(slug);
    return mod!.id;
  }

  async getDashboardStats(countryId?: number | null): Promise<any> {
    const [[userCount]] = await this.pool.query<RowData>(
      `SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL`
    );
    const [[orgCount]] = await this.pool.query<RowData>(
      `SELECT COUNT(*) as count FROM organisations WHERE deleted_at IS NULL`
    );
    const [[pendingOrgCount]] = await this.pool.query<RowData>(
      `SELECT COUNT(*) as count FROM organisations WHERE is_verified = 0 AND deleted_at IS NULL`
    );
    const [[bookingCount]] = await this.pool.query<RowData>(
      `SELECT COUNT(*) as count FROM bookings WHERE booking_status NOT IN ('cancelled', 'expired')`
    );
    const [[todayBookings]] = await this.pool.query<RowData>(
      `SELECT COUNT(*) as count FROM bookings WHERE DATE(created_at) = CURDATE() AND booking_status NOT IN ('cancelled', 'expired')`
    );
    const [[activeToday]] = await this.pool.query<RowData>(
      `SELECT COUNT(DISTINCT user_id) as count FROM user_sessions WHERE DATE(last_activity_at) = CURDATE()`
    );
    const [[revenue]] = await this.pool.query<RowData>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE direction = 'credit' AND transaction_type IN ('payment', 'commission')`
    );
    const [[productCount]] = await this.pool.query<RowData>(
      `SELECT COUNT(*) as count FROM products WHERE deleted_at IS NULL`
    );
    const [[coachCount]] = await this.pool.query<RowData>(
      `SELECT COUNT(*) as count FROM coach_profiles`
    );
    return {
      totalUsers: userCount.count, totalOrganisations: orgCount.count, pendingOrganisations: pendingOrgCount.count,
      totalBookings: bookingCount.count, todayBookings: todayBookings.count, activeUsersToday: activeToday.count,
      totalRevenue: revenue.total, totalProducts: productCount.count, totalCoaches: coachCount.count,
    };
  }

  async getUserById(userId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT u.*, c.name as country_name, c.iso_code as country_iso, l.name as language_name,
              pp.main_sport_id, pp.is_seller, pp.main_level_id,
              (cp.status = 'approved') AS is_coach, COALESCE(cp.status, 'none') AS coach_status,
              cp.rejected_reason AS coach_rejected_reason
       FROM users u
       LEFT JOIN countries c ON c.id = u.country_id
       LEFT JOIN languages l ON l.id = u.language_id
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id AND cp.deleted_at IS NULL
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [userId]
    );
    return rows[0] || null;
  }

  async deleteUser(userId: number): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE users SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [userId]
    );
    return (result as mysql.ResultSetHeader).affectedRows > 0;
  }

  async updateUser(userId: number, data: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      fullName: 'full_name', email: 'email', phoneNumber: 'phone_number',
      fullPhone: 'full_phone', accountStatus: 'account_status', gender: 'gender',
      birthDate: 'birth_date', languageId: 'language_id', countryId: 'country_id',
      timezone: 'timezone', darkMode: 'dark_mode',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (fields.length) {
      values.push(userId);
      await this.pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    }
    if (data.isCoach !== undefined) {
      const status = data.isCoach ? 'approved' : 'none';
      // coach_profiles is the source of truth: upsert the row.
      await this.pool.execute(
        `INSERT INTO coach_profiles (user_id, status) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), deleted_at = NULL`,
        [userId, status]
      );
      // Transitional dual-write to the legacy player_profiles columns (dropped later).
      const [existing] = await this.pool.execute<RowData>(`SELECT id FROM player_profiles WHERE user_id = ?`, [userId]);
      if (existing.length) {
        await this.pool.execute(
          `UPDATE player_profiles SET is_coach = ?, coach_status = ? WHERE user_id = ?`,
          [data.isCoach ? 1 : 0, status, userId]
        );
      } else if (data.isCoach) {
        await this.pool.execute(
          `INSERT INTO player_profiles (user_id, is_coach, coach_status) VALUES (?, 1, 'approved')`,
          [userId]
        );
      }
    }
  }

  async updateCoachStatus(userId: number, status: string, reason?: string): Promise<void> {
    // coach_profiles is the source of truth.
    await this.pool.execute(
      `UPDATE coach_profiles SET status = ?, rejected_reason = ? WHERE user_id = ?`,
      [status, reason || null, userId]
    );
    // Transitional dual-write to the legacy player_profiles columns (dropped later).
    await this.pool.execute(
      `UPDATE player_profiles SET coach_status = ?, is_coach = ?, coach_rejected_reason = ? WHERE user_id = ?`,
      [status, status === 'approved' ? 1 : 0, reason || null, userId]
    );
  }

  async getUserBookings(userId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT b.*, r.name as resource_name, org.name as org_name
       FROM bookings b
       LEFT JOIN resources r ON r.id = b.resource_id
       LEFT JOIN organisations org ON org.id = b.organisation_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC LIMIT 100`,
      [userId]
    );
    return rows;
  }

  async getUserAcademyEnrollments(userId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT ae.*, a.name as academy_name, a.sport_id,
              s.name as sport_name, org.name as org_name
       FROM academy_enrollments ae
       JOIN academies a ON a.id = ae.academy_id
       LEFT JOIN sports s ON s.id = a.sport_id
       LEFT JOIN organisations org ON org.id = a.organisation_id
       WHERE ae.player_id = ?
       ORDER BY ae.enrolled_at DESC LIMIT 100`,
      [userId]
    );
    return rows;
  }

  async getUserOrders(userId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT o.*, COUNT(oi.id) as item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.buyer_id = ?
       GROUP BY o.id
       ORDER BY o.created_at DESC LIMIT 100`,
      [userId]
    );
    return rows;
  }

  async getUserActivity(userId: number, limit: number = 50): Promise<any[]> {
    const safeLimit = Math.min(Math.max(1, limit), 500);
    const [rows] = await this.pool.query<RowData>(
      `SELECT * FROM activity_logs
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [userId]
    );
    return rows;
  }

  async getUserOrganisations(userId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT o.*, ot.slug as org_type_slug, ot.name as org_type_name
       FROM organisations o
       LEFT JOIN organisation_types ot ON ot.id = o.org_type_id
       WHERE o.owner_id = ? AND o.deleted_at IS NULL
       ORDER BY o.created_at DESC`,
      [userId]
    );
    return rows;
  }

  async getUserBranchAccess(userId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT bpa.*, b.name as branch_name, org.id as org_id, org.name as org_name
       FROM branch_player_access bpa
       JOIN branches b ON b.id = bpa.branch_id
       JOIN organisations org ON org.id = b.organisation_id
       WHERE bpa.player_id = ?
       ORDER BY bpa.created_at DESC LIMIT 100`,
      [userId]
    );
    return rows;
  }

  async getPlayerLevels(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT MIN(id) as id, name, MIN(level_order) as level_order FROM player_levels WHERE is_active = TRUE GROUP BY name ORDER BY MIN(level_order)'
    );
    return rows;
  }

  async getUserBookingDetail(bookingId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT b.*, r.name as resource_name, org.name as org_name, u.full_name as user_name
       FROM bookings b
       LEFT JOIN resources r ON r.id = b.resource_id
       LEFT JOIN organisations org ON org.id = b.organisation_id
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`,
      [bookingId]
    );
    return rows[0] || null;
  }

  async getUserOrderDetail(orderId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT o.*, u.full_name as user_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       WHERE o.id = ?`,
      [orderId]
    );
    if (!rows[0]) return null;
    const [items] = await this.pool.execute<RowData>(
      `SELECT oi.*, p.name as product_name
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [orderId]
    );
    return { ...rows[0], items };
  }

  async changeUserPassword(userId: number, newPasswordHash: string): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET password_hash = ?, version = version + 1 WHERE id = ?',
      [newPasswordHash, userId]
    );
  }

  async getDashboardTrends(countryId?: number | null): Promise<any> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [revenueRows] = await this.pool.query<RowData>(
      `SELECT DATE(created_at) as date, COALESCE(SUM(amount), 0) as amount
       FROM wallet_transactions
       WHERE direction = 'credit' AND transaction_type IN ('payment','commission')
         AND DATE(created_at) >= ?
       GROUP BY DATE(created_at) ORDER BY date`, [thirtyDaysAgo]
    );

    const [bookingRows] = await this.pool.query<RowData>(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM bookings
       WHERE booking_status NOT IN ('cancelled','expired') AND DATE(created_at) >= ?
       GROUP BY DATE(created_at) ORDER BY date`, [sevenDaysAgo]
    );

    const [recentUsers] = await this.pool.query<RowData>(
      `SELECT id, full_name, email, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5`
    );

    const [recentBookings] = await this.pool.query<RowData>(
      `SELECT b.id, b.booking_type, b.total_amount, b.booking_status, b.created_at, u.full_name
       FROM bookings b JOIN users u ON u.id = b.user_id
       WHERE b.booking_status NOT IN ('expired') ORDER BY b.created_at DESC LIMIT 5`
    );

    const [recentOrders] = await this.pool.query<RowData>(
      `SELECT o.id, o.total, o.status, o.created_at, u.full_name
       FROM orders o JOIN users u ON u.id = o.buyer_id
       WHERE o.status NOT IN ('cancelled','refunded') ORDER BY o.created_at DESC LIMIT 5`
    );

    const serverUptime = process.uptime();
    const [[dbStatus]] = await this.pool.query<RowData>(`SELECT 1 as ok`);
    const [errorCount] = await this.pool.query<RowData>(
      `SELECT COUNT(*) as count FROM activity_logs WHERE activity_type = 'error' AND created_at >= NOW() - INTERVAL 24 HOUR`
    );

    return {
      revenueTimeline: revenueRows,
      bookingTimeline: bookingRows,
      recentActivity: { users: recentUsers, bookings: recentBookings, orders: recentOrders },
      systemHealth: {
        uptime: serverUptime,
        dbStatus: !!dbStatus,
        errors24h: errorCount[0]?.count || 0,
      },
    };
  }
}

export const rbacRepository = new RBACRepository();
