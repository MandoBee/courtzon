import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { commissionEntityLookupKeys } from './commission-entities.js';

type RowData = mysql.RowDataPacket[];

interface CommissionResult {
  rate: number;
  rateType: 'percentage' | 'fixed';
  commissionAmount: number;
  netAmount: number;
  planName: string;
  planId: number;
}

export class CommissionService {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  private async resolveOrgId(branchOrOrgId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT organisation_id FROM branches WHERE id = ? AND deleted_at IS NULL`,
      [branchOrOrgId]
    );
    return rows.length ? rows[0].organisation_id : branchOrOrgId;
  }

  async getOrgPlanId(branchOrOrgId: number): Promise<number | null> {
    const orgId = await this.resolveOrgId(branchOrOrgId);
    const [rows] = await this.pool.execute<RowData>(
      `SELECT plan_id FROM organisation_subscriptions
       WHERE organisation_id = ? AND subscription_status = 'active'
         AND (end_date IS NULL OR end_date >= CURDATE())
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId]
    );
    return rows.length ? rows[0].plan_id : null;
  }

  async getRate(planId: number | null, entityType: string): Promise<{ rate: number; rateType: 'percentage' | 'fixed' }> {
    const lookupKeys = commissionEntityLookupKeys(entityType);

    if (planId) {
      const placeholders = lookupKeys.map(() => '?').join(', ');
      const [rows] = await this.pool.execute<RowData>(
        `SELECT amount, rate_type FROM subscription_plan_rates
         WHERE plan_id = ? AND applicable_entity IN (${placeholders})
         LIMIT 1`,
        [planId, ...lookupKeys]
      );
      if (rows.length) {
        return { rate: Number(rows[0].amount), rateType: rows[0].rate_type };
      }
      throw new Error(`No commission rate configured for plan ${planId} / entity "${entityType}"`);
    }

    throw new Error('Organisation has no active subscription plan');
  }

  async calculate(
    branchOrOrgId: number,
    entityType: string,
    grossAmount: number
  ): Promise<CommissionResult> {
    const planId = await this.getOrgPlanId(branchOrOrgId);
    const { rate, rateType } = await this.getRate(planId, entityType);
    const commissionAmount = rateType === 'percentage'
      ? (grossAmount * rate) / 100
      : rate;
    const netAmount = grossAmount - commissionAmount;

    let planName = 'Default';
    if (planId) {
      const [rows] = await this.pool.execute<RowData>(
        'SELECT plan_name FROM subscription_plans WHERE id = ?',
        [planId]
      );
      if (rows.length) planName = rows[0].plan_name;
    }

    return {
      rate,
      rateType,
      commissionAmount,
      netAmount,
      planName,
      planId: planId || 0,
    };
  }
}

export const commissionService = new CommissionService();
