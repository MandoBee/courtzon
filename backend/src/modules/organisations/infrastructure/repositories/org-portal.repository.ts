import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { ValidationError } from '../../../../shared/errors/app-error.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';

type RowData = mysql.RowDataPacket[];

export async function getOrgInfo(orgId: number) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT id, name, logo_url, cover_url, description, email, phone, website, is_verified, is_active
     FROM organisations WHERE id = ? AND deleted_at IS NULL`,
    [orgId]
  );
  return rows[0] || null;
}

export async function getOrgStats(orgId: number) {
  const pool = getPool();
  const [bookingRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) as total FROM bookings WHERE organisation_id = ?`,
    [orgId]
  );
  const [branchRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) as total FROM branches WHERE organisation_id = ? AND deleted_at IS NULL`,
    [orgId]
  );
  const [resourceRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) as total FROM resources r
     JOIN branches b ON b.id = r.branch_id
     WHERE b.organisation_id = ? AND r.deleted_at IS NULL`,
    [orgId]
  );
  const [productRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) as total FROM products WHERE seller_id = ? AND deleted_at IS NULL`,
    [orgId]
  );
  const [recentBookings] = await pool.execute<RowData>(
    `SELECT b.id, b.booking_status as status, b.start_time, u.full_name as user_name, res.name as resource_name
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN resources res ON res.id = b.resource_id
     WHERE b.organisation_id = ?
     ORDER BY b.created_at DESC LIMIT 5`,
    [orgId]
  );
  return {
    totalBookings: bookingRows[0]?.total || 0,
    totalBranches: branchRows[0]?.total || 0,
    totalResources: resourceRows[0]?.total || 0,
    totalProducts: productRows[0]?.total || 0,
    recentBookings,
  };
}

export async function getOrgBookings(orgId: number, filters?: {
  branchId?: number;
  resourceId?: number;
  date?: string;
  status?: string;
  paymentStatus?: string;
  bookingType?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: any[]; total: number }> {
  const pool = getPool();
  const conditions: string[] = ['b.organisation_id = ?'];
  const params: any[] = [orgId];

  if (filters?.branchId) { conditions.push('b.branch_id = ?'); params.push(filters.branchId); }
  if (filters?.resourceId) { conditions.push('b.resource_id = ?'); params.push(filters.resourceId); }
  if (filters?.date) { conditions.push('b.booking_date = ?'); params.push(filters.date); }
  if (filters?.status) { conditions.push('b.booking_status = ?'); params.push(filters.status); }
  if (filters?.paymentStatus) { conditions.push('b.payment_status = ?'); params.push(filters.paymentStatus); }
  if (filters?.bookingType) { conditions.push('b.booking_type = ?'); params.push(filters.bookingType); }

  const where = ` WHERE ${conditions.join(' AND ')}`;

  const [countRows] = await pool.execute<RowData>(`SELECT COUNT(*) as total FROM bookings b${where}`, params);
  const total = (countRows[0] as any).total;

  const pag = buildPagination(filters?.page, filters?.limit);

  const [rows] = await pool.execute<RowData>(
    `SELECT b.*,
            u.full_name as user_name, u.phone_number as user_phone,
            res.name as resource_name, br.name as branch_name
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN resources res ON res.id = b.resource_id
     JOIN branches br ON br.id = b.branch_id
     ${where}
     ORDER BY b.created_at DESC${paginationClause(pag)}`,
    params,
  );

  return { rows, total };
}

export async function getOrgResources(orgId: number) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT r.*, b.name as branch_name, s.name as sport_name
     FROM resources r
     JOIN branches b ON b.id = r.branch_id
     LEFT JOIN sports s ON s.id = r.sport_id
     WHERE b.organisation_id = ? AND r.deleted_at IS NULL
     ORDER BY b.name, r.name`,
    [orgId]
  );
  return rows;
}

