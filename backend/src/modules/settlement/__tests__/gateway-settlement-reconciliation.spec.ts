import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P5-09 — gateway settlement reconciliation invariants (OFFLINE).
 *
 * `GatewaySettlementReconciliationService` had no dedicated unit tests. This
 * suite exercises the REAL service with a stubbed pool, pinning the invariants
 * that keep gateway clearing (1100) → bank (1120) honest:
 *   batch header = Σ ACTIVE lines (gross/fee/net), transaction_count = ACTIVE
 *   line count, active-line ownership, payment ↔ batch linkage, refunded
 *   payments never ACTIVE, refunded tournaments detached, and no payment owning
 *   two ACTIVE lines.
 *
 * REPORT-ONLY guarantees are asserted too: `readOnly`, `autoFixAvailable:false`,
 * per-check severities, counters, and one audit row per discrepancy.
 *
 * No database, no network.
 */

type Row = Record<string, any>;

const SLOTS = [
  'header', 'count', 'ownership', 'linkage', 'refundedActive',
  'pointerMismatch', 'tournamentSettled', 'tournamentUnsettled', 'duplicateOwnership',
] as const;
type Slot = typeof SLOTS[number];

const responses = new Map<Slot, Row[]>();
let executeSpy: ReturnType<typeof vi.fn>;
const recordAudit = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: (...args: any[]) => executeSpy(...args),
    query: async () => [[], []],
  }),
}));

vi.mock('../../audit-log/index.js', () => ({
  recordAudit: (...args: any[]) => recordAudit(...args),
}));

import { GatewaySettlementReconciliationService } from '../application/gateway-settlement.reconciliation.js';

function respond(overrides: Partial<Record<Slot, Row[]>> = {}) {
  responses.clear();
  for (const slot of SLOTS) responses.set(slot, overrides[slot] ?? []);
}

function service() {
  return new GatewaySettlementReconciliationService();
}

function check(report: Awaited<ReturnType<typeof service>['run']>, key: string) {
  return report.checks.find((c) => c.key === key)!;
}

beforeEach(() => {
  vi.clearAllMocks();
  respond();
  let idx = 0;
  executeSpy = vi.fn(async (_sql: string) => {
    const slot = SLOTS[idx++] ?? null;
    return [slot ? (responses.get(slot) ?? []) : [], []];
  });
});

describe('P5-09 settlement reconciliation — clean state', () => {
  it('reports nine read-only checks and a clean summary when nothing drifts', async () => {
    respond({
      header: [{ id: 1, batch_code: 'GS-1', gross_amount: 300, gateway_fee_amount: 9, net_amount: 291, active_gross: 300, active_fee: 9, active_net: 291 }],
      count: [{ id: 1, batch_code: 'GS-1', transaction_count: 3, active_lines: 3 }],
    });

    const report = await service().run();

    expect(report.checks).toHaveLength(9);
    expect(report.readOnly).toBe(true);
    expect(report.autoFixAvailable).toBe(false);
    expect(report.summary).toEqual({
      checksRun: 9, itemsChecked: 2, issuesFound: 0, criticalCount: 0, warningCount: 0, clean: true,
    });
    // Only the run audit, no discrepancy audits.
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0][0].action).toBe('GATEWAY_SETTLEMENT.RECONCILIATION');
  });

  it('treats sub-cent float noise as clean (rounds to 2 decimals)', async () => {
    respond({
      header: [{ id: 1, batch_code: 'GS-1', gross_amount: 300, gateway_fee_amount: 9, net_amount: 291, active_gross: 300.004, active_fee: 8.999, active_net: 291.005 }],
      count: [{ id: 1, batch_code: 'GS-1', transaction_count: 3, active_lines: 3 }],
    });

    const report = await service().run();

    expect(report.summary.issuesFound).toBe(0);
  });
});

