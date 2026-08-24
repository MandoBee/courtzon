import { describe, it, expect, beforeEach, vi } from 'vitest';

// Avoid loading the real MySQL pool (which validates env and calls process.exit).
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: async () => [[], []] }),
}));

import {
  getCurrentSubscription,
  clearSubscriptionCache,
} from './current-subscription.service.js';

/**
 * Regression test for the "Unknown" plan-name bug.
 *
 * A subscription row whose plan_snapshot is a bare `{}` (no planName) — written
 * by suspend/resume or legacy paths — must still resolve its plan name from the
 * live subscription_plans table instead of returning 'Unknown', because plan_id
 * is a valid reference.
 */

interface SubRow {
  plan_snapshot: string | null;
  subscription_status?: string;
  end_date?: string | null;
}

function makeConn(subRow: SubRow, planName: string) {
  const execute = async (sql: string) => {
    if (sql.includes('FROM organisation_subscriptions')) {
      const sub = {
        id: 1,
        organisation_id: 6,
        plan_id: 9,
        billing_cycle: 'monthly',
        subscription_status: subRow.subscription_status || 'active',
        start_date: '2026-08-01',
        end_date: null,
        auto_renew: 1,
        plan_snapshot: subRow.plan_snapshot,
      };
      return [[sub], []];
    }
    if (sql.includes('FROM subscription_plans')) {
      return [[{ plan_name: planName, is_internal: 0 }], []];
    }
    if (sql.includes('FROM subscription_plan_features')) {
      return [[], []];
    }
    if (sql.includes('FROM subscription_plan_rates')) {
      return [[], []];
    }
    throw new Error(`Unexpected query in mock: ${sql}`);
  };
  return { execute } as any;
}

describe('getCurrentSubscription plan name resolution', () => {
  beforeEach(() => clearSubscriptionCache());

  it('resolves planName from live plan when snapshot has no planName ({} snapshot)', async () => {
    const sub = await getCurrentSubscription(6, makeConn({ plan_snapshot: '{}' }, 'Pro Seller'));
    expect(sub.exists).toBe(true);
    expect(sub.planId).toBe(9);
    expect(sub.planName).toBe('Pro Seller');
  });

  it('resolves planName from live plan when snapshot is malformed', async () => {
    const sub = await getCurrentSubscription(6, makeConn({ plan_snapshot: '{invalid json' }, 'Elite Shop'));
    expect(sub.planName).toBe('Elite Shop');
  });

  it('resolves planName from live plan when snapshot is null', async () => {
    const sub = await getCurrentSubscription(6, makeConn({ plan_snapshot: null }, 'Freemium Shop'));
    expect(sub.planName).toBe('Freemium Shop');
  });

  it('prefers snapshot planName when present', async () => {
    const snap = JSON.stringify({ planName: 'Snap Seller', isInternal: false, features: [], commissionRates: [] });
    const sub = await getCurrentSubscription(6, makeConn({ plan_snapshot: snap }, 'Ignored'));
    expect(sub.planName).toBe('Snap Seller');
  });

  it('reflects suspended status as effectiveStatus suspended (not active)', async () => {
    const sub = await getCurrentSubscription(6, makeConn({ plan_snapshot: null, subscription_status: 'suspended' }, 'Pro Seller'));
    expect(sub.effectiveStatus).toBe('suspended');
    expect(sub.subscriptionStatus).toBe('suspended');
  });

  it('reflects pending status as effectiveStatus pending (not suspended)', async () => {
    const sub = await getCurrentSubscription(6, makeConn({ plan_snapshot: null, subscription_status: 'pending' }, 'Pro Seller'));
    expect(sub.effectiveStatus).toBe('pending');
  });
});

/**
 * Regression tests for the invisible-expired-subscription bug.
 *
 * The resolver's validity gate made expired/cancelled rows unreachable, so
 * admin screens showed "no subscription" for orgs that had one. The
 * includeInactive option must expose those rows WITHOUT changing what
 * entitlement checks see.
 */
