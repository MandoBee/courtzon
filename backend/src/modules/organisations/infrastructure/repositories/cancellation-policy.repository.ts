import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

type RowData = RowDataPacket[];

export class CancellationPolicyRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async findByOrg(orgId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT cp.*, org.cancellation_policy_level
       FROM cancellation_policies cp
       JOIN organisations org ON org.id = cp.organisation_id
       WHERE cp.organisation_id = ? AND cp.branch_id IS NULL
       ORDER BY cp.created_at DESC`,
      [orgId]
    );
    return rows;
  }

  async findByBranch(branchId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM cancellation_policies WHERE branch_id = ? ORDER BY created_at DESC',
      [branchId]
    );
    return rows;
  }

  async create(data: {
    organisationId?: number;
    branchId?: number;
    cancellationWindowMinutes: number;
    refundPercent: number;
  }): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO cancellation_policies (organisation_id, branch_id, cancellation_window_minutes, refund_percent)
       VALUES (?, ?, ?, ?)`,
      [data.organisationId || null, data.branchId || null, data.cancellationWindowMinutes, data.refundPercent]
    );
    return result.insertId;
  }

  async update(id: number, data: {
    cancellationWindowMinutes?: number;
    refundPercent?: number;
    isActive?: boolean;
  }): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    if (data.cancellationWindowMinutes !== undefined) { sets.push('cancellation_window_minutes = ?'); params.push(data.cancellationWindowMinutes); }
    if (data.refundPercent !== undefined) { sets.push('refund_percent = ?'); params.push(data.refundPercent); }
    if (data.isActive !== undefined) { sets.push('is_active = ?'); params.push(data.isActive); }
    if (sets.length === 0) return;
    params.push(id);
    await this.pool.execute(`UPDATE cancellation_policies SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  async delete(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM cancellation_policies WHERE id = ?', [id]);
  }

  async updateOrgPolicyLevel(orgId: number, level: 'organisation' | 'branch'): Promise<void> {
    await this.pool.execute(
      'UPDATE organisations SET cancellation_policy_level = ? WHERE id = ?',
      [level, orgId]
    );
  }

  async getOrgPolicySettings(orgId: number): Promise<any> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT cancellation_policy_level, cancellation_before_hours, cancellation_fee_percentage, cancellation_fee_fixed FROM organisations WHERE id = ?',
      [orgId]
    );
    return rows.length ? rows[0] : null;
  }

  async updateOrgPolicySettings(orgId: number, data: {
    cancellationBeforeHours?: number;
    cancellationFeePercentage?: number;
    cancellationFeeFixed?: number;
  }): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    if (data.cancellationBeforeHours !== undefined) { sets.push('cancellation_before_hours = ?'); params.push(data.cancellationBeforeHours); }
    if (data.cancellationFeePercentage !== undefined) { sets.push('cancellation_fee_percentage = ?'); params.push(data.cancellationFeePercentage); }
    if (data.cancellationFeeFixed !== undefined) { sets.push('cancellation_fee_fixed = ?'); params.push(data.cancellationFeeFixed); }
    if (sets.length === 0) return;
    params.push(orgId);
    await this.pool.execute(`UPDATE organisations SET ${sets.join(', ')} WHERE id = ?`, params);
  }
}

export const cancellationPolicyRepository = new CancellationPolicyRepository();
