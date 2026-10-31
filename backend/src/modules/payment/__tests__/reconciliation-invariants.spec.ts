import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P5-08 — reconciliation invariants (OFFLINE).
 *
 * `ReconciliationService.run()` had **no dedicated tests** (documented as L-5 in
 * §5N.4). These tests exercise the REAL service with a stubbed pool and a
 * stubbed gateway, so the classification/flags/counters and the report-only
 * financial invariants are pinned without a database or a provider call.
 *
 * Query order inside `run()`:
 *   1 pending, 2 paid-not-confirmed, 3 wallet-deducted, 4 orphan, 5 booking-no-payment,
 *   6…11 tournament checks, 12…14 marketplace checks.
 */

type Row = Record<string, any>;

const QUERY_SLOTS = [
  'pending', 'paidNotConfirmed', 'wallet', 'orphan', 'bookingNoPayment',
  't1', 't2', 't3', 't4', 't5', 't6',
  'm1', 'm2', 'm3',
] as const;

type Slot = typeof QUERY_SLOTS[number];

const responses = new Map<Slot, Row[]>();
let executeSpy: ReturnType<typeof vi.fn>;
const escapeSpy = vi.fn((v: string) => `'${v}'`);
const getTransactionStatus = vi.fn();
const recoverPayment = vi.fn();
const recordAudit = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: (...args: any[]) => executeSpy(...args),
    query: async () => [[], []],
    escape: escapeSpy,
  }),
}));

vi.mock('../../../shared/services/gateway/gateway-factory.js', () => ({
  paymentGateway: { getTransactionStatus: (...args: any[]) => getTransactionStatus(...args) },
}));

vi.mock('../application/payment.service.js', () => ({
  paymentService: { recoverPayment: (...args: any[]) => recoverPayment(...args) },
}));

vi.mock('../../audit-log/index.js', () => ({
  recordAudit: (...args: any[]) => recordAudit(...args),
}));

import { ReconciliationService } from '../application/reconciliation.service.js';

function respond(overrides: Partial<Record<Slot, Row[]>> = {}) {
  responses.clear();
  for (const slot of QUERY_SLOTS) responses.set(slot, overrides[slot] ?? []);
}

beforeEach(() => {
  vi.clearAllMocks();
  respond();
  getTransactionStatus.mockResolvedValue(null);

  let idx = 0;
  executeSpy = vi.fn(async (_sql: string, _params?: any[]) => {
    // Multiple run() calls in one test must start from slot 0 again.
    if (idx >= QUERY_SLOTS.length) idx = 0;
    const slot = QUERY_SLOTS[idx++] ?? null;
    return [slot ? (responses.get(slot) ?? []) : [], []];
  });
});

function service() {
  return new ReconciliationService();
}

describe('P5-08 reconciliation — gateway-paid vs local-pending', () => {
  it('flags a CRITICAL auto-fixable issue when the gateway says PAID but local says pending', async () => {
    respond({
      pending: [{ id: 11, payment_status: 'pending', gateway_reference: 'GW-11' }],
    });
    getTransactionStatus.mockResolvedValue({ success: true, status: 'paid', amount_cents: 25050 });

    const run = await service().run();

    const issue = run.issues.find((i) => i.type === 'gateway_paid_local_pending')!;
    expect(issue.status).toBe('CRITICAL');
    expect(issue.autoFixable).toBe(true);
    expect(issue.entityId).toBe(11);
    expect(issue.detail).toContain('GW-11');
    expect(run.criticalCount).toBe(1);
    expect(run.issuesFound).toBe(1);
  });

  it('does not flag when the gateway reports failure or is unreachable (fail-safe)', async () => {
    respond({ pending: [{ id: 12, payment_status: 'pending', gateway_reference: 'GW-12' }] });
    getTransactionStatus.mockResolvedValue({ success: false, status: 'failed', amount_cents: 0 });

    let run = await service().run();
    expect(run.issues).toHaveLength(0);

    getTransactionStatus.mockRejectedValue(new Error('gateway down'));
    run = await service().run();
    expect(run.issues).toHaveLength(0);
    expect(run.itemsChecked).toBe(1);
  });
});