describe('P5-09 settlement reconciliation — header vs ACTIVE lines', () => {
  it('flags a batch whose header gross/fee/net disagree with its ACTIVE lines', async () => {
    respond({
      header: [{ id: 7, batch_code: 'GS-7', gross_amount: 300, gateway_fee_amount: 9, net_amount: 291, active_gross: 250, active_fee: 7.5, active_net: 242.5 }],
    });

    const report = await service().run();
    const c = check(report, 'header_totals_vs_active_lines');

    expect(c.severity).toBe('CRITICAL');
    expect(c.itemsChecked).toBe(1);
    expect(c.issuesFound).toBe(1);
    expect(c.issues[0].entityType).toBe('gateway_settlement');
    expect(c.issues[0].entityId).toBe(7);
    expect(c.issues[0].detail).toContain('delta 50 / 1.5 / 48.5');
    expect(c.issues[0].recommendation).toMatch(/Do NOT auto-correct/);
    expect(report.summary.criticalCount).toBe(1);
    expect(report.summary.clean).toBe(false);
  });

  it('flags transaction_count vs ACTIVE lines mismatch', async () => {
    respond({ count: [{ id: 8, batch_code: 'GS-8', transaction_count: 3, active_lines: 2 }] });

    const report = await service().run();
    const c = check(report, 'transaction_count_vs_active_lines');

    expect(c.issuesFound).toBe(1);
    expect(c.issues[0].detail).toContain('transaction_count 3');
    expect(c.issues[0].detail).toContain('2 ACTIVE lines');
  });
});

describe('P5-09 settlement reconciliation — ownership and linkage', () => {
  it('flags an ACTIVE line whose active pointer contradicts its own payment', async () => {
    respond({ ownership: [{ id: 11, gateway_settlement_id: 3, payment_transaction_id: 100, active_payment_transaction_id: 101 }] });

    const report = await service().run();
    const c = check(report, 'active_line_ownership');

    expect(c.severity).toBe('CRITICAL');
    expect(c.issues[0].detail).toContain('settles payment 100');
    expect(c.issues[0].detail).toContain('active_payment_transaction_id 101');
  });

  it('flags a payment marked settled that owns no ACTIVE line in its batch', async () => {
    respond({ linkage: [{ payment_id: 55, payment_status: 'paid', gateway_settlement_id: 4, gateway_settled_at: '2026-10-01 10:00:00' }] });

    const report = await service().run();
    const c = check(report, 'payment_settlement_linkage');

    expect(c.issues[0].entityId).toBe(55);
    expect(c.issues[0].detail).toContain('owns NO active settlement line');
  });

  it('flags an ACTIVE line pointing at a different batch than its payment', async () => {
    respond({ pointerMismatch: [{ line_id: 12, gateway_settlement_id: 5, payment_transaction_id: 200, payment_settlement_id: 6, payment_status: 'paid' }] });

    const report = await service().run();
    const c = check(report, 'line_payment_settlement_mismatch');

    expect(c.issues[0].detail).toContain('ACTIVE in batch 5');
    expect(c.issues[0].detail).toContain('points at 6');
  });

  it('flags a payment owning more than one ACTIVE settlement line', async () => {
    respond({ duplicateOwnership: [{ payment_id: 300, line_count: 2, line_ids: '1,2', settlement_ids: '9,10' }] });

    const report = await service().run();
    const c = check(report, 'duplicate_active_settlement_ownership');

    expect(c.severity).toBe('CRITICAL');
    expect(c.issues[0].detail).toContain('2 settlements');
    expect(c.issues[0].recommendation).toContain('Keep exactly one line active');
  });
});

