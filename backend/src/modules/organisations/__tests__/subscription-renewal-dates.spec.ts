import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: async () => [[], []] }),
}));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn(), on: vi.fn() } }));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({ queueService: { add: vi.fn(), close: vi.fn() } }));
vi.mock('../../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn(), on: vi.fn() } }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({
  transactionRepository: { createTransaction: vi.fn(async () => 1) },
}));
vi.mock('../../financial/application/accounting-event.listener.js', () => ({
  postAccountingEvent: vi.fn(async () => undefined),
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn(async () => undefined) }));

import { writeActiveSubscription, addMonths } from '../application/subscription-activation.service.js';

/**
 * Regression tests for the renewal business rules:
 *   - A renewal starts the day AFTER the previous period ends, never on the
 *     payment/approval date (before expiry, on the expiry date, or after it).
 *   - The next period is a NEW row (history preserved), auto_renew always FALSE.
 *   - Pre-expiry renewals are stored as future-dated 'pending' rows; overlapping
 *     scheduled renewals are rejected.
 *   - Durations resolve from duration_months (fallback billing_cycle); unlimited
 *     plans have no end date.
 */

type Row = Record<string, any>;

interface ConnScript {
  /** row returned for the "existing recent subscription" lookup */
  existing?: Row | null;
  /** row returned for the "future-dated renewal exists" guard */
  futureRenewal?: Row | null;
  /** value returned as MAX(end_date) continuity anchor */
  prevEnd?: Date | null;
  /** row returned for subscription_plans lookups (duration resolution) */
  plan?: Row | null;
  insertId?: number;
}

function makeConn(script: ConnScript = {}) {
  const calls: { sql: string; params: any[] }[] = [];
  const execute = async (sql: string, params: any[] = []) => {
    const s = sql.trim();
    calls.push({ sql: s, params });
    if (s.startsWith('SELECT') && s.includes("IN ('pending', 'suspended', 'active')")) {
      return [script.existing ? [script.existing] : [], []];
    }
    if (s.startsWith('SELECT') && s.includes('start_date > CURDATE()')) {
      return [script.futureRenewal ? [script.futureRenewal] : [], []];
    }
    if (s.startsWith('SELECT') && s.includes('MAX(end_date)')) {
      return [[{ prev_end: script.prevEnd ?? null }], []];
    }
    if (s.startsWith('SELECT') && s.includes('FROM subscription_plans WHERE id')) {
      return [script.plan ? [script.plan] : [], []];
    }
    if (s.startsWith('INSERT INTO organisation_subscriptions')) {
      return [{ insertId: script.insertId ?? 9001 }, []];
    }
    // UPDATEs (close superseded periods / mutate in place)
    return [{ affectedRows: 1 }, []];
  };
  return { conn: { execute } as any, capture: () => calls };
}

const baseInput = {
  orgId: 6,
  planId: 2,
  billingCycle: 'monthly',
  planSnapshot: '{}',
  isUnlimited: false,
};

/** Local-calendar date string N days from today (matches the writer's toSqlDate). */
function dayOffset(offsetDays: number): string {
  return dayOffsetDate(offsetDays).toISOString().slice(0, 0) + fmtLocal(dayOffsetDate(offsetDays));
}

