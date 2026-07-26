import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { recordAudit } from '../../audit-log/index.js';
import type { UserMembershipAttributes, MembershipPlanAttributes, MembershipHistoryAttributes } from '../domain/membership.types.js';

type RowData = import('mysql2').RowDataPacket[];

class UserMembershipService {
  async assign(userId: number, planId: number, startDate: string, renewalType: 'auto' | 'manual' | 'none'): Promise<number> {
    const pool = getPool();

    const [plans] = await pool.execute<RowData>(
      `SELECT * FROM membership_plans WHERE id = ? AND status = 'active'`,
      [planId],
    );
    if (!plans.length) throw new NotFoundError('Membership plan', ErrorCodes.MEMBERSHIP_NOT_FOUND);
    const plan = plans[0] as MembershipPlanAttributes;

    const [existing] = await pool.execute<RowData>(
      `SELECT id FROM user_memberships WHERE user_id = ? AND status IN ('active', 'frozen') LIMIT 1`,
      [userId],
    );
    if (existing.length) throw new ConflictError('User already has an active or frozen membership', ErrorCodes.VALIDATION_INVALID_VALUE);

    const endDate = this.calculateEndDate(startDate, plan.duration_type, plan.duration_value);

    const [result] = await pool.execute(
      `INSERT INTO user_memberships (user_id, membership_plan_id, status, start_date, end_date, renewal_type)
       VALUES (?, ?, 'active', ?, ?, ?)`,
      [userId, planId, startDate, endDate, renewalType],
    );
    const membershipId = (result as any).insertId;

    await pool.execute(
      `INSERT INTO membership_history (user_membership_id, action, old_status, new_status, created_by)
       VALUES (?, 'assigned', NULL, 'active', ?)`,
      [membershipId, userId],
    );

    recordAudit({
      actorId: userId,
      action: 'MEMBERSHIP.ASSIGN',
      entityType: 'user_membership',
      entityId: membershipId,
      afterState: { userId, planId, startDate, endDate, renewalType },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return membershipId;
  }

  async getUserMemberships(userId: number, filters?: { status?: string; page?: number; limit?: number }) {
    const pool = getPool();
    const where: string[] = ['um.user_id = ?'];
    const params: any[] = [userId];

    if (filters?.status) {
      where.push('um.status = ?');
      params.push(filters.status);
    }

    const [rows] = await pool.execute<RowData>(
      `SELECT um.*, mp.code AS plan_code, mp.name AS plan_name, mp.category AS plan_category
       FROM user_memberships um
       LEFT JOIN membership_plans mp ON mp.id = um.membership_plan_id
       WHERE ${where.join(' AND ')}
       ORDER BY um.created_at DESC`,
      params,
    );

    const total = rows.length;
    return { data: rows, total };
  }

  async getById(id: number): Promise<UserMembershipAttributes | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(`SELECT * FROM user_memberships WHERE id = ?`, [id]);
    return rows.length ? (rows[0] as UserMembershipAttributes) : null;
  }

  async freeze(id: number): Promise<void> {
    const pool = getPool();
    const membership = await this.getById(id);
    if (!membership) throw new NotFoundError('User membership', ErrorCodes.MEMBERSHIP_NOT_FOUND);
    if (membership.status !== 'active') throw new ConflictError('Only active memberships can be frozen', ErrorCodes.VALIDATION_INVALID_VALUE);

    await pool.execute(
      `UPDATE user_memberships SET status = 'frozen', frozen_at = NOW() WHERE id = ?`,
      [id],
    );
    await this.recordHistory(id, 'frozen', membership.status, 'frozen', membership.user_id);
  }

  async resume(id: number): Promise<void> {
    const pool = getPool();
    const membership = await this.getById(id);
    if (!membership) throw new NotFoundError('User membership', ErrorCodes.MEMBERSHIP_NOT_FOUND);
    if (membership.status !== 'frozen') throw new ConflictError('Only frozen memberships can be resumed', ErrorCodes.VALIDATION_INVALID_VALUE);

    await pool.execute(
      `UPDATE user_memberships SET status = 'active', frozen_at = NULL WHERE id = ?`,
      [id],
    );
    await this.recordHistory(id, 'resumed', 'frozen', 'active', membership.user_id);
  }

  async cancel(id: number): Promise<void> {
    const pool = getPool();
    const membership = await this.getById(id);
    if (!membership) throw new NotFoundError('User membership', ErrorCodes.MEMBERSHIP_NOT_FOUND);
    if (membership.status === 'cancelled') throw new ConflictError('Membership is already cancelled', ErrorCodes.VALIDATION_INVALID_VALUE);
    if (membership.status === 'expired') throw new ConflictError('Cannot cancel an expired membership', ErrorCodes.VALIDATION_INVALID_VALUE);

    await pool.execute(
      `UPDATE user_memberships SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?`,
      [id],
    );
    await this.recordHistory(id, 'cancelled', membership.status, 'cancelled', membership.user_id);
  }

  async expire(id: number): Promise<void> {
    const pool = getPool();
    const membership = await this.getById(id);
    if (!membership) throw new NotFoundError('User membership', ErrorCodes.MEMBERSHIP_NOT_FOUND);
    if (membership.status === 'expired') throw new ConflictError('Membership is already expired', ErrorCodes.VALIDATION_INVALID_VALUE);

    await pool.execute(
      `UPDATE user_memberships SET status = 'expired', expired_at = NOW() WHERE id = ?`,
      [id],
    );
    await this.recordHistory(id, 'expired', membership.status, 'expired', membership.user_id);
  }

  async renew(userMembershipId: number, planId?: number): Promise<void> {
    const pool = getPool();
    const membership = await this.getById(userMembershipId);
    if (!membership) throw new NotFoundError('User membership', ErrorCodes.MEMBERSHIP_NOT_FOUND);

    const targetPlanId = planId ?? membership.membership_plan_id;
    const [plans] = await pool.execute<RowData>(
      `SELECT * FROM membership_plans WHERE id = ? AND status = 'active'`,
      [targetPlanId],
    );
    if (!plans.length) throw new NotFoundError('Membership plan', ErrorCodes.MEMBERSHIP_NOT_FOUND);
    const plan = plans[0] as MembershipPlanAttributes;

    const startDate = new Date().toISOString().split('T')[0];
    const endDate = this.calculateEndDate(startDate, plan.duration_type, plan.duration_value);

    await pool.execute(
      `UPDATE user_memberships
       SET status = 'active', membership_plan_id = ?, start_date = ?, end_date = ?,
           renewal_type = 'auto', cancelled_at = NULL, expired_at = NULL, frozen_at = NULL
       WHERE id = ?`,
      [targetPlanId, startDate, endDate, userMembershipId],
    );

    const action = planId ? 'plan_changed' : 'renewed';
    await this.recordHistory(
      userMembershipId, action, membership.status, 'active',
      membership.user_id, `Renewed to plan #${targetPlanId}`,
    );
  }

  async getHistory(userMembershipId: number): Promise<MembershipHistoryAttributes[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM membership_history WHERE user_membership_id = ? ORDER BY created_at DESC`,
      [userMembershipId],
    );
    return rows as MembershipHistoryAttributes[];
  }

  private async recordHistory(
    userMembershipId: number, action: string,
    oldStatus: string | null, newStatus: string,
    createdBy: number, notes?: string,
  ): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO membership_history (user_membership_id, action, old_status, new_status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userMembershipId, action, oldStatus, newStatus, notes ?? null, createdBy],
    );
  }

  private calculateEndDate(startDate: string, durationType: string, durationValue: number): string | null {
    if (!durationValue) return null;
    const start = new Date(startDate);
    switch (durationType) {
      case 'day':
        return new Date(start.getTime() + durationValue * 86400000).toISOString().split('T')[0];
      case 'week':
        return new Date(start.getTime() + durationValue * 7 * 86400000).toISOString().split('T')[0];
      case 'month': {
        const d = new Date(start);
        d.setMonth(d.getMonth() + durationValue);
        return d.toISOString().split('T')[0];
      }
      case 'year': {
        const d = new Date(start);
        d.setFullYear(d.getFullYear() + durationValue);
        return d.toISOString().split('T')[0];
      }
      default:
        return null;
    }
  }
}

export const userMembershipService = new UserMembershipService();
