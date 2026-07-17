/**
 * CurrentSubscriptionResolver — Canonical subscription resolution.
 *
 * Every consumer in the system must use this resolver to obtain the
 * current subscription for an organisation. No screen should build
 * its own subscription model or perform custom mapping.
 *
 * Resolution:
 *   1. Find the subscription row (nonExpiredSubscriptionCondition)
 *   2. Resolve plan data: plan_snapshot → live subscription_plans
 *   3. Return a complete CurrentSubscription DTO
 *
 * All states are resolved centrally:
 *   - No subscription
 *   - Pending subscription (subscription_status = 'pending')
 *   - Active subscription
 *   - Expired
 *   - Manual assignment (source tracking)
 */

import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { nonExpiredSubscriptionCondition } from './subscription-validator.js';

type RowData = mysql.RowDataPacket[];

// ── Canonical DTO ─────────────────────────────────────────────

export interface CurrentSubscription {
  subscriptionId: number;
  planId: number | null;
  planName: string;
  planSnapshot: Record<string, any> | null;
  subscriptionStatus: string;
  billingCycle: string;
  startDate: string | null;
  endDate: string | null;
  isExpired: boolean;
  isInternal: boolean;
  autoRenew: boolean;
  /** Resolved features (from snapshot or live) */
  features: CurrentSubscriptionFeature[];
  /** Resolved commission rates (from snapshot or live) */
  commissionRates: CurrentSubscriptionCommissionRate[];
  /** True if data came from plan_snapshot */
  fromSnapshot: boolean;
  /** Whether this subscription exists at all */
  exists: boolean;
}

export interface CurrentSubscriptionFeature {
  featureKey: string;
  label: string;
  value: string;
  valueType: string;
}

export interface CurrentSubscriptionCommissionRate {
  entity: string;
  amount: number;
  rateType: 'percentage' | 'fixed';
}

// ── Cache (per-request) ─────────────────────────────────────

const cache = new Map<number, CurrentSubscription>();

export function clearSubscriptionCache(): void {
  cache.clear();
}

// ── Resolver ─────────────────────────────────────────────────

