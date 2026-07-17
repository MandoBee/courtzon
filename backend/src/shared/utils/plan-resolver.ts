/**
 * Centralized Plan Snapshot Resolver.
 *
 * Every runtime access to subscription plan data must go through this module.
 *
 * Resolution order:
 *   1. If organisation_subscriptions.plan_snapshot IS NOT NULL → use snapshot JSON
 *   2. Otherwise → fall back to live subscription_plans tables (legacy compatibility)
 *
 * This ensures that editing a subscription plan never affects existing subscribers
 * who purchased under a previous version of the plan.
 */

import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { activeSubscriptionCondition } from './subscription-validator.js';

type RowData = mysql.RowDataPacket[];

// ── Types ─────────────────────────────────────────────────────────────

export interface ResolvedPlanConfig {
  planId: number;
  planName: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  isUnlimited: boolean;
  billingCycle: string;
  features: ResolvedFeature[];
  commissionRates: ResolvedCommissionRate[];
  /** true if data came from plan_snapshot, false if from live tables */
  fromSnapshot: boolean;
}

export interface ResolvedFeature {
  featureKey: string;
  label: string;
  value: string;
  valueType: string;
}

export interface ResolvedCommissionRate {
  entity: string;
  amount: number;
  rateType: 'percentage' | 'fixed';
}

// ── Resolver ──────────────────────────────────────────────────────────

let snapshotCache = new Map<number, ResolvedPlanConfig>();

export function clearPlanCache(): void {
  snapshotCache = new Map<number, ResolvedPlanConfig>();
}

/**
 * Fetch the effective plan configuration for an organisation.
 * Uses plan_snapshot if available, otherwise fallback to live tables.
 * Results are cached per request (call clearPlanCache() at request boundaries).
 */
export async function getEffectivePlanConfig(orgId: number, conn?: mysql.PoolConnection): Promise<ResolvedPlanConfig | null> {
  if (snapshotCache.has(orgId)) return snapshotCache.get(orgId)!;

  const db = conn ?? getPool();
  const [rows] = await db.execute<RowData>(
    `SELECT os.id, os.plan_id, os.plan_snapshot, os.billing_cycle,
            os.subscription_status, os.end_date
     FROM organisation_subscriptions os
     WHERE os.organisation_id = ? AND ${activeSubscriptionCondition('os')}
     ORDER BY os.created_at DESC
     LIMIT 1`,
    [orgId],
  );
  if (!rows.length) return null;

  const row = rows[0] as any;

  // ── Prefer snapshot ────────────────────────────────────────────
  if (row.plan_snapshot) {
    try {
      const snap = typeof row.plan_snapshot === 'string'
        ? JSON.parse(row.plan_snapshot)
        : row.plan_snapshot;

      const config: ResolvedPlanConfig = {
        planId: row.plan_id,
        planName: snap.planName || 'Unknown',
        priceMonthly: snap.priceMonthly ?? null,
        priceYearly: snap.priceYearly ?? null,
        isUnlimited: !!snap.isUnlimited,
        billingCycle: snap.billingCycle || row.billing_cycle || 'monthly',
        features: Array.isArray(snap.features) ? snap.features.map((f: any) => ({
          featureKey: f.feature_key || f.featureKey || '',
          label: f.label || '',
          value: String(f.value ?? ''),
          valueType: f.value_type || f.valueType || 'text',
        })) : [],
        commissionRates: Array.isArray(snap.commissionRates) ? snap.commissionRates.map((r: any) => ({
          entity: r.entity || r.applicable_entity || '',
          amount: Number(r.amount ?? 0),
          rateType: r.rateType || r.rate_type || 'percentage',
        })) : [],
        fromSnapshot: true,
      };
      snapshotCache.set(orgId, config);
      return config;
    } catch {
      // Malformed snapshot — fall through to live tables
    }
  }

  // ── Fallback: live tables (legacy subscriptions without snapshot) ──
  const [planRows] = await db.execute<RowData>(
    `SELECT sp.id, sp.plan_name, sp.price_monthly, sp.price_yearly, sp.is_unlimited
     FROM subscription_plans sp
     WHERE sp.id = ?`,
    [row.plan_id],
  );
  if (!planRows.length) return null;

  const plan = planRows[0] as any;

  // Load features from live tables
  const [featRows] = await db.execute<RowData>(
    `SELECT sf.feature_key, sf.label, spf.value, sf.value_type
     FROM subscription_plan_features spf
     JOIN subscription_features sf ON sf.id = spf.feature_id
     WHERE spf.plan_id = ?
     ORDER BY sf.sort_order ASC`,
    [row.plan_id],
  );

  // Load commission rates from live tables
  const [rateRows] = await db.execute<RowData>(
    `SELECT applicable_entity, amount, rate_type FROM subscription_plan_rates WHERE plan_id = ?`,
    [row.plan_id],
  );

  const config: ResolvedPlanConfig = {
    planId: row.plan_id,
    planName: plan.plan_name || 'Unknown',
    priceMonthly: plan.price_monthly ? Number(plan.price_monthly) : null,
    priceYearly: plan.price_yearly ? Number(plan.price_yearly) : null,
    isUnlimited: !!plan.is_unlimited,
    billingCycle: row.billing_cycle || 'monthly',
    features: featRows.map((f: any) => ({
      featureKey: f.feature_key,
      label: f.label,
      value: String(f.value ?? ''),
      valueType: f.value_type,
    })),
    commissionRates: rateRows.map((r: any) => ({
      entity: r.applicable_entity,
      amount: Number(r.amount),
      rateType: r.rate_type,
    })),
    fromSnapshot: false,
  };
  snapshotCache.set(orgId, config);
  return config;
}

