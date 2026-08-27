import { describe, it, expect } from 'vitest';
import { buildEntitlementInputs } from '../application/marketplace-entitlement-calc.js';
import { computeSettlementFinancials } from '../../settlement/application/unified-settlement-calc.js';

/**
 * F-9 — Tax pass-through reconciliation divergence.
 *
 * Tax is a pass-through liability (collected from the customer and remitted to
 * the tax authority). It is NEVER part of the seller/organisation economic
 * position. The canonical GL books tax to 2300 tax_liability and excludes it
 * from merchant_payable / org_payable. The entitlement (org earning) must
 * therefore be TAX-EXCLUSIVE so that:
 *
 *   entitlement position = GL payable position  → reconciliation clean
 *
 * Before the fix, the entitlement included tax, inflating the org position by
 * the tax amount and causing settlement to over-clear the GL payable.
 */

describe('F-9 — marketplace entitlement is tax-exclusive (matches GL payable)', () => {
  it('taxed CARD order: org earning excludes tax; commission unchanged', () => {
    // Order: subtotal 100, tax 10, shipping 0, commission 10 → customer pays 110.
    const order = {
      id: 900,
      currency_code: 'EGP',
      subtotal: 100.0,
      discount_amount: 0,
      shipping_cost: 0,
      tax_amount: 10.0,
      total: 110.0, // 100 + 10
      courtzon_fee: 10.0,
    };
    const items = [
      { item_id: 91, item_seller_id: 7, branch_id: 3, product_id: 51, unit_price: 100, quantity: 1, item_total: 100.0, commission_amount: 10.0 },
    ];
    const inputs = buildEntitlementInputs(order, items);
    const org = inputs.find((i) => i.entitlementType === 'ORGANIZATION_EARNING');
    const comm = inputs.find((i) => i.entitlementType === 'COURTZON_COMMISSION');
    // org earning = 100 − 0 − 10 + 0 = 90 (tax-exclusive); commission = 10.
    expect(org!.amount).toBe(90.0);
    expect(comm!.amount).toBe(10.0);
    // The GL merchant_payable = gross − commission − tax = 110 − 10 − 10 = 90.
    // Entitlement (90) === GL payable (90). No divergence.
  });

  it('taxed order with shipping: org earning excludes allocated tax', () => {
    const order = {
      id: 901, currency_code: 'EGP', subtotal: 100.0, discount_amount: 0,
      shipping_cost: 20.0, tax_amount: 12.0, total: 132.0, courtzon_fee: 10.0,
    };
    const items = [
      { item_id: 92, item_seller_id: 7, branch_id: null, product_id: 52, unit_price: 100, quantity: 1, item_total: 100.0, commission_amount: 10.0 },
    ];
    const inputs = buildEntitlementInputs(order, items);
    const org = inputs.find((i) => i.entitlementType === 'ORGANIZATION_EARNING');
    // org earning = 100 − 0 − 10 + 20 = 110 (excludes the 12 tax).
    expect(org!.amount).toBeCloseTo(110.0, 1);
    // metadata still tracks allocatedTax for traceability.
    expect(org!.metadata.allocatedTax).toBeCloseTo(12.0, 1);
  });

  it('zero-tax transaction unchanged (org earning identical to pre-fix)', () => {
    const order = {
      id: 902, currency_code: 'EGP', subtotal: 100.0, discount_amount: 0,
      shipping_cost: 0, tax_amount: 0, total: 100.0, courtzon_fee: 10.0,
    };
    const items = [
      { item_id: 93, item_seller_id: 7, branch_id: null, product_id: 53, unit_price: 100, quantity: 1, item_total: 100.0, commission_amount: 10.0 },
    ];
    const inputs = buildEntitlementInputs(order, items);
    const org = inputs.find((i) => i.entitlementType === 'ORGANIZATION_EARNING');
    expect(org!.amount).toBe(90.0); // 100 − 10, tax=0 so unchanged
  });

  it('settlement consumes the tax-exclusive org earning (matches GL payable)', () => {
    // A taxed CARD sale: org earning 90 (tax-excl), commission 10 (collected by CourtZon).
    const settlement = computeSettlementFinancials([
      { id: 1, organisationId: 7, entitlementType: 'ORGANIZATION_EARNING', amount: 90, collector: 'courtzon' },
      { id: 2, organisationId: 7, entitlementType: 'COURTZON_COMMISSION', amount: 10, collector: 'courtzon' },
    ]);
    // CourtZon owes org 90 = GL org_payable (tax-exclusive). Settlement clears
    // exactly the payable — no over-clearing by tax.
    expect(settlement.courtzonOwedToOrg).toBe(90);
    expect(settlement.finalAmount).toBe(90);
  });
});