export async function getCurrentSubscription(orgId: number, conn?: mysql.PoolConnection): Promise<CurrentSubscription> {
  if (cache.has(orgId)) return cache.get(orgId)!;

  const db = conn ?? getPool();
  const [rows] = await db.execute<RowData>(
    `SELECT os.*
     FROM organisation_subscriptions os
     WHERE os.organisation_id = ? AND ${nonExpiredSubscriptionCondition('os')}
     ORDER BY os.created_at DESC
     LIMIT 1`,
    [orgId],
  );

  if (!rows.length) {
    const empty: CurrentSubscription = {
      subscriptionId: 0, planId: null, planName: 'No Subscription',
      planSnapshot: null, subscriptionStatus: 'none', billingCycle: 'monthly',
      startDate: null, endDate: null, isExpired: false, isInternal: false,
      autoRenew: false, features: [], commissionRates: [],
      fromSnapshot: false, exists: false,
    };
    cache.set(orgId, empty);
    return empty;
  }

  const sub = rows[0] as any;
  const now = new Date();
  const endDate = sub.end_date ? new Date(sub.end_date) : null;
  const isExpired = endDate ? endDate < now : false;

  // Default: live plan data
  let planName = 'Unknown';
  let isInternal = false;
  let features: CurrentSubscriptionFeature[] = [];
  let commissionRates: CurrentSubscriptionCommissionRate[] = [];
  let fromSnapshot = false;

  // Try snapshot first
  if (sub.plan_snapshot) {
    try {
      const snap = typeof sub.plan_snapshot === 'string' ? JSON.parse(sub.plan_snapshot) : sub.plan_snapshot;
      planName = snap.planName || 'Unknown';
      isInternal = !!snap.isInternal;
      features = Array.isArray(snap.features) ? snap.features.map((f: any) => ({
        featureKey: f.feature_key || f.featureKey || '',
        label: f.label || '',
        value: String(f.value ?? ''),
        valueType: f.value_type || f.valueType || 'text',
      })) : [];
      commissionRates = Array.isArray(snap.commissionRates) ? snap.commissionRates.map((r: any) => ({
        entity: r.entity || r.applicable_entity || '',
        amount: Number(r.amount ?? 0),
        rateType: r.rateType || r.rate_type || 'percentage',
      })) : [];
      fromSnapshot = true;
    } catch {
      // Malformed snapshot — fall through to live
    }
  }

  // Fallback: live plan tables
  if (!fromSnapshot && sub.plan_id) {
    const [planRows] = await db.execute<RowData>(
      `SELECT sp.plan_name, sp.is_internal FROM subscription_plans sp WHERE sp.id = ?`,
      [sub.plan_id],
    );
    if (planRows.length) {
      planName = planRows[0].plan_name || 'Unknown';
      isInternal = !!planRows[0].is_internal;
    }

    const [featRows] = await db.execute<RowData>(
      `SELECT sf.feature_key, sf.label, spf.value, sf.value_type
       FROM subscription_plan_features spf
       JOIN subscription_features sf ON sf.id = spf.feature_id
       WHERE spf.plan_id = ?
       ORDER BY sf.sort_order ASC`,
      [sub.plan_id],
    );
    features = featRows.map((f: any) => ({
      featureKey: f.feature_key,
      label: f.label,
      value: String(f.value ?? ''),
      valueType: f.value_type,
    }));

    const [rateRows] = await db.execute<RowData>(
      `SELECT applicable_entity, amount, rate_type FROM subscription_plan_rates WHERE plan_id = ?`,
      [sub.plan_id],
    );
    commissionRates = rateRows.map((r: any) => ({
      entity: r.applicable_entity,
      amount: Number(r.amount),
      rateType: r.rate_type,
    }));
  }

  const result: CurrentSubscription = {
    subscriptionId: sub.id,
    planId: sub.plan_id,
    planName,
    planSnapshot: sub.plan_snapshot ? (typeof sub.plan_snapshot === 'string' ? JSON.parse(sub.plan_snapshot) : sub.plan_snapshot) : null,
    subscriptionStatus: sub.subscription_status,
    billingCycle: sub.billing_cycle || 'monthly',
    startDate: sub.start_date ? new Date(sub.start_date).toISOString() : null,
    endDate: sub.end_date ? new Date(sub.end_date).toISOString() : null,
    isExpired,
    isInternal,
    autoRenew: !!sub.auto_renew,
    features,
    commissionRates,
    fromSnapshot,
    exists: true,
  };

  cache.set(orgId, result);
  return result;
}

/**
 * Get a single numeric feature value. Returns defaultValue if:
 *  - no active subscription exists
 *  - the feature is not found on the plan
 *  - the value is not a valid number
 */
export async function getFeatureLimit(orgId: number, featureKey: string, defaultValue: number): Promise<number> {
  const sub = await getCurrentSubscription(orgId);
  if (!sub.exists) return defaultValue;

  const feature = sub.features.find(f => f.featureKey === featureKey);
  if (!feature) return defaultValue;

  const val = feature.value.trim().toLowerCase();
  if (val === 'unlimited' || val === '-1') return Infinity;

  const n = parseInt(val, 10);
  return isNaN(n) ? defaultValue : n;
}

/**
 * Get a commission rate for a specific entity type. Returns null if not configured.
 */
export async function getCommissionRate(orgId: number, entityType: string): Promise<{ rate: number; rateType: 'percentage' | 'fixed' } | null> {
  const sub = await getCurrentSubscription(orgId);
  if (!sub.exists) return null;

  const lookupKeys = buildLookupKeys(entityType);
  for (const key of lookupKeys) {
    const rate = sub.commissionRates.find(r => r.entity === key);
    if (rate) return { rate: rate.amount, rateType: rate.rateType };
  }
  return null;
}

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
