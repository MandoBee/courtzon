import { describe, it, expect, vi, beforeEach } from 'vitest';

// Scripted pool: each test registers responses keyed by SQL signature.
const scripted: ((sql: string) => any[] | null)[] = [];

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: async (sql: string) => {
      for (const match of scripted) {
        const rows = match(sql);
        if (rows) return [rows, []];
      }
      return [[], []];
    },
  }),
}));

import { getCurrentSubscription, clearSubscriptionCache } from '../application/current-subscription.service.js';

type Row = Record<string, any>;

function makeSubRow(overrides: Row = {}): Row {
  return {
    id: 2,
    organisation_id: 6,
    plan_id: 7,
    billing_cycle: 'monthly',
    subscription_status: 'active',
    start_date: '2026-08-18',
    end_date: '2026-09-18',
    auto_renew: 0,
    plan_snapshot: JSON.stringify({ planName: 'Promo Club' }),
    ...overrides,
  };
}

/** Registers the two resolver queries for includeInactive mode. */
function scriptIncludeInactive(effectiveRow: Row | null, fallbackRow: Row | null) {
  scripted.push((sql) => {
    if (sql.includes("IN ('active', 'pending', 'suspended')")) return effectiveRow ? [effectiveRow] : [];
    if (/ORDER BY os\.created_at DESC/.test(sql)) return fallbackRow ? [fallbackRow] : [];
    return null;
  });
}

describe('CurrentSubscriptionService — canonical resolution (Issue 1)', () => {
  beforeEach(() => {
    scripted.length = 0;
    clearSubscriptionCache();
  });

  it('strict mode selects the ACTIVE period when an expired historical row also exists', async () => {
    // Expired history first (newest created_at would pick it if un-gated).
    scripted.push((sql) => {
      if (sql.includes("IN ('active', 'pending', 'suspended')") && sql.includes('organisation_id = ?')) {
        return [makeSubRow({ id: 2, subscription_status: 'active', start_date: '2026-08-18', end_date: '2026-09-18' })];
      }
      return null;
    });
    const sub = await getCurrentSubscription(6);
    expect(sub.exists).toBe(true);
    expect(sub.subscriptionId).toBe(2);
    expect(sub.effectiveStatus).toBe('active');
  });

  it('strict mode never resolves an EXPIRED row (historical entitlement is dead)', async () => {
    scripted.push((sql) => {
      if (sql.includes("IN ('active', 'pending', 'suspended')")) return [];
      return null;
    });
    const sub = await getCurrentSubscription(6);
    expect(sub.exists).toBe(false);
    expect(sub.effectiveStatus).toBe('none');
  });

  it('includeInactive prefers the CURRENTLY-EFFECTIVE row over a newer future-dated pending renewal', async () => {
    const futureRenewal = makeSubRow({
      id: 9,
      subscription_status: 'pending',
      start_date: '2026-09-19',
      end_date: '2026-10-19',
      plan_snapshot: JSON.stringify({ planName: 'Promo Club' }),
    });
    scriptIncludeInactive(
      makeSubRow({ id: 8, subscription_status: 'active', start_date: '2026-08-18', end_date: '2026-09-18' }),
      futureRenewal,
    );
    const sub = await getCurrentSubscription(6, undefined, { includeInactive: true });
    expect(sub.subscriptionId).toBe(8);
    expect(sub.effectiveStatus).toBe('active');
  });

  it('includeInactive falls back to the newest row of ANY status when nothing is effective (admin truthfulness)', async () => {
    const cancelled = makeSubRow({ id: 4, subscription_status: 'cancelled', end_date: '2026-07-01' });
    scriptIncludeInactive(null, cancelled);
    const sub = await getCurrentSubscription(6, undefined, { includeInactive: true });
    expect(sub.exists).toBe(true);
    expect(sub.subscriptionId).toBe(4);
    expect(sub.effectiveStatus).toBe('cancelled');
  });

  it('includeInactive surfaces an already-expired latest period as expired — never as active', async () => {
    const expired = makeSubRow({ id: 5, subscription_status: 'expired', start_date: '2026-07-17', end_date: '2026-08-17' });
    scriptIncludeInactive(null, expired);
    const sub = await getCurrentSubscription(6, undefined, { includeInactive: true });
    expect(sub.effectiveStatus).toBe('expired');
    expect(sub.isExpired).toBe(true);
  });
});