describe('P5-08 reconciliation — non-duplicate classifications', () => {
  it('flags paid-payment/booking-status mismatch as WARNING (not auto-fixable)', async () => {
    respond({
      paidNotConfirmed: [{ id: 21, booking_id: 77, booking_status: 'pending_payment' }],
    });

    const run = await service().run();
    const issue = run.issues.find((i) => i.type === 'paid_booking_not_confirmed')!;

    expect(issue.status).toBe('WARNING');
    expect(issue.autoFixable).toBe(false);
    expect(run.warningCount).toBe(1);
  });

  it('flags a wallet deduction without a completed payment as CRITICAL (manual only)', async () => {
    respond({
      wallet: [{ id: 31, amount: 400, payment_status: null }],
    });

    const run = await service().run();
    const issue = run.issues.find((i) => i.type === 'wallet_deducted_payment_not_complete')!;

    expect(issue.status).toBe('CRITICAL');
    expect(issue.autoFixable).toBe(false);
    expect(run.criticalCount).toBe(1);
  });

  it('flags a paid payment with no reference as WARNING', async () => {
    respond({ orphan: [{ id: 41 }] });

    const run = await service().run();
    expect(run.issues.map((i) => i.type)).toContain('orphan_payment');
    expect(run.warningCount).toBe(1);
  });

  it('reports a confirmed booking without a paid payment as INFO (COD is normal)', async () => {
    respond({ bookingNoPayment: [{ id: 51, payment_status: null }] });

    const run = await service().run();
    const issue = run.issues.find((i) => i.type === 'booking_confirmed_no_payment')!;

    expect(issue.status).toBe('INFO');
    expect(issue.autoFixable).toBe(false);
    expect(run.infoCount).toBe(1);
  });
});

describe('P5-08 reconciliation — settled-refund bank/clearing invariants', () => {
  it('marketplace settled refund that credits 1120 by the gross and leaves 1100 untouched passes', async () => {
    respond({
      m3: [{ payment_id: 61, order_id: 900, amount: 250, clearing_net: 0, bank_credit: 250 }],
    });

    const run = await service().run();
    expect(run.issues).toHaveLength(0);
  });

  it('flags a settled refund booked against clearing (bank credit short, 1100 moved) as CRITICAL report-only', async () => {
    respond({
      m3: [{ payment_id: 62, order_id: 901, amount: 250, clearing_net: 250, bank_credit: 0 }],
    });

    const run = await service().run();
    const issue = run.issues.find((i) => i.type === 'marketplace_settled_refund_bank_clearing_inconsistent')!;

    expect(issue.status).toBe('CRITICAL');
    expect(issue.autoFixable).toBe(false);
    expect(issue.detail).toContain('bank credit is 0');
    expect(issue.detail).toContain('1100 net movement is 250');
  });

  it('rounds amounts to 2 decimals before comparing (no false positive on float noise)', async () => {
    respond({
      m3: [{ payment_id: 63, order_id: 902, amount: 250, clearing_net: -0.001, bank_credit: 250.0004 }],
    });

    const run = await service().run();
    expect(run.issues).toHaveLength(0);
  });

  it('flags a settled Marketplace refund with no settled-refund posting at all', async () => {
    respond({
      m2: [{ payment_id: 64, order_id: 903, amount: 100 }],
    });

    const run = await service().run();
    const issue = run.issues.find((i) => i.type === 'marketplace_settled_refund_missing_variant')!;

    expect(issue.status).toBe('CRITICAL');
    expect(issue.autoFixable).toBe(false);
  });

  it('flags a gateway-settled tournament payment with no settlement lineage line', async () => {
    respond({
      t4: [{ payment_id: 71, registration_id: 301, gateway_settlement_id: 9 }],
    });

    const run = await service().run();
    const issue = run.issues.find((i) => i.type === 'tournament_settled_payment_missing_lineage')!;

    expect(issue.status).toBe('CRITICAL');
    expect(issue.autoFixable).toBe(false);
  });
});