/** True if the branch exists and belongs to the given organisation. */
export async function branchBelongsToOrg(branchId: number, orgId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM branches WHERE id = ? AND organisation_id = ? AND deleted_at IS NULL LIMIT 1`,
    [branchId, orgId]
  );
  return rows.length > 0;
}

/** True if the resource exists and its branch belongs to the given organisation. */
export async function resourceBelongsToOrg(resourceId: number, orgId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM resources r JOIN branches b ON b.id = r.branch_id
      WHERE r.id = ? AND b.organisation_id = ? AND r.deleted_at IS NULL LIMIT 1`,
    [resourceId, orgId]
  );
  return rows.length > 0;
}

/** Get the branch ID for a resource, or null. */
export async function getResourceBranchId(resourceId: number): Promise<number | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT branch_id FROM resources WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [resourceId]
  );
  return (rows[0]?.branch_id as number) ?? null;
}

export async function listOrgBranches(orgId: number) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM branches WHERE organisation_id = ? AND deleted_at IS NULL ORDER BY name`,
    [orgId]
  );
  return rows;
}

// ── Org staff management (D5) ──────────────────────────────────────────────

/** Org roles that an org-admin/owner may assign to staff. */
export const ASSIGNABLE_ORG_ROLE_SLUGS = ['org-admin', 'shop-admin', 'branch-mgr', 'resource-mgr', 'coach', 'accountant'] as const;

export async function getOrgOwnerId(orgId: number): Promise<number | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT owner_id FROM organisations WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [orgId]
  );
  return (rows[0]?.owner_id as number) ?? null;
}

/** Staff = users holding an org-scoped role on this organisation. */
export async function listOrgStaff(orgId: number) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT u.id            AS user_id,
            u.full_name,
            u.email,
            u.avatar_url,
            r.id            AS role_id,
            r.slug          AS role_slug,
            r.name          AS role_name,
            ur.id           AS user_role_id,
            ur.assigned_at,
            (o.owner_id = u.id) AS is_owner,
            (SELECT GROUP_CONCAT(scope_id) FROM user_role_scopes
              WHERE user_role_id = ur.id AND scope_type = 'branch') AS branch_ids,
            (SELECT GROUP_CONCAT(scope_id) FROM user_role_scopes
              WHERE user_role_id = ur.id AND scope_type = 'resource') AS resource_ids
     FROM user_role_scopes urs
     JOIN user_roles ur ON ur.id = urs.user_role_id
     JOIN roles r       ON r.id = ur.role_id
     JOIN users u       ON u.id = ur.user_id
     JOIN organisations o ON o.id = urs.scope_id
     WHERE urs.scope_type = 'organisation' AND urs.scope_id = ? AND ur.is_active = TRUE
     ORDER BY u.full_name`,
    [orgId]
  );
  return rows.map((r: any) => ({
    ...r,
    branch_ids: r.branch_ids ? (r.branch_ids as string).split(',').map(Number) : [],
    resource_ids: r.resource_ids ? (r.resource_ids as string).split(',').map(Number) : [],
  }));
}

export async function findUserByEmail(email: string) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT id, full_name, email FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

