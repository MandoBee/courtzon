import { getPool } from '../../../database/mysql.js';
import { rbacRepository } from '../../rbac/infrastructure/repositories/rbac.repository.js';
import {
  NotFoundError,
} from '../../../shared/errors/app-error.js';
import { buildPagination, paginationClause } from '../../../shared/utils/pagination.js';
import { eventBus } from '../../../shared/event-bus/index.js';

type RowData = import('mysql2').RowDataPacket[];

export class ApprovalService {
  async listPendingRegistrations(filters: { status?: string; type?: string; page: number; limit: number }) {
    const pool = getPool();
    const where: string[] = [];
    const params: any[] = [];

    if (filters.status && filters.status !== 'all') {
      where.push('r.status = ?');
      params.push(filters.status);
    }

    if (filters.type && filters.type !== 'all') {
      where.push('r.registration_type = ?');
      params.push(filters.type);
    }

    if (where.length === 0) where.push('1 = 1');

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) as total FROM organisation_upgrade_requests r WHERE ${where.join(' AND ')}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.execute<RowData>(
      `SELECT r.*,
              o.name as org_name, o.slug as org_slug, o.org_type_id, o.phone as org_phone,
              ot.name as org_type_name, ot.slug as org_type_slug,
              u.full_name as requester_name, u.email as requester_email, u.phone_number as requester_phone,
              sp.plan_name, r.chosen_payment_method as payment_method
       FROM organisation_upgrade_requests r
       JOIN organisations o ON o.id = r.organisation_id
       LEFT JOIN organisation_types ot ON ot.id = o.org_type_id
       JOIN users u ON u.id = r.requested_by
       LEFT JOIN subscription_plans sp ON sp.id = r.requested_plan_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows, total, page: filters.page, limit: filters.limit };
  }

  async approveRegistration(adminUserId: number, requestId: number) {
    const pool = getPool();

    const [requests] = await pool.execute<RowData>(
      `SELECT * FROM organisation_upgrade_requests WHERE id = ? AND status = 'pending'`,
      [requestId]
    );
    const request = requests[0];
    if (!request) throw new NotFoundError('No pending registration request');

    const { organisation_id: orgId, registration_type: regType, requested_plan_id: planId } = request;

    // 1. Activate organisation
    await pool.execute(
      `UPDATE organisations SET is_verified = TRUE, is_active = TRUE WHERE id = ?`,
      [orgId]
    );

    // 2. Activate subscription (set dates only if null)
    if (planId) {
      // Set status, start_date, and end_date in one pass by joining plan
      await pool.execute(
        `UPDATE organisation_subscriptions os
         JOIN subscription_plans sp ON sp.id = os.plan_id
         SET os.subscription_status = 'active',
             os.start_date = COALESCE(os.start_date, CURDATE()),
             os.end_date = COALESCE(os.end_date,
               CASE
                 WHEN sp.is_unlimited = 1 THEN NULL
                 WHEN os.billing_cycle = 'yearly' THEN DATE_ADD(CURDATE(), INTERVAL 1 YEAR)
                 ELSE DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
               END
             )
         WHERE os.organisation_id = ?
         ORDER BY os.id DESC LIMIT 1`,
        [orgId]
      );
    } else {
      // Even without planId, activate subscription
      await pool.execute(
        `UPDATE organisation_subscriptions SET subscription_status = 'active'
         WHERE organisation_id = ? ORDER BY id DESC LIMIT 1`,
        [orgId]
      );
    }

    // 3. For player→seller upgrades: switch role + change org type
    if (regType === 'player' && planId) {
      const shopTypeId = await this.getOrgTypeId('shop');
      if (shopTypeId) {
        await pool.execute(`UPDATE organisations SET org_type_id = ? WHERE id = ?`, [shopTypeId, orgId]);
      }

      // Clone shop-admin role for this org and assign to owner
      const org = await this.getOrg(orgId);
      if (org) {
        const ownerId = org.owner_id;

        const templateRole = await rbacRepository.getTemplateRoleBySlug('shop-admin');
        if (templateRole) {
          const clonedRoleId = await rbacRepository.cloneRoleForOrg(templateRole.id, orgId);
          const userRoleId = await rbacRepository.assignRole(ownerId, clonedRoleId, ownerId);
          await rbacRepository.setUserRoleScope(userRoleId, [{ scopeType: 'organisation', scopeId: orgId }]);
        }
      }
    }

    // 4. Mark request as approved
    await pool.execute(
      `UPDATE organisation_upgrade_requests SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [adminUserId, requestId]
    );

    const [orgRows] = await pool.execute<RowData>('SELECT name FROM organisations WHERE id = ?', [orgId]);
    const orgName = (orgRows[0] as any)?.name || 'Organisation';
    eventBus.emit('organisation:approved', { organisationId: orgId, name: orgName, userId: adminUserId });

    return { success: true, orgId, registrationType: regType };
  }

  async rejectRegistration(adminUserId: number, requestId: number, reason?: string) {
    const pool = getPool();

    const [requests] = await pool.execute<RowData>(
      `SELECT * FROM organisation_upgrade_requests WHERE id = ? AND status = 'pending'`,
      [requestId]
    );
    const request = requests[0];
    if (!request) throw new NotFoundError('No pending registration request');

    await pool.execute(
      `UPDATE organisation_upgrade_requests SET status = 'rejected', approved_by = ?, approved_at = NOW(), notes = ? WHERE id = ?`,
      [adminUserId, reason || null, requestId]
    );

    eventBus.emit('organisation:rejected', {
      organisationId: request.organisation_id,
      reason,
    });

    return { success: true, orgId: request.organisation_id };
  }

  private async getOrgTypeId(slug: string): Promise<number | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM organisation_types WHERE slug = ? LIMIT 1`, [slug]
    );
    return rows[0]?.id || null;
  }

  private async getOrg(orgId: number): Promise<{ owner_id: number } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT owner_id FROM organisations WHERE id = ?`, [orgId]
    );
    return (rows as any[])[0] || null;
  }
}

export const approvalService = new ApprovalService();