/**
 * Get a single feature value for an organisation from the effective plan config.
 * Returns defaultValue if the feature is not found or the org has no active plan.
 */
export async function getEffectiveFeatureValue(
  orgId: number,
  featureKey: string,
  defaultValue: number,
  conn?: mysql.PoolConnection,
): Promise<number> {
  const config = await getEffectivePlanConfig(orgId, conn);
  if (!config) return defaultValue;

  const feature = config.features.find(f => f.featureKey === featureKey);
  if (!feature) return defaultValue;

  const val = feature.value.trim().toLowerCase();
  if (val === 'unlimited' || val === '-1') return Infinity;

  const n = parseInt(val, 10);
  return isNaN(n) ? defaultValue : n;
}

/**
 * Get the commission rate for a specific entity type from the effective plan config.
 * Returns null if no rate is configured.
 */
export async function getEffectiveCommissionRate(
  orgId: number,
  entityType: string,
  conn?: mysql.PoolConnection,
): Promise<{ rate: number; rateType: 'percentage' | 'fixed' } | null> {
  const config = await getEffectivePlanConfig(orgId, conn);
  if (!config) return null;

  const lookupKeys = buildLookupKeys(entityType);
  for (const key of lookupKeys) {
    const rate = config.commissionRates.find(r => r.entity === key);
    if (rate) return { rate: rate.amount, rateType: rate.rateType };
  }
  return null;
}

/**
 * Get the plan name for display purposes (uses snapshot if available).
 */
export async function getEffectivePlanName(orgId: number, conn?: mysql.PoolConnection): Promise<string | null> {
  const config = await getEffectivePlanConfig(orgId, conn);
  return config?.planName ?? null;
}

/**
 * Resolve whether an organisation has a paid plan (price > 0 for either billing cycle).
 */
export async function hasPaidPlan(orgId: number, conn?: mysql.PoolConnection): Promise<boolean> {
  const config = await getEffectivePlanConfig(orgId, conn);
  if (!config) return false;
  if (config.isUnlimited) return false;
  return (config.priceMonthly ?? 0) > 0 || (config.priceYearly ?? 0) > 0;
}

// ── Helper: mirrors commission-entities.ts lookup logic ──
function buildLookupKeys(entityType: string): string[] {
  const map: Record<string, string[]> = {
    booking: ['booking', 'court_booking'],
    tournament: ['tournament', 'tournaments'],
    coach_session: ['coach_session', 'coaching'],
    marketplace: ['marketplace', 'product'],
    membership: ['membership', 'club_membership'],
  };
  return map[entityType] || [entityType];
}
