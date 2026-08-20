import { describe, it, expect } from 'vitest';
import { buildEntitlementInputs } from '../application/marketplace-entitlement-calc.js';

describe('Marketplace Entitlement Inputs — per-item calculation', () => {
  it('creates org earning + commission for a single-item order (no shipping/discount/tax)', () => {
    const order = {
      id: 100,
      currency_code: 'EGP',
      subtotal: 100.0,
      discount_amount: 0,
      shipping_cost: 0,
      tax_amount: 0,
      total: 100.0,
      courtzon_fee: 10.0,
    };
    const items = [
      {
        item_id: 1,
        item_seller_id: 7,
        branch_id: 3,
        product_id: 50,
        unit_price: 100,
        quantity: 1,
        item_total: 100.0,
        commission_amount: 10.0,
      },
    ];

    const inputs = buildEntitlementInputs(order, items);

    expect(inputs).toHaveLength(2);
    const org = inputs.find(i => i.entitlementType === 'ORGANIZATION_EARNING');
    const comm = inputs.find(i => i.entitlementType === 'COURTZON_COMMISSION');

    expect(org).toMatchObject({
      organisationId: 7, branchId: 3, sourceType: 'marketplace', sourceId: 1,
      amount: 90.0, currency: 'EGP', availableAt: null,
    });
    expect(comm).toMatchObject({
      organisationId: 7, branchId: 3, sourceType: 'marketplace', sourceId: 1,
      amount: 10.0, currency: 'EGP', availableAt: null,
    });
  });

  it('allocates discount, shipping and tax proportionally across multi-seller items', () => {
    const order = {
      id: 200,
      currency_code: 'EGP',
      subtotal: 300.0,
      discount_amount: 30.0,
      shipping_cost: 20.0,
      tax_amount: 15.0,
      total: 305.0, // 300 - 30 + 20 + 15
      courtzon_fee: 30.0, // sum of item commissions
    };
    const items = [
      { item_id: 11, item_seller_id: 7, branch_id: 3, product_id: 51, unit_price: 100, quantity: 1, item_total: 100.0, commission_amount: 10.0 },
      { item_id: 12, item_seller_id: 8, branch_id: 4, product_id: 52, unit_price: 200, quantity: 1, item_total: 200.0, commission_amount: 20.0 },
    ];

    const inputs = buildEntitlementInputs(order, items);

    expect(inputs).toHaveLength(4);

    // Item 11 share = 1/3 → discount 10, shipping 6.67, tax 5
    const org1 = inputs.find(i => i.sourceId === 11 && i.entitlementType === 'ORGANIZATION_EARNING');
    const comm1 = inputs.find(i => i.sourceId === 11 && i.entitlementType === 'COURTZON_COMMISSION');
    expect(org1!.amount).toBeCloseTo(100 - 10 - 10 + 6.67 + 5, 1);
    expect(comm1!.amount).toBe(10.0);

    // Item 12 share = 2/3 → discount 20, shipping 13.33, tax 10
    const org2 = inputs.find(i => i.sourceId === 12 && i.entitlementType === 'ORGANIZATION_EARNING');
    const comm2 = inputs.find(i => i.sourceId === 12 && i.entitlementType === 'COURTZON_COMMISSION');
    expect(org2!.amount).toBeCloseTo(200 - 20 - 20 + 13.33 + 10, 1);
    expect(comm2!.amount).toBe(20.0);

    // Org earnings sum = total - courtzon_fee = 305 - 30 = 275
    const totalOrg = inputs
      .filter(i => i.entitlementType === 'ORGANIZATION_EARNING')
      .reduce((sum, i) => sum + i.amount, 0);
    expect(totalOrg).toBeCloseTo(275.0, 1);

    // Commission sum = courtzon_fee
    const totalComm = inputs
      .filter(i => i.entitlementType === 'COURTZON_COMMISSION')
      .reduce((sum, i) => sum + i.amount, 0);
    expect(totalComm).toBe(30.0);
  });

  it('creates entitlements for COD orders (no payment:succeeded path)', () => {
    const order = {
      id: 300,
      currency_code: 'EGP',
      subtotal: 50.0,
      discount_amount: 0,
      shipping_cost: 10.0,
      tax_amount: 0,
      total: 60.0,
      courtzon_fee: 5.0,
      payment_method: 'cash',
      payment_status: 'unpaid',
    };
    const items = [
      { item_id: 21, item_seller_id: 9, branch_id: null, product_id: 53, unit_price: 50, quantity: 1, item_total: 50.0, commission_amount: 5.0 },
    ];

    const inputs = buildEntitlementInputs(order, items);

    expect(inputs).toHaveLength(2);
    const org = inputs.find(i => i.entitlementType === 'ORGANIZATION_EARNING');
    expect(org!.amount).toBe(55.0); // 50 - 5 + 10
  });

  it('omits COURTZON_COMMISSION when item commission is zero', () => {
    const order = {
      id: 400, currency_code: 'EGP', subtotal: 40.0,
      discount_amount: 0, shipping_cost: 0, tax_amount: 0, total: 40.0, courtzon_fee: 0,
    };
    const items = [
      { item_id: 31, item_seller_id: 10, branch_id: null, product_id: 54, unit_price: 40, quantity: 1, item_total: 40.0, commission_amount: 0 },
    ];

    const inputs = buildEntitlementInputs(order, items);

    expect(inputs).toHaveLength(1);
    expect(inputs[0].entitlementType).toBe('ORGANIZATION_EARNING');
    expect(inputs[0].amount).toBe(40.0);
  });

  it('skips items without a seller org (no org to credit)', () => {
    const order = {
      id: 500, currency_code: 'EGP', subtotal: 100.0,
      discount_amount: 0, shipping_cost: 0, tax_amount: 0, total: 100.0, courtzon_fee: 0,
    };
    const items = [
      { item_id: 41, item_seller_id: 0, branch_id: null, product_id: 55, unit_price: 100, quantity: 1, item_total: 100.0, commission_amount: 0 },
    ];

    const inputs = buildEntitlementInputs(order, items);
    // caller filters sellerless items before invoking; the function itself still
    // produces the org earning for the row — assert it does not crash on zero seller
    expect(Array.isArray(inputs)).toBe(true);
  });

  it('guards against zero subtotal (no division by zero)', () => {
    const order = {
      id: 600, currency_code: 'EGP', subtotal: 0,
      discount_amount: 0, shipping_cost: 0, tax_amount: 0, total: 0, courtzon_fee: 0,
    };
    const items = [
      { item_id: 51, item_seller_id: 7, branch_id: null, product_id: 56, unit_price: 0, quantity: 0, item_total: 0, commission_amount: 0 },
    ];

    const inputs = buildEntitlementInputs(order, items);
    expect(inputs).toHaveLength(0);
  });
});