export async function getAssignableOrgRole(slug: string) {
  if (!ASSIGNABLE_ORG_ROLE_SLUGS.includes(slug as any)) return null;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT id, slug, name FROM roles WHERE slug = ? LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

/**
 * Add (or re-activate) an org-scoped role for a user. Uses INSERT IGNORE on the
 * scope so it never wipes the user's scopes on OTHER organisations.
 * Optionally scopes to specific branches and/or resources.
 */
export async function addStaffScope(userId: number, roleId: number, orgId: number, assignedBy: number, branchIds?: number[], resourceIds?: number[]) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = TRUE, assigned_by = VALUES(assigned_by)`,
      [userId, roleId, assignedBy]
    );
    const [urRows] = await conn.execute<RowData>(
      `SELECT id FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1`,
      [userId, roleId]
    );
    const userRoleId = urRows[0]?.id as number;
    await conn.execute(
      `INSERT IGNORE INTO user_role_scopes (user_role_id, scope_type, scope_id)
       VALUES (?, 'organisation', ?)`,
      [userRoleId, orgId]
    );
    // Branch-level scoping
    if (branchIds && branchIds.length > 0) {
      const stmt = `INSERT IGNORE INTO user_role_scopes (user_role_id, scope_type, scope_id) VALUES ${branchIds.map(() => '(?, \'branch\', ?)').join(', ')}`;
      const params: any[] = [];
      for (const bid of branchIds) { params.push(userRoleId, bid); }
      await conn.execute(stmt, params);
    }
    // Resource-level scoping
    if (resourceIds && resourceIds.length > 0) {
      const stmt = `INSERT IGNORE INTO user_role_scopes (user_role_id, scope_type, scope_id) VALUES ${resourceIds.map(() => '(?, \'resource\', ?)').join(', ')}`;
      const params: any[] = [];
      for (const rid of resourceIds) { params.push(userRoleId, rid); }
      await conn.execute(stmt, params);
    }
    await conn.commit();
    return userRoleId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Check if a user has a branch-scoped role for a specific branch. */
export async function userHasBranchScope(userId: number, branchId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_role_scopes urs
     JOIN user_roles ur ON ur.id = urs.user_role_id
     WHERE ur.user_id = ? AND ur.is_active = TRUE
       AND urs.scope_type = 'branch' AND urs.scope_id = ?
     LIMIT 1`,
    [userId, branchId]
  );
  return rows.length > 0;
}

/** Check if a user can act on a specific branch (owner, admin, org-scoped, or branch-scoped). */
export async function assertUserBranchAccess(userId: number, branchId: number, orgId: number) {
  const pool = getPool();
  const [ownerRows] = await pool.execute<RowData>(
    `SELECT 1 FROM organisations WHERE id = ? AND owner_id = ? LIMIT 1`,
    [orgId, userId]
  );
  if (ownerRows.length) return;
  const [adminRows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND ur.is_active = TRUE AND r.slug IN ('super_admin', 'super-admin', 'admin')
      LIMIT 1`,
    [userId]
  );
  if (adminRows.length) return;
  const [orgScopeRows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_role_scopes urs
     JOIN user_roles ur ON ur.id = urs.user_role_id
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = ? AND ur.is_active = TRUE
       AND urs.scope_type = 'organisation' AND urs.scope_id = ?
       AND p.permission_key = 'branches.manage'
     LIMIT 1`,
    [userId, orgId]
  );
  if (orgScopeRows.length) return;
  const hasBranch = await userHasBranchScope(userId, branchId);
  if (!hasBranch) throw new ValidationError('Access to this branch denied');
}

/**
 * Remove a user from an org: drop every org-scoped scope they hold on this org
 * (across assignable org roles), and deactivate any user_role left with no
 * remaining scopes so it stops granting access.
 */
