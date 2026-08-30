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
 * Booking / Marketplace COD custody remediation — Integration.
 *
 * Covers:
 *  - GAP-01: COD refund reverses receivable + commission + tax (not org_payable/clearing).
 *  - GAP-02: marketplace COD cancel/refund before delivery → no phantom reversal.
 *  - Phase 4: COD recognition at payment confirmation, not at creation.
 */
describe('COD Custody Remediation', () => {
  let pool: mysql.Pool;
  let orgId: number;
  let branchId: number;
  let resourceId: number;
  let productFixture: ProductFixture;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await pool.execute(`DELETE FROM order_items WHERE seller_id IN (SELECT id FROM organisations WHERE slug = 'cod-remediation-org')`);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'cod-remediation-org')`);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'cod-remediation-org')`);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'cod-remediation-org')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'cod-remediation-org'`);

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'COD Remediation Org', 'cod-remediation-org', 1)`,
      [otId],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'COD Remediation Branch', 'cod-remediation-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'COD Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
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

  async function accountId(code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`, [code],
    );
    return Number((rows as any[])[0].id);
  }

  async function accountSums(accountId: number): Promise<{ credit: number; debit: number }> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c,
              COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d
       FROM ledger_entries WHERE chart_account_id = ? AND organisation_id = ?`,
      [accountId, orgId],
    );
    return { credit: Number((rows as any[])[0].c), debit: Number((rows as any[])[0].d) };
  }

  // Sums scoped to a single source (booking or marketplace order).
  async function sourceSums(accountId: number, sourceType: string, sourceId: number): Promise<{ credit: number; debit: number }> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c,
              COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d
       FROM ledger_entries WHERE chart_account_id = ? AND organisation_id = ? AND source_type = ? AND source_id = ?`,
      [accountId, orgId, sourceType, sourceId],
    );
    return { credit: Number((rows as any[])[0].c), debit: Number((rows as any[])[0].d) };
  }

  async function insertBooking(overrides: Record<string, any> = {}) {
    const hour = overrides.hour ?? 8;
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method)
       VALUES (1, ?, ?, ?, 'private_match', '2026-08-01', ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'pending', ?)`,
      [orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       overrides.total ?? 1000, overrides.tax ?? 100, overrides.commission ?? 200, overrides.club ?? 700,
       overrides.coach ?? 0, overrides.paymentMethod ?? 'cash'],
    );
    return (res as any).insertId;
  }

  async function insertOrder(paymentMethod: string, status: string): Promise<number> {
    const [o] = await pool.execute<RowData>(
      `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, shipping_cost, commission_amount, tax_amount, total, currency_code, payment_method, cash_holder)
       VALUES (UUID(), 1, ?, 'unpaid', 1000, 0, 200, 100, 1100, 'EGP', ?, ?)`,
      [status, paymentMethod, paymentMethod === 'cash' ? 'org' : 'courtzon'],
    );
    const orderId = (o as any).insertId;
    await pool.execute(
      `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price, commission_rate, commission_amount)
       VALUES (?, ?, ?, 1, 1000, 1000, 20, 200)`,
      [orderId, productFixture.productId, orgId],
    );
    return orderId;
  }

  it('1. COD booking: NO accounting before payment confirmation', async () => {
    const { bookingAccounting } = await import('../application/booking-accounting.service.js');
    const bookingId = await insertBooking({ hour: 8 });
    // The booking exists but payment_status is 'pending' — no accounting event fired yet.
    const receivableId = await accountId('1160');
    const before = await accountSums(receivableId);
    // No posting should exist for this booking yet.
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type='booking_cod_payment'`,
      [bookingId],
    );
    expect(Number((rows as any[])[0].cnt)).toBe(0);
    expect(before.debit).toBe(0);
  });

  it('2. COD recognition fires only on payment confirmation (booking:paid with cod)', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 9 });
    // Simulate the updatePaymentStatus → 'paid' signal: post the COD payment event.
    await postAccountingEvent(
      'booking_cod_payment', 'booking', bookingId, orgId,
      { receivable_from_org: 300, platform_commission: 200, tax_liability: 100 },
      'EGP', 'COD recognition on confirmation',
    );
    const receivableId = await accountId('1160');
    const revenueId = await accountId('4110'); // booking commission revenue
    const taxId = await accountId('2300');
    const r = await sourceSums(receivableId, 'booking', bookingId);
    const rev = await sourceSums(revenueId, 'booking', bookingId);
    const tax = await sourceSums(taxId, 'booking', bookingId);
    expect(r.debit).toBe(300);   // commission + tax receivable
    expect(rev.credit).toBe(200); // commission only revenue
    expect(tax.credit).toBe(100);
  });

  it('3. COD full refund reverses receivable + commission + tax (booking_cod_reversal)', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 10 });
    await postAccountingEvent(
      'booking_cod_payment', 'booking', bookingId, orgId,
      { receivable_from_org: 300, platform_commission: 200, tax_liability: 100 },
      'EGP', 'COD recognition',
    );
    await postAccountingEvent(
      'booking_cod_reversal', 'booking', bookingId, orgId,
      { platform_commission: 200, tax_liability: 100, receivable_from_org: 300 },
      'EGP', 'COD full refund',
    );
    const receivableId = await accountId('1160');
    const revenueId = await accountId('4110'); // booking commission revenue
    const taxId = await accountId('2300');
    const payableId = await accountId('2200');
    const clearingId = await accountId('1100');
    const r = await sourceSums(receivableId, 'booking', bookingId);
    const rev = await sourceSums(revenueId, 'booking', bookingId);
    const tax = await sourceSums(taxId, 'booking', bookingId);
    const payable = await sourceSums(payableId, 'booking', bookingId);
    const clearing = await sourceSums(clearingId, 'booking', bookingId);
    // Reversal credits receivable (clears it), debits commission+tax.
    expect(r.debit).toBe(300);
    expect(r.credit).toBe(300);
    expect(rev.credit).toBe(200);
    expect(rev.debit).toBe(200);
    expect(tax.debit).toBe(100);
    // NO org_payable / payment_clearing should ever be touched for COD.
    expect(payable.credit).toBe(0);
    expect(clearing.debit).toBe(0);
  });

  it('4. COD partial refund prorates commission + tax', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 11 });
    await postAccountingEvent(
      'booking_cod_payment', 'booking', bookingId, orgId,
      { receivable_from_org: 300, platform_commission: 200, tax_liability: 100 },
      'EGP', 'COD recognition',
    );
    // 50% refund → 150 receivable, 100 commission, 50 tax.
    await postAccountingEvent(
      'booking_cod_reversal', 'booking', bookingId, orgId,
      { platform_commission: 100, tax_liability: 50, receivable_from_org: 150 },
      'EGP', 'COD 50% refund',
    );
    const receivableId = await accountId('1160');
    const r = await sourceSums(receivableId, 'booking', bookingId);
    // Net receivable = 300 debit - 150 credit = 150 remaining.
    expect(r.debit).toBe(300);
    expect(r.credit).toBe(150);
  });

  it('5. repeated COD reversal is idempotent (no double reversal)', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const bookingId = await insertBooking({ hour: 12 });
    await postAccountingEvent(
      'booking_cod_payment', 'booking', bookingId, orgId,
      { receivable_from_org: 300, platform_commission: 200, tax_liability: 100 },
      'EGP', 'COD recognition',
    );
    await postAccountingEvent(
      'booking_cod_reversal', 'booking', bookingId, orgId,
      { platform_commission: 200, tax_liability: 100, receivable_from_org: 300 },
      'EGP', 'COD refund',
    );
    const receivableId = await accountId('1160');
    const before = await sourceSums(receivableId, 'booking', bookingId);
    // Re-post the same reversal — must be a no-op.
    await postAccountingEvent(
      'booking_cod_reversal', 'booking', bookingId, orgId,
      { platform_commission: 200, tax_liability: 100, receivable_from_org: 300 },
      'EGP', 'COD refund (dup)',
    );
    const after = await sourceSums(receivableId, 'booking', bookingId);
    expect(after.credit).toBe(before.credit);
    expect(after.debit).toBe(before.debit);
  });

  it('6. marketplace COD cancelled BEFORE delivery → zero accounting', async () => {
    const { registerAccountingEventListeners } = await import('../application/accounting-event.listener.js');
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    registerAccountingEventListeners();

    const orderId = await insertOrder('cash', 'cancelled');
    const [before] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type='marketplace' AND source_id=?`,
      [orderId],
    );
    const beforeCnt = Number((before as any[])[0].cnt);

    await eventBusV2.emit('marketplace:order-cancelled', { orderId, userId: 1 } as any);
    await new Promise((r) => setTimeout(r, 300));

    const [after] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type='marketplace' AND source_id=?`,
      [orderId],
    );
    expect(Number((after as any[])[0].cnt)).toBe(beforeCnt);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderId]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderId]);
  });

  it('7. marketplace COD delivered then cancelled → reversal happens (1161 Marketplace Receivable)', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    const { registerAccountingEventListeners } = await import('../application/accounting-event.listener.js');
    registerAccountingEventListeners();

    const orderId = await insertOrder('cash', 'delivered');
    // Cash delivery recognition: Dr 1161 Marketplace Receivable / Cr 4160 (platform).
    await postAccountingEvent(
      'marketplace_cash_commission', 'marketplace', orderId, null,
      { marketplace_receivable: 200, platform_commission: 200 },
      'EGP', 'COD delivery',
      undefined,
      { marketplace_receivable: orgId, platform_commission: null },
    );

    const receivableId = await accountId('1161');
    const before = await sourceSums(receivableId, 'marketplace', orderId);
    expect(before.debit).toBeGreaterThan(0);
    expect(before.credit).toBe(0);

    // Cancellation after delivery → reversal.
    await eventBusV2.emit('marketplace:order-cancelled', { orderId, userId: 1 } as any);
    await new Promise((r) => setTimeout(r, 300));

    const after = await sourceSums(receivableId, 'marketplace', orderId);
    // Receivable cleared by the reversal credit (debit 200, credit 200 → net 0).
    expect(after.debit).toBe(before.debit);
    expect(after.credit).toBe(before.debit);
    await pool.execute(`DELETE FROM order_items WHERE order_id=?`, [orderId]);
    await pool.execute(`DELETE FROM orders WHERE id=?`, [orderId]);
  });

  it('8. booking_cod_reversal resolves via Event Mappings (no hard-coded COA)', async () => {
    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('booking_cod_reversal', null);
    const concepts = mapping.map(m => m.concept);
    expect(concepts).toContain('platform_commission');
    expect(concepts).toContain('tax_liability');
    expect(concepts).toContain('receivable_from_org');
  });

  it('9. booking_cod_reversal supports org override', async () => {
    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    const [accRows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code IN ('4100','2300','1160') ORDER BY FIELD(code,'4100','2300','1160')`,
    );
    const ids = (accRows as any[]).map((r: any) => r.id);
    const concepts = ['platform_commission', 'tax_liability', 'receivable_from_org'];
    for (let i = 0; i < concepts.length; i++) {
      await pool.execute(
        `INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
         VALUES ('booking_cod_reversal', ?, ?, ?, 1)`,
        [orgId, concepts[i], ids[i]],
      );
    }
    try {
      const override = await accountingEngineService.resolveMapping('booking_cod_reversal', orgId);
      expect(override.length).toBe(3);
    } finally {
      await pool.execute(
        `DELETE FROM accounting_event_mapping_lines WHERE event_type='booking_cod_reversal' AND organisation_id=?`,
        [orgId],
      );
    }
  });
});
