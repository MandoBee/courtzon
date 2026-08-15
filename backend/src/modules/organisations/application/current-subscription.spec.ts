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