export async function removeStaffFromOrg(userId: number, orgId: number) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [urRows] = await conn.execute<RowData>(
      `SELECT DISTINCT ur.id
         FROM user_roles ur
         JOIN user_role_scopes urs ON urs.user_role_id = ur.id
        WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND urs.scope_id = ?`,
      [userId, orgId]
    );

    await conn.execute(
      `DELETE urs FROM user_role_scopes urs
         JOIN user_roles ur ON ur.id = urs.user_role_id
        WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND urs.scope_id = ?`,
      [userId, orgId]
    );

    for (const row of urRows) {
      const [remaining] = await conn.execute<RowData>(
        `SELECT COUNT(*) AS c FROM user_role_scopes WHERE user_role_id = ?`,
        [row.id]
      );
      if ((remaining[0]?.c as number) === 0) {
        await conn.execute(`UPDATE user_roles SET is_active = FALSE WHERE id = ?`, [row.id]);
      }
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── Org coach agreements / invites (D6) ────────────────────────────────────

/** Coach agreements (any status) for an org, with coach + user info. */
export async function listOrgCoaches(orgId: number) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT coa.id, coa.coach_id, coa.coach_split_pct, coa.org_split_pct, coa.hourly_rate,
            coa.is_active, coa.status, coa.initiated_by, coa.created_at, coa.updated_at,
            cp.user_id, u.full_name AS coach_name, u.email AS coach_email,
            cp.rating_avg, cp.hourly_rate AS coach_global_rate, cp.currency_code
     FROM coach_org_agreements coa
     JOIN coach_profiles cp ON cp.id = coa.coach_id
     JOIN users u ON u.id = cp.user_id
     WHERE coa.organisation_id = ?
     ORDER BY coa.created_at DESC`,
    [orgId]
  );
  return rows;
}

/** Approved coaches not yet linked to this org — candidates to invite. */
export async function listInvitableCoaches(orgId: number) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT cp.id AS coach_id, cp.user_id, u.full_name, u.email,
            cp.rating_avg, cp.hourly_rate, cp.currency_code
     FROM coach_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.deleted_at IS NULL AND cp.status = 'approved'
       AND cp.id NOT IN (
         SELECT coach_id FROM coach_org_agreements
          WHERE organisation_id = ? AND status IN ('pending','accepted')
       )
     ORDER BY cp.rating_avg DESC, u.full_name
     LIMIT 100`,
    [orgId]
  );
  return rows;
}

export async function coachExistsApproved(coachId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM coach_profiles WHERE id = ? AND status = 'approved' AND deleted_at IS NULL LIMIT 1`,
    [coachId]
  );
  return rows.length > 0;
}

export async function findCoachUserId(coachId: number): Promise<number | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT user_id FROM coach_profiles WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [coachId]
  );
  return rows.length ? (rows[0] as any).user_id : null;
}

/** Org sends (or re-sends) an invite to a coach. Resets to pending. */
export async function orgInviteCoach(data: {
  coachId: number; orgId: number; coachSplitPct: number; orgSplitPct: number; invitedBy: number; hourlyRate?: number;
}) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO coach_org_agreements
       (coach_id, organisation_id, coach_split_pct, org_split_pct, hourly_rate, is_active, status, initiated_by, invited_by)
     VALUES (?, ?, ?, ?, ?, FALSE, 'pending', 'org', ?)
     ON DUPLICATE KEY UPDATE
       coach_split_pct = VALUES(coach_split_pct),
       org_split_pct   = VALUES(org_split_pct),
       hourly_rate     = VALUES(hourly_rate),
       is_active       = FALSE,
       status          = 'pending',
       initiated_by    = 'org',
       invited_by      = VALUES(invited_by)`,
    [data.coachId, data.orgId, data.coachSplitPct, data.orgSplitPct, data.hourlyRate ?? null, data.invitedBy]
  );
}

/** Org responds to a coach-initiated pending agreement. Returns affected rows. */
export async function respondToCoachAgreement(orgId: number, coachId: number, accept: boolean): Promise<number> {
  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE coach_org_agreements
        SET status = ?, is_active = ?
      WHERE organisation_id = ? AND coach_id = ? AND initiated_by = 'coach' AND status = 'pending'`,
    [accept ? 'accepted' : 'rejected', accept ? 1 : 0, orgId, coachId]
  );
  return (result as any).affectedRows as number;
}

export async function removeOrgCoachAgreement(orgId: number, coachId: number): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.execute(
    `DELETE FROM coach_org_agreements WHERE organisation_id = ? AND coach_id = ?`,
    [orgId, coachId]
  );
  return (result as any).affectedRows > 0;
}

export async function getOrgSubscriptionWithFeatures(orgId: number) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT os.*, sp.plan_name, sp.price_monthly, sp.price_yearly, sp.is_unlimited
     FROM organisation_subscriptions os
     JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE os.organisation_id = ? AND os.subscription_status IN ('active', 'pending')
     ORDER BY os.created_at DESC
     LIMIT 1`,
    [orgId],
  );
  if (!rows.length) return null;
  const sub = rows[0];

  const [featRows] = await pool.execute<RowData>(
    `SELECT sf.feature_key, sf.label, sf.value_type, sf.unit, sf.sort_order, spf.value
     FROM subscription_plan_features spf
     JOIN subscription_features sf ON sf.id = spf.feature_id
     WHERE spf.plan_id = ?
     ORDER BY sf.sort_order ASC`,
    [sub.plan_id],
  );

  return { sub, features: featRows };
}

