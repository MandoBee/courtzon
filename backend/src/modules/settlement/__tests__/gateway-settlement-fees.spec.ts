import { describe, it, expect, vi } from 'vitest';

/**
 * P5-09 — gateway settlement fees and net amounts (OFFLINE).
 *
 * Exercises the REAL `gatewaySettlementService._computeFee` — the single place
 * where a gateway settlement line's fee and net are derived from the configured
 * `payment_methods.processing_fee_pct` / `processing_fee_fixed` snapshot.
 *
 * Invariant under test: `net = round2(gross − round2(gross·pct/100 + fixed))`,
 * i.e. the three amounts always reconcile to the cent, which is what the batch
 * header (`gross_amount / gateway_fee_amount / net_amount`) and the
 * clearing→bank posting depend on.
 *
 * No database, no network.
 */

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: vi.fn(async () => [[], []]), query: vi.fn(async () => [[], []]) }),
}));

// The event bus pulls Redis/queue clients at import time; `_computeFee` never uses it.
vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: vi.fn(), on: vi.fn() },
}));

// `_computeFee` is pure; the accounting module is only imported for the create/
// reverse paths, so it is stubbed to keep this suite offline and fast.
vi.mock('../../financial/application/accounting-event.listener.js', () => ({
  postGatewaySettlementAccounting: vi.fn(),
  postGatewaySettlementReversalAccounting: vi.fn(),
}));

import { gatewaySettlementService } from '../application/gateway-settlement.service.js';

function row(overrides: Record<string, any> = {}) {
  return {
    id: 9001,
    amount: 100,
    currency: 'EGP',
    payment_method: 'card',
    payment_method_id: 3,
    processing_fee_pct: 0,
    processing_fee_fixed: 0,
    reference_type: 'order',
    reference_id: 501,
    order_id: 501,
    booking_id: null,
    gateway_reference: 'GW-1',
    gateway_provider: 'paymob',
    paid_at: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

const compute = (overrides: Record<string, any> = {}) => gatewaySettlementService._computeFee(row(overrides));

describe('P5-09 gateway settlement fee — gross/fee/net reconciliation', () => {
  it('applies a percentage fee and derives net = gross − fee', () => {
    const r = compute({ amount: 100, processing_fee_pct: 2.5, processing_fee_fixed: 0 });

    expect(r.feeConfigStatus).toBe('ok');
    expect(r.grossAmount).toBe(100);
    expect(r.gatewayFeeAmount).toBe(2.5);
    expect(r.netAmount).toBe(97.5);
    expect(r.gatewayFeeAmount! + r.netAmount!).toBe(100);
  });

  it('applies percentage + fixed fee and keeps the three amounts reconciled', () => {
    const r = compute({ amount: 100.1, processing_fee_pct: 2.5, processing_fee_fixed: 1.25 });

    // 100.10 × 2.5% = 2.5025 + 1.25 = 3.7525 → 3.75
    expect(r.gatewayFeeAmount).toBe(3.75);
    expect(r.netAmount).toBe(96.35);
    expect(r.grossAmount).toBe(r.gatewayFeeAmount! + r.netAmount!);
  });

  it('applies a fixed-only fee', () => {
    const r = compute({ amount: 50, processing_fee_pct: 0, processing_fee_fixed: 2 });

    expect(r.gatewayFeeAmount).toBe(2);
    expect(r.netAmount).toBe(48);
  });

  it('applies a percentage-only fee', () => {
    const r = compute({ amount: 250, processing_fee_pct: 1.5, processing_fee_fixed: 0 });

    expect(r.gatewayFeeAmount).toBe(3.75);
    expect(r.netAmount).toBe(246.25);
  });

  it('rounds the fee to 2 decimals and never leaves a sub-cent residue in the net', () => {
    const r = compute({ amount: 33.33, processing_fee_pct: 3, processing_fee_fixed: 0 });

    // 0.9999 → 1.00
    expect(r.gatewayFeeAmount).toBe(1);
    expect(r.netAmount).toBe(32.33);
    expect(r.grossAmount).toBe(r.gatewayFeeAmount! + r.netAmount!);
  });

  it('rounds the gross itself to 2 decimals before computing the fee', () => {
    const r = compute({ amount: 100.005, processing_fee_pct: 10, processing_fee_fixed: 0 });

    // gross 100.01 (rounded) → fee 10.00 → net 90.01
    expect(r.grossAmount).toBe(100.01);
    expect(r.gatewayFeeAmount).toBe(10);
    expect(r.netAmount).toBe(90.01);
  });

  it('handles a zero-amount payment without inventing a fee', () => {
    const r = compute({ amount: 0, processing_fee_pct: 2.5, processing_fee_fixed: 0 });

    expect(r.grossAmount).toBe(0);
    expect(r.gatewayFeeAmount).toBe(0);
    expect(r.netAmount).toBe(0);
  });

  it('zero configured fee yields net = gross', () => {
    const r = compute({ amount: 123.45, processing_fee_pct: 0, processing_fee_fixed: 0 });

    expect(r.gatewayFeeAmount).toBe(0);
    expect(r.netAmount).toBe(123.45);
  });
});

describe('P5-09 gateway settlement fee — configuration guards', () => {
  it('flags a gateway payment with no resolvable fee configuration as missing (no invented 0% fee)', () => {
    const r = compute({ payment_method: 'card', payment_method_id: null, processing_fee_pct: null, processing_fee_fixed: null });

    expect(r.feeConfigStatus).toBe('missing');
    expect(r.feeConfigError).toContain('fee configuration is missing');
    expect(r.gatewayFeePct).toBeNull();
    expect(r.gatewayFeeFixed).toBeNull();
    expect(r.gatewayFeeAmount).toBeNull();
    expect(r.netAmount).toBeNull();
  });

  it('flags an online payment with no fee configuration the same way', () => {
    expect(compute({ payment_method: 'online', payment_method_id: null }).feeConfigStatus).toBe('missing');
  });

  it('does not flag a non-gateway method (cash) when no fee row exists', () => {
    const r = compute({ payment_method: 'cash', payment_method_id: null });

    expect(r.feeConfigStatus).toBe('ok');
    expect(r.gatewayFeeAmount).toBe(0);
    expect(r.netAmount).toBe(100);
  });

  it('treats null fee fields on a configured method as 0 (not NaN)', () => {
    const r = compute({ payment_method_id: 3, processing_fee_pct: null, processing_fee_fixed: null });

    expect(r.gatewayFeeAmount).toBe(0);
    expect(r.netAmount).toBe(100);
  });
});

describe('P5-09 gateway settlement fee — boundaries (documented current behaviour)', () => {
  it('a 100% fee leaves zero net (boundary, still balanced)', () => {
    const r = compute({ amount: 100, processing_fee_pct: 100, processing_fee_fixed: 0 });

    expect(r.gatewayFeeAmount).toBe(100);
    expect(r.netAmount).toBe(0);
  });

  it('CURRENT BEHAVIOUR: a fee above gross produces a NEGATIVE net — there is no fee≤gross validation here', () => {
    // Characterization, not an endorsement: `create()` only rejects gross <= 0,
    // so a misconfigured processing_fee_pct (e.g. 150) yields fee 150 / net −50
    // and a negative bank leg. Recorded as an open configuration risk (P5-09).
    const r = compute({ amount: 100, processing_fee_pct: 150, processing_fee_fixed: 0 });

    expect(r.gatewayFeeAmount).toBe(150);
    expect(r.netAmount).toBe(-50);
  });
});