describe('P5-08 reconciliation — counters and auto-fix boundaries', () => {
  it('counts every issue exactly once and keeps issuesFound consistent', async () => {
    respond({
      pending: [{ id: 81, payment_status: 'pending', gateway_reference: 'GW-81' }],
      wallet: [{ id: 82, amount: 10, payment_status: null }],
      orphan: [{ id: 83 }],
      bookingNoPayment: [{ id: 84 }],
      paidNotConfirmed: [{ id: 85, booking_id: 86, booking_status: 'pending_payment' }],
    });
    getTransactionStatus.mockResolvedValue({ success: true, status: 'paid', amount_cents: 100 });

    const run = await service().run();

    expect(run.issuesFound).toBe(5);
    expect(run.criticalCount).toBe(2); // gateway_paid_local_pending + wallet
    expect(run.warningCount).toBe(2); // orphan + paid booking not confirmed
    expect(run.infoCount).toBe(1); // booking confirmed without payment
    expect(run.criticalCount + run.warningCount + run.infoCount).toBe(run.issuesFound);
  });

  it('autoFix touches ONLY auto-fixable issues and never a financial report-only check', async () => {
    respond({
      pending: [{ id: 91, payment_status: 'pending', gateway_reference: 'GW-91' }],
      m2: [{ payment_id: 92, order_id: 904, amount: 100 }],
      m3: [{ payment_id: 93, order_id: 905, amount: 250, clearing_net: 250, bank_credit: 0 }],
    });
    getTransactionStatus.mockResolvedValue({ success: true, status: 'paid', amount_cents: 500 });
    recoverPayment.mockResolvedValue(undefined);

    const run = await service().run({ autoFix: true });

    expect(recoverPayment).toHaveBeenCalledTimes(1);
    expect(recoverPayment).toHaveBeenCalledWith('GW-91', 0);
    expect(run.autoFixed).toBe(1);

    // Report-only checks stay untouched.
    const untouched = run.issues.filter((i) => i.type.startsWith('marketplace_'));
    expect(untouched).toHaveLength(2);
    expect(untouched.every((i) => i.autoFixable === false)).toBe(true);
    expect(untouched.every((i) => !i.detail.includes('[AUTO-FIXED]'))).toBe(true);
  });

  it('a failing auto-fix is contained: the run still completes and reports zero fixed', async () => {
    respond({ pending: [{ id: 94, payment_status: 'pending', gateway_reference: 'GW-94' }] });
    getTransactionStatus.mockResolvedValue({ success: true, status: 'paid', amount_cents: 100 });
    recoverPayment.mockRejectedValue(new Error('recover failed'));

    const run = await service().run({ autoFix: true });

    expect(run.autoFixed).toBe(0);
    expect(run.issues[0].detail).not.toContain('[AUTO-FIXED]');
    expect(run.endedAt).toBeInstanceOf(Date);
  });

  it('date filters are escaped, not interpolated raw', async () => {
    await service().run({ dateFrom: "2026-01-01' OR 1=1 --", dateTo: '2026-02-01' });

    expect(escapeSpy).toHaveBeenCalledWith("2026-01-01' OR 1=1 --");
    expect(escapeSpy).toHaveBeenCalledWith('2026-02-01');
  });

  it('records a RECONCILIATION.RUN audit entry with the run counters', async () => {
    respond({ orphan: [{ id: 95 }] });

    const run = await service().run();

    expect(recordAudit).toHaveBeenCalledTimes(1);
    const payload = recordAudit.mock.calls[0][0];
    expect(payload.action).toBe('RECONCILIATION.RUN');
    expect(payload.afterState.runId).toBe(run.id);
    expect(payload.afterState.issuesFound).toBe(1);
  });
});