export async function getFeatureUsageCounts(orgId: number): Promise<Record<string, number>> {
  const pool = getPool();

  const [[branchRows], [staffRows], [productRows], [resourceRows], [tournamentRows], [academyRows]] = await Promise.all([
    pool.execute<RowData>('SELECT COUNT(*) as cnt FROM branches WHERE organisation_id = ? AND deleted_at IS NULL', [orgId]),
    pool.execute<RowData>(
      `SELECT COUNT(DISTINCT ur.user_id) as cnt FROM user_role_scopes urs
       JOIN user_roles ur ON ur.id = urs.user_role_id
       WHERE urs.scope_type = 'organisation' AND urs.scope_id = ? AND ur.is_active = TRUE`,
      [orgId],
    ),
    pool.execute<RowData>('SELECT COUNT(*) as cnt FROM products WHERE seller_id = ? AND deleted_at IS NULL AND status != \'sold\'', [orgId]),
    pool.execute<RowData>(
      'SELECT COUNT(*) as cnt FROM resources r JOIN branches b ON b.id = r.branch_id WHERE b.organisation_id = ? AND r.deleted_at IS NULL',
      [orgId],
    ),
    pool.execute<RowData>('SELECT COUNT(*) as cnt FROM tournaments WHERE organisation_id = ? AND deleted_at IS NULL', [orgId]),
    pool.execute<RowData>('SELECT COUNT(*) as cnt FROM academies WHERE organisation_id = ? AND deleted_at IS NULL', [orgId]),
  ]);

  return {
    branches: (branchRows as any[])[0]?.cnt || 0,
    staff: (staffRows as any[])[0]?.cnt || 0,
    products: (productRows as any[])[0]?.cnt || 0,
    resources: (resourceRows as any[])[0]?.cnt || 0,
    tournaments: (tournamentRows as any[])[0]?.cnt || 0,
    academies: (academyRows as any[])[0]?.cnt || 0,
  };
}

export async function getAvailablePlansForOrg(orgId: number) {
  const pool = getPool();
  const [typeRows] = await pool.execute<RowData>(
    `SELECT ot.id, ot.slug FROM organisations o
     JOIN organisation_types ot ON ot.id = o.org_type_id
     WHERE o.id = ? AND o.deleted_at IS NULL`,
    [orgId],
  );
  if (!typeRows.length) return [];
  const orgTypeId = (typeRows[0] as any).id;

  const [plans] = await pool.execute<RowData>(
    `SELECT sp.* FROM subscription_plans sp
     WHERE sp.is_active = TRUE AND sp.is_internal = FALSE
     ORDER BY COALESCE(sp.price_monthly, sp.price_yearly, 0) ASC`,
  );

  return plans;
}

export async function createUpgradeRequest(data: {
  organisationId: number;
  requestedBy: number;
  requestedPlanId: number;
  notes?: string;
}) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO organisation_upgrade_requests
     (organisation_id, requested_by, requested_plan_id, registration_type, status, notes)
     VALUES (?, ?, ?, 'upgrade', 'pending', ?)`,
    [data.organisationId, data.requestedBy, data.requestedPlanId, data.notes || null],
  );
  return (result as any).insertId;
}

export async function getOrgPendingUpgradeRequest(orgId: number) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT our.*, sp.plan_name
     FROM organisation_upgrade_requests our
     LEFT JOIN subscription_plans sp ON sp.id = our.requested_plan_id
     WHERE our.organisation_id = ? AND our.registration_type = 'upgrade' AND our.status = 'pending'
     ORDER BY our.created_at DESC
     LIMIT 1`,
    [orgId],
  );
  return rows[0] || null;
}