function dayOffsetDate(offsetDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function fmtLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

describe('writeActiveSubscription renewal period chaining', () => {
  async function insertedRow(script: ConnScript) {
    const { conn, capture } = makeConn(script);
    await writeActiveSubscription({ conn, ...baseInput, requestType: 'RENEWAL' });
    const insert = capture().find(c => c.sql.startsWith('INSERT INTO organisation_subscriptions'));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('FALSE'); // auto_renew is never enabled
    const [orgId, planId, cycle, status, start, end] = insert!.params;
    return { orgId, planId, cycle, status, start, end, autoRenew: false, calls: capture() };
  }

  it('A: renewed before expiry -> future-dated pending period starting prev_end+1 (not payment date)', async () => {
    const row = await insertedRow({ prevEnd: dayOffsetDate(10) });
    expect(row.status).toBe('pending');
    expect(row.start).toBe(dayOffset(11));
    expect(row.end! > row.start).toBe(true);
    expect(row.autoRenew).toBe(false);
  });

  it('B/C: renewed after expiry -> active period still chained from prev_end+1, prior periods closed', async () => {
    const row = await insertedRow({ prevEnd: dayOffsetDate(-3) });
    expect(row.status).toBe('active');
    expect(row.start).toBe(dayOffset(-2));
    const close = row.calls.find(c => c.sql.startsWith('UPDATE') && c.sql.includes("'expired'"));
    expect(close).toBeDefined();
  });

  it('I: rejects a second renewal while a future-dated one is already scheduled', async () => {
    const { conn } = makeConn({ futureRenewal: { id: 555 }, prevEnd: dayOffsetDate(10) });
    await expect(
      writeActiveSubscription({ conn, ...baseInput, requestType: 'RENEWAL' }),
    ).rejects.toThrow(/already scheduled/i);
  });

  it('first-ever activation (no anchor) starts today as active', async () => {
    const row = await insertedRow({});
    expect(row.status).toBe('active');
    expect(row.start).toBe(dayOffset(0));
  });

  it('L: duration_months drives the period length (3-month plan)', async () => {
    const { conn } = makeConn({ prevEnd: dayOffsetDate(-1), plan: { is_unlimited: 0, duration_months: 3 } });
    const result = await writeActiveSubscription({ conn, ...baseInput, requestType: 'RENEWAL' });
    expect(result.startDate).toBe(dayOffset(0));
    expect(result.endDate).not.toBeNull();
    // end must be exactly 3 months after start
    const s = new Date(result.startDate!);
    const e = new Date(result.endDate!);
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    expect(months).toBe(3);
    expect(e.getDate()).toBe(s.getDate() === 31 ? e.getDate() : s.getDate());
  });

  it('K: unlimited plans have no end date', async () => {
    const { conn } = makeConn({ prevEnd: dayOffsetDate(4) });
    const result = await writeActiveSubscription({ conn, ...baseInput, requestType: 'RENEWAL', isUnlimited: true });
    expect(result.endDate).toBeNull();
    expect(result.startDate).toBe(dayOffset(5));
  });

  it('legacy plan without duration falls back to billing_cycle (yearly=12)', async () => {
    const { conn } = makeConn({ prevEnd: dayOffsetDate(-1), plan: { is_unlimited: 0, duration_months: null } });
    const result = await writeActiveSubscription({ conn, ...baseInput, billingCycle: 'yearly', requestType: 'RENEWAL' });
    const s = new Date(result.startDate!);
    const e = new Date(result.endDate!);
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    expect(months).toBe(12);
  });

  it('non-renewal paths keep their semantics: mutate in place without chaining, auto_renew off', async () => {
    const { conn, capture } = makeConn({
      existing: { id: 77, start_date: dayOffset(-20), end_date: dayOffset(10) },
    });
    const result = await writeActiveSubscription({ conn, ...baseInput, billingCycle: 'monthly' });
    expect(result.subscriptionId).toBe(77);
    const update = capture().find(c => c.sql.startsWith('UPDATE organisation_subscriptions'));
    expect(update).toBeDefined();
    expect(update!.sql).toContain('auto_renew = FALSE');
    expect(update!.params[2]).toBe(dayOffset(0)); // start = activation date
    expect(update!.params[5]).toBe(77);
  });

  it('Issue 1 edge I: the existing-row probe excludes FUTURE-DATED rows (start_date gate)', async () => {
    // A scheduled renewal must never be hijacked/mutated by a non-renewal write.
    const { conn, capture } = makeConn({});
    await writeActiveSubscription({ conn, ...baseInput });
    const probe = capture().find(
      c => c.sql.includes("IN ('pending', 'suspended', 'active')") && c.sql.startsWith('SELECT'),
    );
    expect(probe).toBeDefined();
    expect(probe!.sql).toContain('start_date <= CURDATE()');
    // With no eligible existing row the writer INSERTs instead of mutating.
    expect(capture().some(c => c.sql.startsWith('INSERT INTO organisation_subscriptions'))).toBe(true);
  });
});

describe('addMonths clamping', () => {
  it('clamps month-end overflow (Jan 31 + 1 month = Feb 28)', () => {
    const out = addMonths(new Date(2026, 0, 31), 1);
    expect(out.getMonth()).toBe(1);
    expect(out.getDate()).toBe(28);
  });

  it('keeps day-of-month when valid (Mar 15 + 2 months = May 15)', () => {
    const out = addMonths(new Date(2026, 2, 15), 2);
    expect(out.getMonth()).toBe(4);
    expect(out.getDate()).toBe(15);
  });

  it('handles year rollover (Nov 20 + 3 months = Feb 20)', () => {
    const out = addMonths(new Date(2026, 10, 20), 3);
    expect(out.getFullYear()).toBe(2027);
    expect(out.getMonth()).toBe(1);
    expect(out.getDate()).toBe(20);
  });
});

