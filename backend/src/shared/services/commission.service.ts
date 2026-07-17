import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { getEffectivePlanConfig, clearPlanCache } from '../utils/plan-resolver.js';
import { commissionEntityLookupKeys } from './commission-entities.js';
import { createModuleLogger } from '../utils/logger.js';

const log = createModuleLogger('commission');
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
    log.info({ branchOrOrgId, resolvedOrgId: orgId }, 'CommissionService.getOrgPlanId — resolved orgId');

    const config = await getEffectivePlanConfig(orgId);
    if (!config) {
      log.warn({ orgId }, 'CommissionService.getOrgPlanId — no active plan found');
      return null;
    }
    return config.planId;
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
    clearPlanCache();
    const orgId = await this.resolveOrgId(branchOrOrgId);
    const config = await getEffectivePlanConfig(orgId);

    if (!config) {
      throw new Error('Organisation has no active subscription plan');
    }

    // Resolve commission rate from the effective plan config (snapshot or live)
    const lookupKeys = commissionEntityLookupKeys(entityType);
    let rate = 0;
    let rateType: 'percentage' | 'fixed' = 'percentage';

    // First check snapshot rates
    for (const key of lookupKeys) {
      const cr = config.commissionRates.find(r => r.entity === key);
      if (cr) {
        rate = cr.amount;
        rateType = cr.rateType;
        break;
      }
    }

    // Fallback: live subscription_plan_rates (for legacy plans without snapshot rates)
    if (rate === 0 && !config.fromSnapshot) {
      const placeholders = lookupKeys.map(() => '?').join(', ');
      const [rows] = await this.pool.execute<RowData>(
        `SELECT amount, rate_type FROM subscription_plan_rates
         WHERE plan_id = ? AND applicable_entity IN (${placeholders})
         LIMIT 1`,
        [config.planId, ...lookupKeys]
      );
      if (rows.length) {
        rate = Number(rows[0].amount);
        rateType = rows[0].rate_type;
      }
    }

    if (rate === 0 && !config.isUnlimited) {
      throw new Error(`No commission rate configured for plan ${config.planId} / entity "${entityType}"`);
    }

    const commissionAmount = rateType === 'percentage'
      ? (grossAmount * rate) / 100
      : rate;
    const netAmount = grossAmount - commissionAmount;

    return {
      rate,
      rateType,
      commissionAmount,
      netAmount,
      planName: config.planName,
      planId: config.planId,
    };
  }
}

export const commissionService = new CommissionService();