export async function listSubscriptionUpgradeRequests(filters?: { status?: string; page?: number; limit?: number }) {
  const pool = getPool();
  const conditions: string[] = ["our.registration_type = 'upgrade'"];
  const params: any[] = [];
  if (filters?.status && filters.status !== 'all') {
    conditions.push('our.status = ?');
    params.push(filters.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pag = buildPagination(filters?.page, filters?.limit);

  const [countRows] = await pool.execute<RowData>(`SELECT COUNT(*) as total FROM organisation_upgrade_requests our ${where}`, params);
  const total = (countRows[0] as any).total;

  const [rows] = await pool.execute<RowData>(
    `SELECT our.*, o.name as org_name, u.full_name as requester_name, u.email as requester_email,
            sp.plan_name
     FROM organisation_upgrade_requests our
     JOIN organisations o ON o.id = our.organisation_id
     JOIN users u ON u.id = our.requested_by
     LEFT JOIN subscription_plans sp ON sp.id = our.requested_plan_id
     ${where}
     ORDER BY our.created_at DESC${paginationClause(pag)}`,
    params,
  );
  return { rows, total, page: pag.page, limit: pag.limit };
}

export async function approveSubscriptionUpgrade(requestId: number, adminId: number) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [reqRows] = await conn.execute<RowData>(
      'SELECT * FROM organisation_upgrade_requests WHERE id = ? AND status = \'pending\' FOR UPDATE',
      [requestId],
    );
    if (!reqRows.length) throw new ValidationError('Upgrade request not found or already processed');
    const req = reqRows[0] as any;

    await conn.execute(
      'UPDATE organisation_upgrade_requests SET status = \'approved\', approved_by = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ?',
      [adminId, requestId],
    );

    if (req.requested_plan_id) {
      const [existing] = await conn.execute<RowData>(
        'SELECT id FROM organisation_subscriptions WHERE organisation_id = ? AND subscription_status IN (\'pending\', \'active\') LIMIT 1',
        [req.organisation_id],
      );
      if (existing.length) {
        await conn.execute(
          'UPDATE organisation_subscriptions SET plan_id = ?, subscription_status = \'active\', start_date = NOW(), end_date = NULL, updated_at = NOW() WHERE id = ?',
          [req.requested_plan_id, (existing[0] as any).id],
        );
      } else {
        await conn.execute(
          `INSERT INTO organisation_subscriptions (organisation_id, plan_id, subscription_status, start_date, billing_cycle, auto_renew)
           VALUES (?, ?, 'active', NOW(), 'monthly', TRUE)`,
          [req.organisation_id, req.requested_plan_id],
        );
      }
    }

    await conn.commit();
    return req;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function rejectSubscriptionUpgrade(requestId: number, adminId: number, reason: string) {
  const pool = getPool();
  const [reqRows] = await pool.execute<RowData>(
    'SELECT * FROM organisation_upgrade_requests WHERE id = ? AND status = \'pending\'',
    [requestId],
  );
  if (!reqRows.length) throw new ValidationError('Upgrade request not found or already processed');

  const existingNotes = (reqRows[0] as any).notes || '';
  const newNotes = existingNotes
    ? `${existingNotes}\nRejection: ${reason}`
    : `Rejection: ${reason}`;

  await pool.execute(
    'UPDATE organisation_upgrade_requests SET status = \'rejected\', approved_by = ?, notes = ?, updated_at = NOW() WHERE id = ?',
    [adminId, newNotes, requestId],
  );
  return reqRows[0];
}

export async function getOrgProducts(orgId: number, page = 1, limit = 20, sportId?: number, status?: string, branchId?: number) {
  const pool = getPool();
  const pag = buildPagination(page, limit);
  const conditions = ['seller_id = ?', 'deleted_at IS NULL'];
  const params: any[] = [orgId];
  if (sportId) { conditions.push('sport_id = ?'); params.push(sportId); }
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (branchId) { conditions.push('branch_id = ?'); params.push(branchId); }
  const where = conditions.join(' AND ');
  const [rows] = await pool.execute<RowData>(
    `SELECT p.*, pc.name as category_name
     FROM products p
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     WHERE p.${conditions.join(' AND p.')}
     ORDER BY p.created_at DESC${paginationClause(pag)}`,
    params,
  );
  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) as total FROM products WHERE ${where}`,
    params
  );
  return { data: rows, total: countRows[0]?.total || 0, page: pag.page, limit: pag.limit };
}

export async function getOrgTransactions(orgId: number, page = 1, limit = 20) {
  const pool = getPool();
  const pag = buildPagination(page, limit);
  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) as total FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     WHERE t.id IN (
       SELECT DISTINCT transaction_id FROM transaction_entries WHERE organisation_id = ?
     )`,
    [orgId]
  );
  const total = (countRows[0] as any)?.total || 0;
  const [rows] = await pool.execute<RowData>(
    `SELECT te.*, t.type as txn_type, t.status as txn_status, t.created_at as txn_created_at,
            t.source_type, t.source_id,
            b.name as branch_name, o.payment_method
     FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     LEFT JOIN branches b ON b.id = te.branch_id
     LEFT JOIN orders o ON t.source_type = 'marketplace' AND t.source_id = o.id
     WHERE t.id IN (
       SELECT DISTINCT transaction_id FROM transaction_entries WHERE organisation_id = ?
     )
     ORDER BY t.created_at DESC, te.id${paginationClause(pag)}`,
    [orgId],
  );
  return { data: rows, total, page: pag.page, limit: pag.limit };
}

