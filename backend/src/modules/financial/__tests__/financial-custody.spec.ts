import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { createProductFixture, cleanupProductFixture, type ProductFixture } from '../../../tests/helpers/product-fixture.js';
type RowData = RowDataPacket[];

/**
 * Financial Custody / Counterparty / Settlement — Integration
 *
 * Verifies the agent model: CourtZon must NOT recognize the full customer
 * payment as revenue when acting as an agent / marketplace operator / collector.
 * Org/merchant share = payable; commission = revenue; tax = liability;
 * COD = receivable from counterparty.
 */
describe('Financial Custody & Counterparty', () => {
  let pool: mysql.Pool;
  let orgId: number;
  let branchId: number;
  let resourceId: number;
  let productFixture: ProductFixture;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    // Cleanup any leftover from prior runs (FK order matters: order_items → orders → bookings → org).
    await pool.execute(`DELETE FROM order_items WHERE seller_id IN (SELECT id FROM organisations WHERE slug = 'custody-it-org')`);
    await pool.execute(`DELETE FROM orders WHERE buyer_id = 1 AND id NOT IN (SELECT DISTINCT order_id FROM order_items)`);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'custody-it-org')`);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'custody-it-org')`);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'custody-it-org')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'custody-it-org'`);

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Custody IT Org', 'custody-it-org', 1)`,
      [otId],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'Custody Branch', 'custody-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'Custody Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    productFixture = await createProductFixture(pool, orgId);
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM order_items WHERE seller_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await cleanupProductFixture(pool, productFixture);
    await pool.end();
  });

  async function accountCode(code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`,
      [code],
    );
    return Number((rows as any[])[0].id);
  }

  // Returns {credit, debit} sums for an account within this test org.
  async function accountSums(accountId: number): Promise<{ credit: number; debit: number }> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c,
              COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d
       FROM ledger_entries WHERE chart_account_id = ? AND organisation_id = ?`,
      [accountId, orgId],
    );
    return { credit: Number((rows as any[])[0].c), debit: Number((rows as any[])[0].d) };
  }

  async function insertBooking(overrides: Record<string, any> = {}) {
    const hour = overrides.hour ?? 10;
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method)
       VALUES (1, ?, ?, ?, 'private_match', '2026-07-01', ?, ?, ?, ?, ?, ?, ?, 'completed', 'paid', ?)`,
      [orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       overrides.total ?? 100, overrides.tax ?? 9, overrides.commission ?? 10, overrides.club ?? 90,
       overrides.coach ?? 0, overrides.paymentMethod ?? 'card'],
    );
    return (res as any).insertId;
  }

  it('1. booking card payment: org share → payable (liability), not revenue', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 10 });
    await postAccountingEvent(
      'booking_card_payment', 'booking', bookingId, orgId,
      { org_payable: 90, platform_commission: 10, tax_liability: 9, payment_clearing: 109 },
      'EGP', 'custody test card payment',
    );

    const payableId = await accountCode('2200');
    const revenueId = await accountCode('4100');
    const taxId = await accountCode('2300');
    const clearingId = await accountCode('1100');

    const payable = await accountSums(payableId);
    const revenue = await accountSums(revenueId);
    const tax = await accountSums(taxId);
    const clearing = await accountSums(clearingId);

    // Org share is a payable credit (liability), NOT revenue.
    expect(payable.credit).toBe(90);
    expect(payable.debit).toBe(0);
    // CourtZon revenue is only the commission.
    expect(revenue.credit).toBe(10);
    expect(tax.credit).toBe(9);
    expect(clearing.debit).toBe(109);
  });

  it('2. booking COD: commission+tax → receivable from org; org share absent', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 11, paymentMethod: 'cash' });
    await postAccountingEvent(
      'booking_cod_payment', 'booking', bookingId, orgId,
      { receivable_from_org: 19, platform_commission: 10, tax_liability: 9 },
      'EGP', 'custody test COD payment',
    );

    const receivableId = await accountCode('1160');
    const revenueId = await accountCode('4100');
    const payableId = await accountCode('2200');

    const receivable = await accountSums(receivableId);
    const revenue = await accountSums(revenueId);
    const payable = await accountSums(payableId);

    // Commission + tax are debited to receivable (asset) — CourtZon not holding cash.
    expect(receivable.debit).toBe(19);
    expect(revenue.credit).toBe(20); // 10 (card) + 10 (COD)
    // Org payable unchanged by COD (org already holds the money).
    expect(payable.credit).toBe(90);
  });

  it('3. booking wallet payment uses wallet_liability_spend, org share still payable', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 12, paymentMethod: 'wallet' });
    await postAccountingEvent(
      'booking_wallet_payment', 'booking', bookingId, orgId,
      { org_payable: 90, platform_commission: 10, tax_liability: 9, wallet_liability_spend: 109 },
      'EGP', 'custody test wallet payment',
    );

    const walletId = await accountCode('2100');
    const payableId = await accountCode('2200');
    const wallet = await accountSums(walletId);
    const payable = await accountSums(payableId);
    expect(wallet.debit).toBe(109);
    expect(payable.credit).toBe(180); // 90 (card) + 90 (wallet)
  });

  it('4. booking refund reverses org_payable + commission + tax', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 13 });
    await postAccountingEvent(
      'booking_card_payment', 'booking', bookingId, orgId,
      { org_payable: 90, platform_commission: 10, tax_liability: 9, payment_clearing: 109 },
      'EGP', 'custody refund payment',
    );
    await postAccountingEvent(
      'booking_refund', 'booking', bookingId, orgId,
      { org_payable: 90, platform_commission: 10, tax_liability: 9, payment_clearing: 109 },
      'EGP', 'custody refund',
    );

    const payableId = await accountCode('2200');
    const revenueId = await accountCode('4100');
    const clearingId = await accountCode('1100');
    const payable = await accountSums(payableId);
    const revenue = await accountSums(revenueId);
    const clearing = await accountSums(clearingId);

    // Refund debits org_payable (reversing the booking's own credit).
    expect(payable.credit).toBe(270); // 180 + 90 (this booking)
    expect(payable.debit).toBe(90);   // refund reversal
    // Commission: 10 (card) + 10 (COD) + 10 (wallet) + 10 (this booking) = 40; refund reverses 10.
    expect(revenue.credit).toBe(40);
    expect(revenue.debit).toBe(10);
    // Payment clearing: 109 (card) + 109 (this booking) = 218 debit; refund credits 109.
    expect(clearing.debit).toBe(218);
    expect(clearing.credit).toBe(109);
  });

  it('5. marketplace card payment: merchant share → payable, commission only revenue', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const [o] = await pool.execute<RowData>(
      `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, shipping_cost, commission_amount, tax_amount, total, currency_code, payment_method, cash_holder)
       VALUES (UUID(), 1, 'confirmed', 'paid', 100, 0, 10, 9, 109, 'EGP', 'card', 'courtzon')`,
    );
    const orderId = (o as any).insertId;
    await pool.execute(
      `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price, commission_rate, commission_amount)
       VALUES (?, ?, ?, 1, 100, 100, 10, 10)`,
      [orderId, productFixture.productId, orgId],
    );

    await postAccountingEvent(
      'marketplace_card_payment', 'marketplace', orderId, orgId,
      { merchant_payable: 90, platform_commission: 10, tax_liability: 9, payment_clearing: 109 },
      'EGP', 'custody marketplace card',
    );

    const payableId = await accountCode('2200');
    const revenueId = await accountCode('4100');
    const payable = await accountSums(payableId);
    const revenue = await accountSums(revenueId);
    expect(payable.credit).toBe(360); // 270 + 90 merchant payable
    expect(revenue.credit).toBe(50); // 40 + 10

    await pool.execute(`DELETE FROM order_items WHERE order_id = ?`, [orderId]);
    await pool.execute(`DELETE FROM orders WHERE id = ?`, [orderId]);
  });

  it('6. marketplace COD delivery: commission → receivable from merchant', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const [o] = await pool.execute<RowData>(
      `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, shipping_cost, commission_amount, tax_amount, total, currency_code, payment_method, cash_holder)
       VALUES (UUID(), 1, 'delivered', 'paid', 100, 0, 10, 9, 109, 'EGP', 'cash', 'org')`,
    );
    const orderId = (o as any).insertId;
    await pool.execute(
      `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price, commission_rate, commission_amount)
       VALUES (?, ?, ?, 1, 100, 100, 10, 10)`,
      [orderId, productFixture.productId, orgId],
    );

    await postAccountingEvent(
      'marketplace_delivery', 'marketplace', orderId, orgId,
      { receivable_from_org: 19, platform_commission: 10, tax_liability: 9 },
      'EGP', 'custody marketplace COD delivery',
    );

    const receivableId = await accountCode('1160');
    const revenueId = await accountCode('4100');
    const receivable = await accountSums(receivableId);
    const revenue = await accountSums(revenueId);
    expect(receivable.debit).toBe(38); // 19 booking COD + 19 marketplace COD
    expect(revenue.credit).toBe(60); // 50 + 10

    await pool.execute(`DELETE FROM order_items WHERE order_id = ?`, [orderId]);
    await pool.execute(`DELETE FROM orders WHERE id = ?`, [orderId]);
  });

  it('7. settlement offset: clears full payable + full receivable against net cash', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    await postAccountingEvent(
      'settlement_paid_offset', 'settlement', 990001, orgId,
      { org_payable: 100, cash_bank: 70, receivable_from_org: 30 },
      'EGP', 'custody settlement offset',
    );

    const cashId = await accountCode('1120');
    const receivableId = await accountCode('1160');
    const payableId = await accountCode('2200');
    const cash = await accountSums(cashId);
    const receivable = await accountSums(receivableId);
    const payable = await accountSums(payableId);

    expect(cash.credit).toBe(70);
    expect(receivable.credit).toBe(30); // cleared 30 of the receivable
    expect(payable.debit).toBe(190);    // 90 (booking refund) + 100 (settlement) cleared
  });

  it('8. event mapping resolves org_payable (no hard-coded COA); org override works', async () => {
    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('booking_card_payment', null);
    const concepts = mapping.map(m => m.concept);
    expect(concepts).toContain('org_payable');
    expect(concepts).toContain('platform_commission');
    expect(concepts).toContain('tax_liability');
    expect(concepts).toContain('payment_clearing');

    const [accRows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code IN ('2200','4100','2300','1100') ORDER BY FIELD(code,'2200','4100','2300','1100')`,
    );
    const ids = (accRows as any[]).map((r: any) => r.id);
    const concepts2 = ['org_payable', 'platform_commission', 'tax_liability', 'payment_clearing'];
    for (let i = 0; i < concepts2.length; i++) {
      await pool.execute(
        `INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
         VALUES ('booking_card_payment', ?, ?, ?, 1)`,
        [orgId, concepts2[i], ids[i]],
      );
    }
    try {
      const override = await accountingEngineService.resolveMapping('booking_card_payment', orgId);
      expect(override.length).toBe(4);
    } finally {
      await pool.execute(
        `DELETE FROM accounting_event_mapping_lines WHERE event_type = 'booking_card_payment' AND organisation_id = ?`,
        [orgId],
      );
    }
  });

  it('9. canonical ledger is balanced (total debits == total credits)', async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d,
              COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c
       FROM ledger_entries WHERE organisation_id = ?`,
      [orgId],
    );
    const d = Number((rows as any[])[0].d);
    const c = Number((rows as any[])[0].c);
    expect(Math.abs(d - c)).toBeLessThan(0.01);
  });

  it('10. booking economics resolve commission separate from org share', async () => {
    const { bookingAccounting } = await import('../application/booking-accounting.service.js');
    const bookingId = await insertBooking({ hour: 14 });
    const econ = await bookingAccounting.resolveBookingEconomics(bookingId);
    expect(econ).not.toBeNull();
    expect(econ!.orgAmount).toBe(90);
    expect(econ!.commissionAmount).toBe(10);
    expect(econ!.taxAmount).toBe(9);
  });

  it('11. idempotency: duplicate event does not double-post', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 15 });
    await postAccountingEvent(
      'booking_card_payment', 'booking', bookingId, orgId,
      { org_payable: 90, platform_commission: 10, tax_liability: 9, payment_clearing: 109 },
      'EGP', 'custody idempotency',
    );
    const clearingId = await accountCode('1100');
    const before = await accountSums(clearingId);
    await postAccountingEvent(
      'booking_card_payment', 'booking', bookingId, orgId,
      { org_payable: 90, platform_commission: 10, tax_liability: 9, payment_clearing: 109 },
      'EGP', 'custody idempotency (dup)',
    );
    const after = await accountSums(clearingId);
    expect(after.debit).toBe(before.debit);
  });

  it('12. payment:failed is a non-event — creates zero ledger entries', async () => {
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    // Re-register accounting listeners (fresh state in this test process).
    const { registerAccountingEventListeners } = await import('../application/accounting-event.listener.js');
    registerAccountingEventListeners();

    const [before] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM ledger_entries WHERE organisation_id = ?`, [orgId],
    );
    const beforeCnt = Number((before as any[])[0].cnt);

    await eventBusV2.emit('payment:failed-event', {
      paymentId: 990001,
      referenceType: 'booking',
      referenceId: 999999,
      amount: 1000,
      reason: 'card_declined',
      metadata: { paymentMethod: 'card' },
    } as any);

    // Give the async in-memory handler a tick to run.
    await new Promise((r) => setTimeout(r, 300));

    const [after] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM ledger_entries WHERE organisation_id = ?`, [orgId],
    );
    const afterCnt = Number((after as any[])[0].cnt);
    expect(afterCnt).toBe(beforeCnt);
  });

  it('13. COD booking receivable equals commission+tax only (NOT full gross)', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 16, paymentMethod: 'cash', total: 1000, tax: 100, commission: 200, club: 700 });

    // Deterministic delta assertion: capture the receivable BEFORE this booking's
    // event, then assert the delta is exactly 300 (commission+tax), never the 1000
    // gross. This no longer depends on any pre-existing ledger balance for the org.
    const receivableId = await accountCode('1160');
    const before = await accountSums(receivableId);

    await postAccountingEvent(
      'booking_cod_payment', 'booking', bookingId, orgId,
      { receivable_from_org: 300, platform_commission: 200, tax_liability: 100 },
      'EGP', 'custody COD gross 1000',
    );

    const after = await accountSums(receivableId);
    // Receivable must increase by 300 (commission+tax), NOT the 1000 gross.
    expect(after.debit - before.debit).toBe(300);
  });

  it('14. settlement/collection of COD receivable clears receivable_from_org', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    // Collect 300 of the receivable (the COD commission) via settlement_paid_otc.
    await postAccountingEvent(
      'settlement_paid_otc', 'settlement', 990002, orgId,
      { cash_bank: 300, receivable_from_org: 300 },
      'EGP', 'custody COD collection',
    );

    const receivableId = await accountCode('1160');
    const cashId = await accountCode('1120');
    const receivable = await accountSums(receivableId);
    const cash = await accountSums(cashId);
    // Receivable credited 300 (cleared); cash debited 300 (collected).
    expect(receivable.credit).toBe(330); // 30 (offset) + 300 (collection)
    expect(cash.debit).toBe(300);
  });

  it('15. coach COD is unreachable: BookSessionSchema has no paymentMethod', async () => {
    const { BookSessionSchema } = await import('../../scheduling/presentation/scheduling.dto.js');
    const parsed = BookSessionSchema.safeParse({
      coachId: 1, resourceId: 1, date: '2026-07-01', startTime: '10:00', endTime: '11:00',
      paymentMethod: 'cash',
    });
    // The schema strips the unknown field; the booking always uses 'wallet'.
    expect(parsed.success).toBe(true);
    expect((parsed as any).data?.paymentMethod).toBeUndefined();
  });

  it('16. coach session fee is NOT collected through booking (no phantom coach payable)', async () => {
    const { bookingAccounting } = await import('../application/booking-accounting.service.js');
    // A coach_session booking with coach_amount=0 and NO coach_sessions link.
    const bookingId = await insertBooking({ hour: 17, paymentMethod: 'wallet', coach: 0 });
    const econ = await bookingAccounting.resolveBookingEconomics(bookingId);
    expect(econ).not.toBeNull();
    // Coach share must be 0 (coach_sessions.coach_earnings must NOT leak in).
    expect(econ!.coachAmount).toBe(0);
  });
});
