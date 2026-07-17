import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { getCurrentSubscription, clearSubscriptionCache, getCommissionRate } from '../utils/current-subscription.resolver.js';
import { commissionEntityLookupKeys } from './commission-entities.js';
import { ConflictError } from '../errors/app-error.js';
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

    const sub = await getCurrentSubscription(orgId);
    if (!sub.exists) {
      log.warn({ orgId }, 'CommissionService.getOrgPlanId — no active plan found');
      return null;
    }
    return sub.planId;
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
      throw new ConflictError(`No commission rate configured for plan ${planId} / entity "${entityType}"`);
    }

    throw new ConflictError('Organisation has no active subscription plan');
  }

  async calculate(
    branchOrOrgId: number,
    entityType: string,
    grossAmount: number
  ): Promise<CommissionResult> {
    clearSubscriptionCache();
    const orgId = await this.resolveOrgId(branchOrOrgId);
    const sub = await getCurrentSubscription(orgId);

    if (!sub.exists) {
      throw new ConflictError('Organisation has no active subscription plan');
    }

    const commRate = await getCommissionRate(orgId, entityType);
    let rate = commRate?.rate ?? 0;
    let rateType = commRate?.rateType ?? 'percentage';

    // If snapshot didn't have rates, fall back to live subscription_plan_rates
    if (rate === 0 && !sub.fromSnapshot && sub.planId) {
      const lookupKeys = commissionEntityLookupKeys(entityType);
      const placeholders = lookupKeys.map(() => '?').join(', ');
      const [rows] = await this.pool.execute<RowData>(
        `SELECT amount, rate_type FROM subscription_plan_rates
         WHERE plan_id = ? AND applicable_entity IN (${placeholders})
         LIMIT 1`,
        [sub.planId, ...lookupKeys]
      );
      if (rows.length) {
        rate = Number(rows[0].amount);
        rateType = rows[0].rate_type;
      }
    }

    if (rate === 0) {
      throw new ConflictError(`No commission rate configured for plan ${sub.planId} / entity "${entityType}"`);
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
      planName: sub.planName,
      planId: sub.planId || 0,
    };
  }
}

export const commissionService = new CommissionService();