describe('getCurrentSubscription inactive-row visibility', () => {
  beforeEach(() => clearSubscriptionCache());

  // Mirrors nonExpiredSubscriptionCondition so the mock can decide whether a
  // row would survive the strict WHERE clause.
  function passesGate(row: SubRow): boolean {
    const allowed = ['active', 'pending', 'suspended'];
    if (!allowed.includes(row.subscription_status || 'active')) return false;
    if (!row.end_date) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(row.end_date) >= today;
  }

  // Mock that honours the gate: returns the row only when it survives the
  // nonExpiredSubscriptionCondition predicate present in strict queries.
  function makeGatedConn(subRow: SubRow | null) {
    const execute = async (sql: string) => {
      if (sql.includes('FROM organisation_subscriptions')) {
        const gated = sql.includes("IN ('active', 'pending', 'suspended')");
        if (!subRow || (gated && !passesGate(subRow))) return [[], []];
        const sub = {
          id: 1,
          organisation_id: 6,
          plan_id: 9,
          billing_cycle: 'monthly',
          subscription_status: subRow.subscription_status || 'active',
          start_date: '2026-06-01',
          end_date: subRow.end_date ?? null,
          auto_renew: 1,
          plan_snapshot: subRow.plan_snapshot,
        };
        return [[sub], []];
      }
      if (sql.includes('FROM subscription_plans')) {
        return [[{ plan_name: 'Standard Club', is_internal: 0 }], []];
      }
      if (sql.includes('FROM subscription_plan_features') || sql.includes('FROM subscription_plan_rates')) {
        return [[], []];
      }
      throw new Error(`Unexpected query in mock: ${sql}`);
    };
    return { execute } as any;
  }

  it('default mode keeps the validity gate: past-end active row is invisible', async () => {
    const conn = makeGatedConn({ plan_snapshot: null, end_date: '2020-01-01' });
    const sub = await getCurrentSubscription(6, conn);
    expect(sub.exists).toBe(false);
    expect(sub.effectiveStatus).toBe('none');
  });

  it('includeInactive surfaces a past-end-date row as effectiveStatus expired', async () => {
    const conn = makeGatedConn({ plan_snapshot: null, end_date: '2020-01-01' });
    const sub = await getCurrentSubscription(6, conn, { includeInactive: true });
    expect(sub.exists).toBe(true);
    expect(sub.effectiveStatus).toBe('expired');
    expect(sub.isExpired).toBe(true);
    expect(sub.planName).toBe('Standard Club');
  });

  it('includeInactive surfaces a cancelled row as effectiveStatus cancelled', async () => {
    const conn = makeGatedConn({ plan_snapshot: null, subscription_status: 'cancelled', end_date: '2099-01-01' });
    const sub = await getCurrentSubscription(6, conn, { includeInactive: true });
    expect(sub.exists).toBe(true);
    expect(sub.effectiveStatus).toBe('cancelled');
    expect(sub.isExpired).toBe(false);
  });

  it('includeInactive does not poison the entitlement cache for the same org', async () => {
    const conn = makeGatedConn({ plan_snapshot: null, end_date: '2020-01-01' });
    const visible = await getCurrentSubscription(6, conn, { includeInactive: true });
    expect(visible.exists).toBe(true);
    const entitled = await getCurrentSubscription(6, conn);
    expect(entitled.exists).toBe(false);
  });

  it('an unexpired active row resolves identically in both modes', async () => {
    const conn = makeGatedConn({ plan_snapshot: '{}', end_date: '2099-01-01' });
    const strict = await getCurrentSubscription(6, conn);
    const loose = await getCurrentSubscription(6, conn, { includeInactive: true });
    expect(strict.effectiveStatus).toBe('active');
    expect(loose.effectiveStatus).toBe('active');
    expect(strict.subscriptionId).toBe(loose.subscriptionId);
  });
});