export async function getOrgSettlements(orgId: number, page = 1, limit = 20) {
  const pool = getPool();
  const pag = buildPagination(page, limit);
  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) as total FROM settlements WHERE organisation_id = ?`,
    [orgId]
  );
  const total = (countRows[0] as any)?.total || 0;
  const [rows] = await pool.execute<RowData>(
    `SELECT s.*, COUNT(so.id) as item_count
     FROM settlements s
     LEFT JOIN settlement_orders so ON so.settlement_id = s.id
     WHERE s.organisation_id = ?
     GROUP BY s.id
     ORDER BY s.requested_at DESC${paginationClause(pag)}`,
    [orgId],
  );
  return { data: rows, total, page: pag.page, limit: pag.limit };
}

export async function getOrgSettlementDetail(orgId: number, settlementId: number) {
  const pool = getPool();
  const [settlementRows] = await pool.execute<RowData>(
    `SELECT s.*, COUNT(so.id) as item_count, o.name as organisation_name
     FROM settlements s
     JOIN organisations o ON o.id = s.organisation_id
     LEFT JOIN settlement_orders so ON so.settlement_id = s.id
     WHERE s.id = ? AND s.organisation_id = ?
     GROUP BY s.id`,
    [settlementId, orgId]
  );
  if (!settlementRows.length) return null;
  const settlement = settlementRows[0] as any;

  const [items] = await pool.execute<RowData>(
    `SELECT so.id, so.settlement_id, so.order_id,
            so.products_price, so.shipping_price, so.gross_amount,
            so.courtzon_fee, so.organization_net, so.payment_method,
            o.public_id as order_public_id, o.status as order_status,
            o.created_at as order_date
     FROM settlement_orders so
     JOIN orders o ON o.id = so.order_id
     WHERE so.settlement_id = ?
     ORDER BY so.id`,
    [settlementId]
  );

  return { ...settlement, items };
}