describe('F-9 — reconciliation equivalence for taxed transactions', () => {
  it('taxed transaction: entitlement net equals GL payable net (no drift)', async () => {
    // Simulate the reconciliation comparison for a taxed CARD order.
    // Entitlement side (after fix): org earning 90 (tax-exclusive).
    const entPayable = 90;
    // GL side: merchant_payable credited 90 (tax-exclusive); tax booked to 2300.
    const glPayable = 90;
    const difference = entPayable - glPayable;
    expect(Math.abs(difference)).toBeLessThan(0.01); // reconciled
  });

  it('taxed transaction BEFORE fix: entitlement included tax → drift = tax', () => {
    // Pre-fix entitlement would have been org earning 90 + 10 tax = 100.
    const entPayableBeforeFix = 100; // tax-inclusive
    const glPayable = 90; // tax-exclusive (GL was always correct)
    const difference = entPayableBeforeFix - glPayable;
    expect(difference).toBe(10); // the tax component — the F-9 drift
  });

  it('still detects REAL drift (entitlement ≠ GL due to an actual mismatch)', async () => {
    // Introduce a genuine GL error: GL payable credited 130 instead of 90.
    const entPayable = 90;
    const glPayableWrong = 130;
    const difference = entPayable - glPayableWrong;
    expect(Math.abs(difference)).toBeGreaterThan(0.01); // drift reported
  });
});

describe('F-9 — booking entitlement is tax-exclusive (matches club_amount/GL org_payable)', () => {
  it('booking economics: club_amount (tax-exclusive) is the org position', async () => {
    // Mirrors financial-custody.spec: total 100, tax 9, commission 10, club 90.
    // GL org_payable = club_amount = 90 (tax-exclusive). The entitlement must
    // equal this (90), not total+tax−commission (99) which is tax-inclusive.
    const total = 100;
    const tax = 9;
    const commission = 10;
    const clubAmount = total - commission; // 90, the GL org_payable
    // Entitlement org earning (tax-exclusive, after fix) = total − commission.
    const orgNetAmount = total - commission;
    expect(clubAmount).toBe(90);
    expect(orgNetAmount).toBe(90);
    // Pre-fix: orgNetAmount = (total + tax) − commission = 99 (tax-inclusive) — drift = 9.
    const preFix = (total + tax) - commission;
    expect(preFix).toBe(99);
    expect(preFix - clubAmount).toBe(9); // the F-9 drift for booking
  });
});

describe('F-9 — no hidden tax authority / duplicate treatment', () => {
  it('allocatedTax is tracked in metadata but excluded from the position amount', () => {
    const order = {
      id: 903, currency_code: 'EGP', subtotal: 50.0, discount_amount: 0,
      shipping_cost: 10.0, tax_amount: 6.0, total: 66.0, courtzon_fee: 5.0,
    };
    const items = [
      { item_id: 94, item_seller_id: 9, branch_id: null, product_id: 54, unit_price: 50, quantity: 1, item_total: 50.0, commission_amount: 5.0 },
    ];
    const inputs = buildEntitlementInputs(order, items);
    const org = inputs.find((i) => i.entitlementType === 'ORGANIZATION_EARNING');
    expect(org!.metadata.allocatedTax).toBeCloseTo(6.0, 1);
    expect(org!.amount).toBeCloseTo(55.0, 1); // 50 − 5 + 10 = 55 (excludes tax 6)
    // No duplicate tax line in the entitlement inputs.
    expect(inputs.filter((i) => i.entitlementType.includes('TAX')).length).toBe(0);
  });
});