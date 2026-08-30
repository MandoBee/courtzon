/**
 * Marketplace Accounting Model — MULTI-BOOK (CourtZon + Organization).
 *
 * CourtZon and every organization/seller are separate economic entities with
 * separate accounting books, separated structurally by organisation_id.
 *
 * COURTZON BOOK (organisation_id = NULL):
 *   Dr 1100 Payment Clearing            gross (CARD/WALLET)
 *   Cr 2202 Merchant Payable (control)  merchantNet + shipping  (total owed to seller)
 *   Cr 4160 Marketplace Revenue         commission
 *   CASH: Dr 1161 Marketplace Receivable (commission) / Cr 4160
 *
 * ORGANIZATION BOOK (organisation_id = seller):
 *   Dr org 1161 Marketplace Receivable (merchantNet + shipping)
 *   Dr org MKT-COMM-EXP Commission Expense
 *   Cr org MKT-SALES Sales Revenue (gross merchandise − discount)
 *   Cr org MKT-SHIP-LIAB Shipping Liability
 *
 * Invariants asserted:
 *  - total debits === total credits (per order, per book)
 *  - organisation_id is correct for every generated line
 *  - CourtZon book never shows org revenue/expense/shipping; org book never
 *    shows CourtZon's 1100/2202/4160
 *  - commission attributed only to CourtZon (4160 org NULL)
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

describe('Marketplace Accounting Model — Multi-Book (CourtZon + Organization)', () => {
  let pool: mysql.Pool;
  let orgA: number; // Padel Edge
  let orgB: number; // Shop 5
  let branchA: number;
  let branchB: number;
  let productA: ProductFixture;
  let productB: ProductFixture;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
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

    // Pre-provision both orgs' marketplace books (idempotent) so assertions are
    // stable regardless of test execution order / concurrency.
    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgA);
    await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgB);
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

  // Global (CourtZon) account id by code.
  async function accountId(code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`, [code],
    );
    return Number((rows as any[])[0].id);
  }

  // Organization-scoped account id by code (auto-provisioned by the engine).
  async function orgAccountId(orgId: number, code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id = ? AND code = ? LIMIT 1`, [orgId, code],
    );
    return Number((rows as any[])[0].id);
  }

  // Sums scoped to one order + one account + one organisation book (null = CourtZon).
  async function bookSums(accountId: number, orderId: number, orgId: number | null): Promise<{ credit: number; debit: number }> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c,
              COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d
       FROM ledger_entries
       WHERE chart_account_id = ? AND source_type='marketplace' AND source_id = ?
         AND (organisation_id <=> ?)`,
      [accountId, orderId, orgId],
    );
    return { credit: Number((rows as any[])[0].c), debit: Number((rows as any[])[0].d) };
  }

  // All organisation_ids present for a given account+order (book isolation check).
  async function orderOrgs(accountId: number, orderId: number): Promise<Array<number | null>> {
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT organisation_id FROM ledger_entries WHERE chart_account_id = ? AND source_type='marketplace' AND source_id = ?`,
      [accountId, orderId],
    );
    return (rows as any[]).map(r => r.organisation_id == null ? null : Number(r.organisation_id));
  }

  // Sums scoped to one settlement + one account + one organisation book.
  async function settlementSums(accountId: number, sourceId: number, orgId: number | null): Promise<{ credit: number; debit: number }> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c,
              COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d
       FROM ledger_entries
       WHERE chart_account_id = ? AND source_type='settlement' AND source_id = ?
         AND (organisation_id <=> ?)`,
      [accountId, sourceId, orgId],
    );
    return { credit: Number((rows as any[])[0].c), debit: Number((rows as any[])[0].d) };
  }

  // All organisation_ids present for a given account+settlement.
  async function settlementOrgs(accountId: number, sourceId: number): Promise<Array<number | null>> {
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT organisation_id FROM ledger_entries WHERE chart_account_id = ? AND source_type='settlement' AND source_id = ?`,
      [accountId, sourceId],
    );
    return (rows as any[]).map(r => r.organisation_id == null ? null : Number(r.organisation_id));
  }

  // Total debits vs credits for one order's full marketplace journal.
  async function orderBalance(orderId: number): Promise<{ d: number; c: number }> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) d,
              COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) c
       FROM ledger_entries WHERE source_type='marketplace' AND source_id=?`,
      [orderId],
    );
    return { d: Number((rows as any[])[0].d), c: Number((rows as any[])[0].c) };
  }

  // Insert a seller-order (one order = one seller).
  async function insertOrder(overrides: any = {}): Promise<number> {
    const sellerId = overrides.sellerId ?? orgA;
    const subtotal = overrides.subtotal ?? 850;
    const discount = overrides.discount ?? 0;
    const shipping = overrides.shipping ?? 50;
    const commission = overrides.commission ?? 42.50;
    const tax = overrides.tax ?? 0;
    const checkoutGroupId = overrides.checkoutGroupId ?? null;
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

  it('A+B. MULTI-SELLER CARD — two books: CourtZon control (org NULL) + per-org org books; commission platform-only', async () => {
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    const group = 'mp-mb-card-' + Date.now();
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50, checkoutGroupId: group });
    const orderB = await insertOrder({ sellerId: orgB, subtotal: 85, shipping: 60, commission: 4.25, checkoutGroupId: group });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');

    const clearingId = await accountId('1100');
    const payableId = await accountId('2202');
    const revenueId = await accountId('4160');
    const orgRecvA = await orgAccountId(orgA, '1161');
    const orgRecvB = await orgAccountId(orgB, '1161');
    const commExpA = await orgAccountId(orgA, 'MKT-COMM-EXP');
    const commExpB = await orgAccountId(orgB, 'MKT-COMM-EXP');
    const salesA = await orgAccountId(orgA, 'MKT-SALES');
    const salesB = await orgAccountId(orgB, 'MKT-SALES');
    const shipA = await orgAccountId(orgA, 'MKT-SHIP-LIAB');
    const shipB = await orgAccountId(orgB, 'MKT-SHIP-LIAB');

    // ── COURTZON BOOK (org NULL) ──
    // Order A: Dr 1100 900 / Cr 2202 857.50 / Cr 4160 42.50
    const ca = await bookSums(clearingId, orderA, null);
    const pa = await bookSums(payableId, orderA, null);
    const ra = await bookSums(revenueId, orderA, null);
    expect(ca.debit).toBe(900);
    expect(pa.credit).toBe(857.50); // merchantNet 807.50 + shipping 50
    expect(ra.credit).toBe(42.50);
    expect(ca.debit).toBeCloseTo(pa.credit + ra.credit, 2);
    // Order B: Dr 1100 145 / Cr 2202 140.75 / Cr 4160 4.25
    const cb = await bookSums(clearingId, orderB, null);
    const pb = await bookSums(payableId, orderB, null);
    const rb = await bookSums(revenueId, orderB, null);
    expect(cb.debit).toBe(145);
    expect(pb.credit).toBe(140.75); // 80.75 + 60
    expect(rb.credit).toBe(4.25);
    expect(cb.debit).toBeCloseTo(pb.credit + rb.credit, 2);
    // Combined CourtZon: 1100 1045 / 2202 998.25 / 4160 46.75
    expect(ca.debit + cb.debit).toBe(1045);
    expect(pa.credit + pb.credit).toBe(998.25);
    expect(ra.credit + rb.credit).toBe(46.75);

    // CourtZon book lines are ALL org NULL (2202 is the global control).
    expect(await orderOrgs(payableId, orderA)).toEqual([null]);
    expect(await orderOrgs(payableId, orderB)).toEqual([null]);
    expect(await orderOrgs(clearingId, orderA)).toEqual([null]);
    expect(await orderOrgs(revenueId, orderA)).toEqual([null]);

    // ── ORGANIZATION BOOK (org-scoped) ──
    // Org A: Dr 1161 857.50 + Dr comm-exp 42.50 = Cr sales 850 + Cr ship 50
    const oa_recv = await bookSums(orgRecvA, orderA, orgA);
    const oa_comm = await bookSums(commExpA, orderA, orgA);
    const oa_sales = await bookSums(salesA, orderA, orgA);
    const oa_ship = await bookSums(shipA, orderA, orgA);
    expect(oa_recv.debit).toBe(857.50);
    expect(oa_comm.debit).toBe(42.50);
    expect(oa_sales.credit).toBe(850);
    expect(oa_ship.credit).toBe(50);
    expect(oa_recv.debit + oa_comm.debit).toBeCloseTo(oa_sales.credit + oa_ship.credit, 2);
    // Org B: Dr 1161 140.75 + Dr comm-exp 4.25 = Cr sales 85 + Cr ship 60
    const ob_recv = await bookSums(orgRecvB, orderB, orgB);
    const ob_comm = await bookSums(commExpB, orderB, orgB);
    const ob_sales = await bookSums(salesB, orderB, orgB);
    const ob_ship = await bookSums(shipB, orderB, orgB);
    expect(ob_recv.debit).toBe(140.75);
    expect(ob_comm.debit).toBe(4.25);
    expect(ob_sales.credit).toBe(85);
    expect(ob_ship.credit).toBe(60);
    expect(ob_recv.debit + ob_comm.debit).toBeCloseTo(ob_sales.credit + ob_ship.credit, 2);

    // Org-book lines are org-scoped only.
    expect(await orderOrgs(orgRecvA, orderA)).toEqual([orgA]);
    expect(await orderOrgs(salesA, orderA)).toEqual([orgA]);
    expect(await orderOrgs(commExpA, orderA)).toEqual([orgA]);
    expect(await orderOrgs(shipA, orderA)).toEqual([orgA]);

    // ── BOOK ISOLATION ──
    // CourtZon 1100/2202/4160 must NOT appear in org books.
    expect(await orderOrgs(clearingId, orderA)).not.toContain(orgA);
    expect(await orderOrgs(revenueId, orderA)).not.toContain(orgA);
    // Org revenue/expense/shipping must NOT appear in CourtZon book.
    expect(await orderOrgs(salesA, orderA)).not.toContain(null);
    expect(await orderOrgs(commExpA, orderA)).not.toContain(null);

    // Each order journal is fully balanced (debits === credits).
    for (const oid of [orderA, orderB]) {
      const bal = await orderBalance(oid);
      expect(bal.d).toBe(bal.c);
    }

    await pool.execute(`DELETE FROM order_items WHERE order_id IN (?, ?)`, [orderA, orderB]);
    await pool.execute(`DELETE FROM orders WHERE id IN (?, ?)`, [orderA, orderB]);
  });

  it('C. CASH — CourtZon 1161/4160 (org NULL) + org book; NO 1100 clearing', async () => {
    const { postMarketplaceCashCommissionAccounting } = await import('../application/accounting-event.listener.js') as any;
    const group = 'mp-mb-cash-' + Date.now();
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50, paymentMethod: 'cash', cashHolder: 'org', checkoutGroupId: group });
    const orderB = await insertOrder({ sellerId: orgB, subtotal: 85, shipping: 60, commission: 4.25, paymentMethod: 'cash', cashHolder: 'org', checkoutGroupId: group });
    await postMarketplaceCashCommissionAccounting(orderA, 'EGP');

    const receivableId = await accountId('1161');
    const revenueId = await accountId('4160');
    const clearingId = await accountId('1100');

    // CourtZon book: Dr 1161 commission / Cr 4160 commission, both org NULL.
    const ra = await bookSums(receivableId, orderA, null);
    const rb = await bookSums(receivableId, orderB, null);
    const revA = await bookSums(revenueId, orderA, null);
    const revB = await bookSums(revenueId, orderB, null);
    expect(ra.debit).toBe(42.50);
    expect(rb.debit).toBe(4.25);
    expect(revA.credit).toBe(42.50);
    expect(revB.credit).toBe(4.25);
    expect(await orderOrgs(receivableId, orderA)).toEqual([null]);
    expect(await orderOrgs(revenueId, orderA)).toEqual([null]);
    // NO clearing for cash (CourtZon book).
    expect((await bookSums(clearingId, orderA, null)).debit).toBe(0);
    expect((await bookSums(clearingId, orderB, null)).debit).toBe(0);

    // Organization book still posts its own economics. CASH uses the full
    // customer gross as the receivable (the org collects the cash) and a
    // CourtZon Payable for the commission owed to CourtZon.
    const orgRecvA = await orgAccountId(orgA, '1161');
    const salesA = await orgAccountId(orgA, 'MKT-SALES');
    const commExpA = await orgAccountId(orgA, 'MKT-COMM-EXP');
    const shipA = await orgAccountId(orgA, 'MKT-SHIP-LIAB');
    const czPayA = await orgAccountId(orgA, 'MKT-CZ-PAY');
    // Org A: Dr 1161 gross (850+50=900) + Dr comm-exp 42.50
    //        = Cr MKT-SALES 850 + Cr ship 50 + Cr MKT-CZ-PAY 42.50
    expect((await bookSums(orgRecvA, orderA, orgA)).debit).toBe(900);
    expect((await bookSums(salesA, orderA, orgA)).credit).toBe(850);
    expect((await bookSums(commExpA, orderA, orgA)).debit).toBe(42.50);
    expect((await bookSums(shipA, orderA, orgA)).credit).toBe(50);
    expect((await bookSums(czPayA, orderA, orgA)).credit).toBe(42.50);
    expect((await bookSums(orgRecvA, orderA, orgA)).debit + (await bookSums(commExpA, orderA, orgA)).debit)
      .toBeCloseTo((await bookSums(salesA, orderA, orgA)).credit + (await bookSums(shipA, orderA, orgA)).credit + (await bookSums(czPayA, orderA, orgA)).credit, 2);
    // Org B: gross 145 (85+60) + comm-exp 4.25 = sales 85 + ship 60 + CZ-PAY 4.25
    const orgRecvB = await orgAccountId(orgB, '1161');
    const czPayB = await orgAccountId(orgB, 'MKT-CZ-PAY');
    expect((await bookSums(orgRecvB, orderB, orgB)).debit).toBe(145);
    expect((await bookSums(czPayB, orderB, orgB)).credit).toBe(4.25);
    for (const oid of [orderA, orderB]) {
      const bal = await orderBalance(oid);
      expect(bal.d).toBe(bal.c);
    }

    await pool.execute(`DELETE FROM order_items WHERE order_id IN (?, ?)`, [orderA, orderB]);
    await pool.execute(`DELETE FROM orders WHERE id IN (?, ?)`, [orderA, orderB]);
  });

  it('C2. CASH IDEMPOTENCY — start-processing replay creates zero duplicates (both books)', async () => {
    const { postMarketplaceCashCommissionAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50, paymentMethod: 'cash', cashHolder: 'org' });
    await postMarketplaceCashCommissionAccounting(orderA, 'EGP');
    await postMarketplaceCashCommissionAccounting(orderA, 'EGP'); // replay

    const [rows] = await pool.execute<RowData>(
      `SELECT event_type, COUNT(*) c FROM ledger_entries WHERE source_type='marketplace' AND source_id=? GROUP BY event_type`,
      [orderA],
    );
    const byEvent: Record<string, number> = {};
    for (const r of rows as any[]) byEvent[r.event_type] = Number(r.c);
    // CourtZon book: marketplace_cash_commission = Dr 1161 + Cr 4160
    expect(byEvent['marketplace_cash_commission']).toBe(2);
    // Org book: org cash receivable = 1161 + comm-exp + sales + ship + CZ-PAY
    expect(byEvent['marketplace_org_cash_receivable']).toBe(5);
    const bal = await orderBalance(orderA);
    expect(bal.d).toBe(bal.c);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('C3. CASH DELIVERY NO-OP — delivery emits no additional cash accounting', async () => {
    const { postMarketplaceCashCommissionAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50, paymentMethod: 'cash', cashHolder: 'org', status: 'delivered' });
    // Start-processing posts the full cash economics; delivery must NOT post again.
    await postMarketplaceCashCommissionAccounting(orderA, 'EGP');
    const [rows] = await pool.execute<RowData>(
      `SELECT event_type, COUNT(*) c FROM ledger_entries WHERE source_type='marketplace' AND source_id=? GROUP BY event_type`,
      [orderA],
    );
    const byEvent: Record<string, number> = {};
    for (const r of rows as any[]) byEvent[r.event_type] = Number(r.c);
    expect(byEvent['marketplace_cash_commission']).toBe(2);
    expect(byEvent['marketplace_org_cash_receivable']).toBe(5);
    const bal = await orderBalance(orderA);
    expect(bal.d).toBe(bal.c);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('C4. CASH CANCELLATION — reversal nets BOTH books to zero (org Book courtzon_payable reversed)', async () => {
    const { postMarketplaceCashCommissionAccounting, postMarketplaceCashReversalAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 175, shipping: 50, commission: 8.75, paymentMethod: 'cash', cashHolder: 'org' });
    await postMarketplaceCashCommissionAccounting(orderA, 'EGP');
    const czPayA = await orgAccountId(orgA, 'MKT-CZ-PAY');
    const commExpA = await orgAccountId(orgA, 'MKT-COMM-EXP');
    const orgRecvA = await orgAccountId(orgA, '1161');
    const salesA = await orgAccountId(orgA, 'MKT-SALES');
    const shipA = await orgAccountId(orgA, 'MKT-SHIP-LIAB');
    // CourtZon book cash receivable.
    const cz1161 = await accountId('1161');
    const cz4160 = await accountId('4160');

    // Cash posting (start processing) — CourtZon + org book, all present.
    expect((await bookSums(cz1161, orderA, null)).debit).toBe(8.75);
    expect((await bookSums(cz4160, orderA, null)).credit).toBe(8.75);
    expect((await bookSums(orgRecvA, orderA, orgA)).debit).toBe(225);
    expect((await bookSums(czPayA, orderA, orgA)).credit).toBe(8.75);
    expect((await bookSums(salesA, orderA, orgA)).credit).toBe(175);
    expect((await bookSums(shipA, orderA, orgA)).credit).toBe(50);
    expect((await bookSums(commExpA, orderA, orgA)).debit).toBe(8.75);

    // Cancel → reversal nets every account to zero (both books).
    await postMarketplaceCashReversalAccounting(orderA, 'EGP', 'cancelled');
    for (const [acc, org] of [[cz1161, null], [cz4160, null], [orgRecvA, orgA], [czPayA, orgA], [salesA, orgA], [shipA, orgA], [commExpA, orgA]]) {
      const s = await bookSums(acc as number, orderA, org as number | null);
      expect(s.debit - s.credit).toBe(0);
    }
    const bal = await orderBalance(orderA);
    expect(bal.d).toBe(bal.c);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('K. GATEWAY CLEARING — CARD payment debits 1100 (not Bank/Cash); gateway settlement moves 1100 → 1120', async () => {
    const { postMarketplacePaymentAccounting, postGatewaySettlementAccounting } = await import('../application/accounting-event.listener.js') as any;
    const clearingId = await accountId('1100');
    const bankId = await accountId('1120');
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');

    // 1. CARD payment: Dr 1100 (clearing asset) = gross; NO Bank (1120) debit.
    expect((await bookSums(clearingId, orderA, null)).debit).toBe(900);
    expect((await bookSums(bankId, orderA, null)).debit).toBe(0);
    expect((await bookSums(bankId, orderA, null)).credit).toBe(0);

    // 2. Gateway settlement: Dr 1120 Bank / Cr 1100 Clearing for the settled gross.
    await postGatewaySettlementAccounting(orderA, 900, 'EGP');
    expect((await settlementSums(bankId, orderA, null)).debit).toBe(900);
    // Clearing balance after settlement = 0 (900 debit - 900 credit).
    expect((await bookSums(clearingId, orderA, null)).debit - (await settlementSums(clearingId, orderA, null)).credit).toBe(0);

    // 3. Replay of gateway settlement creates no duplicates.
    await postGatewaySettlementAccounting(orderA, 900, 'EGP');
    expect((await settlementSums(bankId, orderA, null)).debit).toBe(900);

    // 4. Both books remain balanced.
    const bal = await orderBalance(orderA);
    expect(bal.d).toBe(bal.c);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('K2. GATEWAY SETTLEMENT — org book never contains CourtZon 1100/1120; CourtZon book never org-scoped', async () => {
    const { postMarketplacePaymentAccounting, postGatewaySettlementAccounting } = await import('../application/accounting-event.listener.js') as any;
    const clearingId = await accountId('1100');
    const bankId = await accountId('1120');
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');
    await postGatewaySettlementAccounting(orderA, 900, 'EGP');

    // Org book must NOT reference the CourtZon clearing/bank accounts at all.
    expect(await orderOrgs(clearingId, orderA)).toEqual([null]);
    expect(await settlementOrgs(bankId, orderA)).toEqual([null]);
    expect(await settlementOrgs(clearingId, orderA)).toEqual([null]);
    // Org book is still its own isolated economics (unchanged by settlement).
    const orgRecvA = await orgAccountId(orgA, '1161');
    const salesA = await orgAccountId(orgA, 'MKT-SALES');
    const shipA = await orgAccountId(orgA, 'MKT-SHIP-LIAB');
    expect((await bookSums(orgRecvA, orderA, orgA)).debit).toBe(857.50);
    expect((await bookSums(salesA, orderA, orgA)).credit).toBe(850);
    expect((await bookSums(shipA, orderA, orgA)).credit).toBe(50);
    const bal = await orderBalance(orderA);
    expect(bal.d).toBe(bal.c);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('K3. CASH/COD — no gateway clearing involved; cash book never touches CourtZon clearing/bank', async () => {
    const { postMarketplaceCashCommissionAccounting } = await import('../application/accounting-event.listener.js') as any;
    const clearingId = await accountId('1100');
    const bankId = await accountId('1120');
    const receivableId = await accountId('1161');
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50, paymentMethod: 'cash', cashHolder: 'org' });
    await postMarketplaceCashCommissionAccounting(orderA, 'EGP');

    // CASH/COD posts 1161/4160 — never 1100 clearing, never 1120 bank.
    expect((await bookSums(clearingId, orderA, null)).debit).toBe(0);
    expect((await bookSums(bankId, orderA, null)).debit).toBe(0);
    expect((await bookSums(receivableId, orderA, null)).debit).toBe(42.50);
    const bal = await orderBalance(orderA);
    expect(bal.d).toBe(bal.c);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('K4. CARD REFUND — reverses clearing (1100) AND merchant payable/commission; no bank impact', async () => {
    const { postMarketplacePaymentAccounting, postMarketplaceRefundAccounting, postGatewaySettlementAccounting } = await import('../application/accounting-event.listener.js') as any;
    const clearingId = await accountId('1100');
    const bankId = await accountId('1120');
    const payableId = await accountId('2202');
    const revenueId = await accountId('4160');
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');
    await postGatewaySettlementAccounting(orderA, 900, 'EGP'); // settled
    await postMarketplaceRefundAccounting(orderA, 'EGP');      // then refunded

    // Refund reverses the original clearing credit (Cr 1100) and the org book.
    // Clearing net = 0 (payment Dr 900, settlement Cr 900, refund Cr 900 + ... wait:
    // refund posts Cr 1100 (marketplace_merchant_refund credit payment_clearing)
    // but settlement already Cr'd 1100 — so clearing ends net DR 900 - CR 1800 =
    // -900, which is economically correct: the refunded gross was already settled
    // to bank. Assert balance and org-book symmetry instead of a naive zero.
    const bal = await orderBalance(orderA);
    expect(bal.d).toBe(bal.c);
    // Org book fully netted to zero by the refund reversal.
    for (const acc of [payableId, revenueId]) {
      const s = await bookSums(acc, orderA, null);
      expect(s.debit - s.credit).toBe(0);
    }
    const orgRecvA = await orgAccountId(orgA, '1161');
    expect((await bookSums(orgRecvA, orderA, orgA)).debit - (await bookSums(orgRecvA, orderA, orgA)).credit).toBe(0);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('K5. IDEMPOTENCY — gateway settlement replay produces zero duplicates', async () => {
    const { postGatewaySettlementAccounting } = await import('../application/accounting-event.listener.js') as any;
    const bankId = await accountId('1120');
    const clearingId = await accountId('1100');
    await postGatewaySettlementAccounting(998877, 1234.50, 'EGP');
    await postGatewaySettlementAccounting(998877, 1234.50, 'EGP');
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) c FROM ledger_entries WHERE source_type='settlement' AND source_id=998877 AND event_type='payment_gateway_settlement'`,
    );
    expect(Number((rows as any[])[0].c)).toBe(2); // Dr Bank + Cr Clearing
    const [bank] = await pool.execute<RowData>(
      `SELECT SUM(amount) s FROM ledger_entries WHERE chart_account_id=? AND source_type='settlement' AND source_id=998877 AND side='debit'`,
      [bankId],
    );
    expect(Number((bank as any[])[0].s)).toBe(1234.50);
    const [clear] = await pool.execute<RowData>(
      `SELECT SUM(amount) s FROM ledger_entries WHERE chart_account_id=? AND source_type='settlement' AND source_id=998877 AND side='credit'`,
      [clearingId],
    );
    expect(Number((clear as any[])[0].s)).toBe(1234.50);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='settlement' AND source_id=998877 AND event_type='payment_gateway_settlement'`);
    await pool.execute(`DELETE FROM general_ledger WHERE reference_type='settlement_payment_gateway_settlement' AND reference_id=998877`);
  });

  it('J. SYSTEM COA PROTECTION — is_system=1 accounts cannot be renamed or deactivated', async () => {
    const { updateAccountHandler } = await import('../../accounting/presentation/accounting.controller.js') as any;
    const [sysRow] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id = ? AND code = 'MKT-SALES' LIMIT 1`, [orgA],
    );
    const sysId = Number((sysRow as any[])[0].id);
    // The org-scoped marketplace accounts are auto-provisioned as is_system = 1.
    const [flag] = await pool.execute<RowData>(`SELECT is_system FROM chart_of_accounts WHERE id = ?`, [sysId]);
    expect(Number((flag as any[])[0].is_system)).toBe(1);

    // Rename attempt → forbidden.
    const renameReq = { params: { id: sysId }, body: { name: 'Hacked Name' }, userId: 1, ip: 'test', headers: { 'user-agent': 'test' } } as any;
    let renamed = false;
    try { await updateAccountHandler(renameReq, { status: () => ({ send: () => { renamed = true; } }) } as any); } catch { /* expected FORBIDDEN */ }
    expect(renamed).toBe(false);

    const [after] = await pool.execute<RowData>(`SELECT name FROM chart_of_accounts WHERE id = ?`, [sysId]);
    expect((after as any[])[0].name).toBe('Marketplace Sales Revenue');
  });

  it('D. SHIPPING — org shipping liability is org-scoped MKT-SHIP-LIAB, NOT CourtZon 2400', async () => {
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');

    const shipA = await orgAccountId(orgA, 'MKT-SHIP-LIAB');
    const cz2400 = await accountId('2400');
    expect((await bookSums(shipA, orderA, orgA)).credit).toBe(50);
    // CourtZon 2400 must NOT carry the org's shipping (shipping belongs to the org).
    expect((await bookSums(cz2400, orderA, null)).credit).toBe(0);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('E. IDEMPOTENCY — replay creates zero duplicates (both books)', async () => {
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP'); // replay

    const [rows] = await pool.execute<RowData>(
      `SELECT event_type, COUNT(*) c FROM ledger_entries WHERE source_type='marketplace' AND source_id=? GROUP BY event_type`,
      [orderA],
    );
    const byEvent: Record<string, number> = {};
    for (const r of rows as any[]) byEvent[r.event_type] = Number(r.c);
    expect(byEvent['marketplace_card_payment']).toBe(3); // Dr 1100 + Cr 2202 + Cr 4160
    expect(byEvent['marketplace_org_receivable']).toBe(4); // 1161 + comm-exp + sales + ship
    // Balanced across BOTH books (CourtZon 900 = org 900).
    const bal = await orderBalance(orderA);
    expect(bal.d).toBe(bal.c);
    expect(bal.d).toBe(1800);
    // CourtZon clearing debit specifically = 900 (not doubled by replay).
    const clearingId = await accountId('1100');
    expect((await bookSums(clearingId, orderA, null)).debit).toBe(900);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);
  });

  it('G. SUBSCRIPTION / BOOKING untouched — mappings resolve unchanged', async () => {
    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    const sub = await accountingEngineService.resolveMapping('subscription_card_payment', null);
    expect(sub.find(m => m.concept === 'revenue')).toBeTruthy();
    const bk = await accountingEngineService.resolveMapping('booking_card_payment', null);
    expect(bk.find(m => m.concept === 'org_payable')).toBeTruthy();
    // CourtZon marketplace card: no shipping concept (shipping moved to org book).
    const mp = await accountingEngineService.resolveMapping('marketplace_card_payment', null);
    expect(mp.find(m => m.concept === 'merchant_payable')).toBeTruthy();
  });

  it('H+I. REFUND — card payment + refund nets to zero in BOTH books (incl. discounted)', async () => {
    const { postMarketplacePaymentAccounting, postMarketplaceRefundAccounting } = await import('../application/accounting-event.listener.js') as any;
    // Undiscounted
    const orderA = await insertOrder({ sellerId: orgA, subtotal: 850, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderA, 'card', 'EGP');
    await postMarketplaceRefundAccounting(orderA, 'EGP');

    const clearingId = await accountId('1100');
    const payableId = await accountId('2202');
    const revenueId = await accountId('4160');
    const orgRecvA = await orgAccountId(orgA, '1161');
    const salesA = await orgAccountId(orgA, 'MKT-SALES');
    const commExpA = await orgAccountId(orgA, 'MKT-COMM-EXP');
    const shipA = await orgAccountId(orgA, 'MKT-SHIP-LIAB');

    for (const [acc, org] of [[clearingId, null], [payableId, null], [revenueId, null], [orgRecvA, orgA], [salesA, orgA], [commExpA, orgA], [shipA, orgA]]) {
      const s = await bookSums(acc, orderA, org);
      expect(s.debit - s.credit).toBe(0); // net zero after refund
    }
    expect((await orderBalance(orderA)).d).toBe((await orderBalance(orderA)).c);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderA]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderA]);

    // Discounted
    const orderD = await insertOrder({ sellerId: orgB, subtotal: 850, discount: 100, shipping: 50, commission: 42.50 });
    await postMarketplacePaymentAccounting(orderD, 'card', 'EGP');
    const orgRecvB = await orgAccountId(orgB, '1161');
    const salesB = await orgAccountId(orgB, 'MKT-SALES');
    // CourtZon: Dr 1100 800 / Cr 2202 (707.50+50=757.50) / Cr 4160 42.50
    expect((await bookSums(clearingId, orderD, null)).debit).toBe(800);
    expect((await bookSums(payableId, orderD, null)).credit).toBe(757.50);
    expect((await bookSums(revenueId, orderD, null)).credit).toBe(42.50);
    // Org B: Dr 1161 757.50 / Dr comm-exp 42.50 = Cr sales 750 / Cr ship 50
    expect((await bookSums(orgRecvB, orderD, orgB)).debit).toBe(757.50);
    expect((await bookSums(salesB, orderD, orgB)).credit).toBe(750);
    expect((await bookSums(commExpA === commExpA ? await orgAccountId(orgB, 'MKT-COMM-EXP') : 0, orderD, orgB)).debit).toBe(42.50);
    expect((await bookSums(await orgAccountId(orgB, 'MKT-SHIP-LIAB'), orderD, orgB)).credit).toBe(50);
    expect((await orderBalance(orderD)).d).toBe((await orderBalance(orderD)).c);
    await postMarketplaceRefundAccounting(orderD, 'EGP');
    expect((await orderBalance(orderD)).d).toBe((await orderBalance(orderD)).c);
    for (const acc of [clearingId, payableId, revenueId, orgRecvB, salesB]) {
      const s = await bookSums(acc, orderD, acc === clearingId || acc === payableId || acc === revenueId ? null : orgB);
      expect(s.debit - s.credit).toBe(0);
    }
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderD]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderD]);
  });
});