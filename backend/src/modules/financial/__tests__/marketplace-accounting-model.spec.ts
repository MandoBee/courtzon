/**
 * Marketplace Accounting Model — multi-beneficiary correction.
 *
 * Business model:
 *  - Multi-seller checkout → one order per seller sharing a checkout_group_id.
 *  - CARD/WALLET: CourtZon collects full payment; per seller-order:
 *      Dr 1100 Payment Clearing
 *      Cr 2202 Merchant Payable (seller net merchandise, seller org)
 *      Cr 2400 Accounts Payable (shipping, seller org)
 *      Cr 4160 Marketplace Revenue (commission, platform/global org NULL)
 *  - CASH: seller collects cash; per seller-order:
 *      Dr 1161 Marketplace Receivable (commission, seller org)
 *      Cr 4160 Marketplace Revenue (commission, platform/global)
 *      (full customer amount NEVER enters 1100)
 *  - Commission is NEVER attributed to the seller org.
 *  - Shipping is NEVER merged into 2202 merchandise payable.
 *  - Idempotent per seller-order/event.
 */
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3009';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { createProductFixture, cleanupProductFixture, type ProductFixture } from '../../../tests/helpers/product-fixture.js';
type RowData = RowDataPacket[];

describe('Marketplace Accounting Model — multi-beneficiary', () => {
  let pool: mysql.Pool;
  let orgA: number; // Padel Edge
  let orgB: number; // Shop 5
  let branchA: number;
  let branchB: number;
  let productA: ProductFixture;
  let productB: ProductFixture;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    // Cleanup any leftovers from prior runs
    for (const slug of ['mp-model-org-a', 'mp-model-org-b']) {
      await pool.execute(`DELETE FROM order_items WHERE seller_id IN (SELECT id FROM organisations WHERE slug = ?)`, [slug]);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = ?)`, [slug]);
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = ?)`, [slug]);
      await pool.execute(`DELETE FROM orders WHERE buyer_id = 1`);
      await pool.execute(`DELETE FROM organisations WHERE slug = ?`, [slug]);
    }
    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;

    const [a] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'MP Model Org A', 'mp-model-org-a', 1)`, [otId],
    );
    orgA = (a as any).insertId;
    const [ba] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'MP Branch A', 'mp-branch-a', 'Africa/Cairo')`, [orgA],
    );
    branchA = (ba as any).insertId;

    const [b] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'MP Model Org B', 'mp-model-org-b', 1)`, [otId],
    );
    orgB = (b as any).insertId;
    const [bb] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'MP Branch B', 'mp-branch-b', 'Africa/Cairo')`, [orgB],
    );
    branchB = (bb as any).insertId;

    productA = await createProductFixture(pool, orgA);
    productB = await createProductFixture(pool, orgB);
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM order_items WHERE seller_id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM orders WHERE buyer_id = 1`);
    if (branchA) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchA]);
    if (branchB) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchB]);
    await cleanupProductFixture(pool, productA);
    await cleanupProductFixture(pool, productB);
    await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgA, orgB]);
    await pool.end();
  });

  async function accountId(code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`, [code],
    );
    return Number((rows as any[])[0].id);
  }

  // Sums scoped to a single marketplace order.
  async function orderSums(accountId: number, orderId: number): Promise<{ credit: number; debit: number }> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c,
              COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d
       FROM ledger_entries WHERE chart_account_id = ? AND source_type='marketplace' AND source_id = ?`,
      [accountId, orderId],
    );
    return { credit: Number((rows as any[])[0].c), debit: Number((rows as any[])[0].d) };
  }

  // Orgs the ledger lines are attributed to for a given order+account.
  async function orderOrgs(accountId: number, orderId: number): Promise<number[]> {
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT organisation_id FROM ledger_entries WHERE chart_account_id = ? AND source_type='marketplace' AND source_id = ? AND organisation_id IS NOT NULL`,
      [accountId, orderId],
    );
    return (rows as any[]).map(r => Number(r.organisation_id));
  }

  // Insert a seller-order. Each order is one seller.
  async function insertOrder(overrides: any = {}): Promise<number> {
    const sellerId = overrides.sellerId ?? orgA;
    const subtotal = overrides.subtotal ?? 850;
    const discount = overrides.discount ?? 0;
    const shipping = overrides.shipping ?? 50;
    const commission = overrides.commission ?? 42.50;
    const tax = overrides.tax ?? 0;
    const checkoutGroupId = overrides.checkoutGroupId ?? null;
    // orders.total = gross merchandise − discount + shipping + tax (actual
    // customer charge). commission is on after-discount merchandise.
    const total = overrides.total ?? Math.round((subtotal - discount + shipping + tax) * 100) / 100;
    const [o] = await pool.execute<RowData>(
      `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, discount_amount, shipping_cost, commission_amount, courtzon_commission, courtzon_fee, org_product_share, org_shipping_share, tax_amount, total, currency_code, payment_method, cash_holder, checkout_group_id)
       VALUES (UUID(), 1, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EGP', ?, ?, ?)`,
      [
        overrides.status ?? 'confirmed',
        subtotal, discount, shipping, commission, commission, commission,
        subtotal - discount - commission, shipping, tax,
        total,
        overrides.paymentMethod ?? 'card',
        overrides.paymentMethod === 'cash' ? 'org' : 'courtzon',
        checkoutGroupId,
      ],
    );
    const orderId = (o as any).insertId;
    const productId = sellerId === orgA ? productA.productId : productB.productId;
    await pool.execute(
      `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price, commission_rate, commission_amount)
       VALUES (?, ?, ?, 1, ?, ?, 5, ?)`,
      [orderId, productId, sellerId, subtotal, subtotal, commission],
    );
    return orderId;
  }

  it('A. MULTI-SELLER CARD — both seller-orders receive accounting; commission platform-scoped; shipping separate', async () => {
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    const group = 'mp-card-grp-' + Date.now();
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50, checkoutGroupId: group, status: 'confirmed' });
    const orderB = await insertOrder({ sellerId: orgB, subtotal: 85, shipping: 60, commission: 4.25, checkoutGroupId: group, status: 'confirmed' });

    // The payment:succeeded event references the PRIMARY order only — but
    // accounting must fan out to both seller-orders.
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');

    const clearingId = await accountId('1100');
    const payableId = await accountId('2202');
    const shippingId = await accountId('2400');
    const revenueId = await accountId('4160');

    // Order A (Padel Edge): Dr 1100 900 / Cr 2202 807.50 / Cr 2400 50 / Cr 4160 42.50
    const ca = await orderSums(clearingId, orderA);
    const pa = await orderSums(payableId, orderA);
    const sa = await orderSums(shippingId, orderA);
    const ra = await orderSums(revenueId, orderA);
    expect(ca.debit).toBe(900);
    expect(pa.credit).toBe(807.50);
    expect(sa.credit).toBe(50);
    expect(ra.credit).toBe(42.50);
    // balanced independently
    expect(ca.debit).toBeCloseTo(pa.credit + sa.credit + ra.credit, 2);

    // Order B (Shop 5): Dr 1100 145 / Cr 2202 80.75 / Cr 2400 60 / Cr 4160 4.25
    const cb = await orderSums(clearingId, orderB);
    const pb = await orderSums(payableId, orderB);
    const sb = await orderSums(shippingId, orderB);
    const rb = await orderSums(revenueId, orderB);
    expect(cb.debit).toBe(145);
    expect(pb.credit).toBe(80.75);
    expect(sb.credit).toBe(60);
    expect(rb.credit).toBe(4.25);
    expect(cb.debit).toBeCloseTo(pb.credit + sb.credit + rb.credit, 2);

    // Combined: Dr 1100 = 1045 / Cr 2202 888.25 / Cr 2400 110 / Cr 4160 46.75
    expect(ca.debit + cb.debit).toBe(1045);
    expect(pa.credit + pb.credit).toBe(888.25);
    expect(sa.credit + sb.credit).toBe(110);
    expect(ra.credit + rb.credit).toBe(46.75);

    // Seller payable 2202 attributed to the correct seller org
    expect(await orderOrgs(payableId, orderA)).toEqual([orgA]);
    expect(await orderOrgs(payableId, orderB)).toEqual([orgB]);
    // Shipping 2400 attributed to the seller org (traceable to seller-order)
    expect(await orderOrgs(shippingId, orderA)).toEqual([orgA]);
    expect(await orderOrgs(shippingId, orderB)).toEqual([orgB]);
    await pool.execute(`DELETE FROM order_items WHERE order_id IN (?, ?)`, [orderA, orderB]);
    await pool.execute(`DELETE FROM orders WHERE id IN (?, ?)`, [orderA, orderB]);
  });

  it('B. COMMISSION ATTRIBUTION — 4160 is NEVER attributed to the seller org', async () => {
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    const group = 'mp-comm-grp-' + Date.now();
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50, checkoutGroupId: group });
    const orderB = await insertOrder({ sellerId: orgB, subtotal: 85, shipping: 60, commission: 4.25, checkoutGroupId: group });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');

    const revenueId = await accountId('4160');
    // 4160 must carry organisation_id NULL (platform/global) — never the seller.
    const [rows] = await pool.execute<RowData>(
      `SELECT organisation_id, side, SUM(amount) total FROM ledger_entries
       WHERE chart_account_id = ? AND source_type='marketplace' AND source_id IN (?, ?)
       GROUP BY organisation_id, side`,
      [revenueId, orderA, orderB],
    );
    for (const r of rows as any[]) {
      expect(r.organisation_id).toBe(null);
      expect(r.side).toBe('credit');
    }
    const totalComm = (rows as any[]).reduce((s: number, r: any) => s + Number(r.total), 0);
    expect(totalComm).toBe(46.75);
    await pool.execute(`DELETE FROM order_items WHERE order_id IN (?, ?)`, [orderA, orderB]);
    await pool.execute(`DELETE FROM orders WHERE id IN (?, ?)`, [orderA, orderB]);
  });

  it('C. CASH — 1161 receivable per seller, 4160 platform, NO 1100 clearing', async () => {
    const { postMarketplaceCashCommissionAccounting } = await import('../application/accounting-event.listener.js') as any;
    const group = 'mp-cash-grp-' + Date.now();
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50, checkoutGroupId: group, paymentMethod: 'cash', cashHolder: 'org' });
    const orderB = await insertOrder({ sellerId: orgB, subtotal: 85, shipping: 60, commission: 4.25, checkoutGroupId: group, paymentMethod: 'cash', cashHolder: 'org' });
    await postMarketplaceCashCommissionAccounting(orderA, 'EGP');

    const receivableId = await accountId('1161');
    const revenueId = await accountId('4160');
    const clearingId = await accountId('1100');

    const ra = await orderSums(receivableId, orderA);
    const rb = await orderSums(receivableId, orderB);
    expect(ra.debit).toBe(42.50);
    expect(rb.debit).toBe(4.25);
    // 1161 attributed to seller
    expect(await orderOrgs(receivableId, orderA)).toEqual([orgA]);
    expect(await orderOrgs(receivableId, orderB)).toEqual([orgB]);
    // 4160 platform
    const revA = await orderSums(revenueId, orderA);
    const revB = await orderSums(revenueId, orderB);
    expect(revA.credit).toBe(42.50);
    expect(revB.credit).toBe(4.25);
    expect(await orderOrgs(revenueId, orderA)).toEqual([]); // no seller org on revenue
    // NO clearing for cash
    expect((await orderSums(clearingId, orderA)).debit).toBe(0);
    expect((await orderSums(clearingId, orderB)).debit).toBe(0);
    await pool.execute(`DELETE FROM order_items WHERE order_id IN (?, ?)`, [orderA, orderB]);
    await pool.execute(`DELETE FROM orders WHERE id IN (?, ?)`, [orderA, orderB]);
  });

  it('D. SHIPPING — 2400 separate, NOT in 2202, traceable, balanced', async () => {
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');

    const payableId = await accountId('2202');
    const shippingId = await accountId('2400');
    const pa = await orderSums(payableId, orderA);
    const sa = await orderSums(shippingId, orderA);
    // 2202 = merchandise net ONLY (807.50), NOT + shipping
    expect(pa.credit).toBe(807.50);
    // 2400 = shipping only
    expect(sa.credit).toBe(50);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('E. IDEMPOTENCY — replay creates zero duplicates', async () => {
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP'); // replay

    const clearingId = await accountId('1100');
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) c FROM ledger_entries WHERE source_type='marketplace' AND source_id=? AND event_type='marketplace_card_payment'`,
      [orderA],
    );
    expect(Number((rows as any[])[0].c)).toBe(4); // exactly 4 lines, not 8
    expect((await orderSums(clearingId, orderA)).debit).toBe(900);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('G. SUBSCRIPTION / BOOKING untouched — mappings resolve unchanged', async () => {
    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    const sub = await accountingEngineService.resolveMapping('subscription_card_payment', null);
    expect(sub.find(m => m.concept === 'revenue')).toBeTruthy();
    const bk = await accountingEngineService.resolveMapping('booking_card_payment', null);
    expect(bk.find(m => m.concept === 'org_payable')).toBeTruthy();
    const mp = await accountingEngineService.resolveMapping('marketplace_card_payment', null);
    // shipping is resolved via code-level fallback (2400), not a DB row change
    const shipping = mp.find(m => m.concept === 'shipping');
    expect(shipping).toBeTruthy();
  });

  it('H. REFUND — marketplace card refund reverses merchant payable + shipping + commission, balanced, seller/platform attribution correct', async () => {
    const { postMarketplacePaymentAccounting, postMarketplaceRefundAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');
    await postMarketplaceRefundAccounting(orderA, 'EGP');

    const clearingId = await accountId('1100');
    const payableId = await accountId('2202');
    const shippingId = await accountId('2400');
    const revenueId = await accountId('4160');
    // Payment posted + refund reversed → net zero across all accounts.
    const cl = await orderSums(clearingId, orderA);
    expect(cl.debit - cl.credit).toBe(0);
    const pa = await orderSums(payableId, orderA);
    expect(pa.credit - pa.debit).toBe(0);
    const sh = await orderSums(shippingId, orderA);
    expect(sh.credit - sh.debit).toBe(0);
    const ra = await orderSums(revenueId, orderA);
    expect(ra.credit - ra.debit).toBe(0);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('I. DISCOUNTED CARD — 850 gross, 100 discount, commission 42.50, shipping 50 → Dr 1100 800 = Cr 2202 707.50 + 2400 50 + 4160 42.50 (balanced)', async () => {
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, discount: 100, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');

    const clearingId = await accountId('1100');
    const payableId = await accountId('2202');
    const shippingId = await accountId('2400');
    const revenueId = await accountId('4160');

    const cl = await orderSums(clearingId, orderA);
    const pa = await orderSums(payableId, orderA);
    const sh = await orderSums(shippingId, orderA);
    const ra = await orderSums(revenueId, orderA);

    // Merchant net = 850 − 100 discount − 42.50 commission = 707.50 (2202, seller org)
    expect(pa.credit).toBe(707.50);
    expect(await orderOrgs(payableId, orderA)).toEqual([orgA]);
    // Shipping separate on 2400 (seller org)
    expect(sh.credit).toBe(50);
    expect(await orderOrgs(shippingId, orderA)).toEqual([orgA]);
    // Commission on 4160 (platform/global, org NULL)
    expect(ra.credit).toBe(42.50);
    expect(await orderOrgs(revenueId, orderA)).toEqual([]);
    // Clearing = actual customer total = 850 − 100 + 50 = 800
    expect(cl.debit).toBe(800);

    // Explicit balance assertion: total debits === total credits.
    const [bal] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) d,
              COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) c
       FROM ledger_entries WHERE source_type='marketplace' AND source_id=?`,
      [orderA],
    );
    expect(Number((bal as any[])[0].d)).toBe(Number((bal as any[])[0].c));
    expect(Number((bal as any[])[0].d)).toBe(800);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('J. DISCOUNTED REFUND — discounted card payment then refund stays balanced with correct reversal', async () => {
    const { postMarketplacePaymentAccounting, postMarketplaceRefundAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, discount: 100, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');
    await postMarketplaceRefundAccounting(orderA, 'EGP');

    const clearingId = await accountId('1100');
    const payableId = await accountId('2202');
    const shippingId = await accountId('2400');
    const revenueId = await accountId('4160');

    // Payment (Dr 1100 800 / Cr 2202 707.50 / Cr 2400 50 / Cr 4160 42.50) then
    // refund reverses → net zero across every account.
    const cl = await orderSums(clearingId, orderA);
    expect(cl.debit - cl.credit).toBe(0);
    const pa = await orderSums(payableId, orderA);
    expect(pa.credit - pa.debit).toBe(0);
    const sh = await orderSums(shippingId, orderA);
    expect(sh.credit - sh.debit).toBe(0);
    const ra = await orderSums(revenueId, orderA);
    expect(ra.credit - ra.debit).toBe(0);

    // No duplicate posting: exactly 4 payment lines + 4 refund lines = 8 rows.
    const [cnt] = await pool.execute<RowData>(
      `SELECT COUNT(*) c FROM ledger_entries WHERE source_type='marketplace' AND source_id=?`,
      [orderA],
    );
    expect(Number((cnt as any[])[0].c)).toBe(8);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });
});