describe('P5-09 settlement reconciliation — refunds', () => {
  it('flags a REFUNDED payment still holding an ACTIVE settlement line', async () => {
    respond({ refundedActive: [{ line_id: 21, gateway_settlement_id: 6, payment_transaction_id: 400, payment_status: 'refunded' }] });

    const report = await service().run();
    const c = check(report, 'refunded_payment_still_active');

    expect(c.issues[0].detail).toContain('still ACTIVE');
    expect(c.issues[0].detail).toContain('REFUNDED');
  });

  it('flags a refunded tournament payment still linked to a settled batch', async () => {
    respond({ tournamentSettled: [{ payment_id: 500, registration_id: 70, gateway_settlement_id: 8, gateway_settled_at: '2026-10-02 09:00:00' }] });

    const report = await service().run();
    const c = check(report, 'refunded_tournament_still_settled');

    expect(c.issues[0].detail).toContain('REFUNDED but still linked');
  });

  it('warns when a paid CARD tournament payment is unsettled after the draw is locked', async () => {
    respond({ tournamentUnsettled: [{ payment_id: 600, registration_id: 80, amount: 250, currency: 'EGP', gateway_reference: 'GW-600' }] });

    const report = await service().run();
    const c = check(report, 'tournament_payment_unsettled_after_draw_lock');

    expect(c.severity).toBe('WARNING');
    expect(c.issues[0].detail).toContain('draw is LOCKED');
    expect(report.summary.warningCount).toBe(1);
    expect(report.summary.criticalCount).toBe(0);
  });
});

describe('P5-09 settlement reconciliation — counters, caps and audit', () => {
  it('sums counters across checks and classifies by check severity', async () => {
    respond({
      header: [{ id: 1, batch_code: 'GS-1', gross_amount: 300, gateway_fee_amount: 9, net_amount: 291, active_gross: 100, active_fee: 3, active_net: 97 }],
      count: [{ id: 1, batch_code: 'GS-1', transaction_count: 3, active_lines: 1 }],
      refundedActive: [{ line_id: 2, gateway_settlement_id: 1, payment_transaction_id: 9, payment_status: 'refunded' }],
      tournamentUnsettled: [{ payment_id: 600, registration_id: 80, amount: 250, currency: 'EGP', gateway_reference: 'GW-600' }],
    });

    const report = await service().run();

    expect(report.summary.issuesFound).toBe(4);
    expect(report.summary.criticalCount).toBe(3);
    expect(report.summary.warningCount).toBe(1);
    expect(report.summary.criticalCount + report.summary.warningCount).toBe(report.summary.issuesFound);
    // One run audit + one audit per non-clean check (4 checks have issues).
    expect(recordAudit).toHaveBeenCalledTimes(5);
  });

  it('caps stored issues per check at 200 but still counts every discrepancy', async () => {
    const rows = Array.from({ length: 205 }, (_v, i) => ({
      id: i + 1, batch_code: `GS-${i + 1}`,
      gross_amount: 300, gateway_fee_amount: 9, net_amount: 291,
      active_gross: 0, active_fee: 0, active_net: 0,
    }));
    respond({ header: rows });

    const report = await service().run();
    const c = check(report, 'header_totals_vs_active_lines');

    expect(c.itemsChecked).toBe(205);
    expect(c.issuesFound).toBe(205);
    expect(c.issues).toHaveLength(200);
    expect(report.summary.issuesFound).toBe(205);
  });

  it('remains report-only even when several checks fail (autoFixAvailable is always false)', async () => {
    respond({
      header: [{ id: 1, batch_code: 'GS-1', gross_amount: 300, gateway_fee_amount: 9, net_amount: 291, active_gross: 0, active_fee: 0, active_net: 0 }],
      duplicateOwnership: [{ payment_id: 300, line_count: 2, line_ids: '1,2', settlement_ids: '9,10' }],
    });

    const report = await service().run();

    expect(report.autoFixAvailable).toBe(false);
    expect(report.readOnly).toBe(true);
    expect(report.checks.every((c) => c.issues.every((i) => typeof i.recommendation === 'string' && i.recommendation.length > 0))).toBe(true);
  });

  it('a failing audit does not abort the reconciliation run', async () => {
    recordAudit.mockRejectedValue(new Error('audit unavailable'));
    respond({ header: [{ id: 1, batch_code: 'GS-1', gross_amount: 300, gateway_fee_amount: 9, net_amount: 291, active_gross: 0, active_fee: 0, active_net: 0 }] });

    const report = await service().run();

    expect(report.summary.issuesFound).toBe(1);
    expect(report.endedAt).toBeInstanceOf(Date);
  });
});
