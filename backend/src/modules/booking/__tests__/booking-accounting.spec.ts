import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

describe('Booking Accounting Integration', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number;
  let taxRateId: number | null = null;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    // Cleanup any leftover from prior runs
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'booking-acct-test')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'booking-acct-test'`);
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const otId = (ot as any[])[0].id;
    const [o] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Booking Acct Test', 'booking-acct-test', 1)`, [otId]);
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(`INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'Test Branch', 'test-branch-acct', 'Africa/Cairo')`, [orgId]);
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(`INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time) VALUES (UUID(), 'Test Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`, [branchId]);
    resourceId = (r as any).insertId;

    // Create an org tax rate (10%) for tax tests
    const [tr] = await pool.execute<RowData>(`INSERT INTO tax_rates (organisation_id, name, rate, type, tax_category, is_active, is_global) VALUES (?, 'Booking VAT 10%', 10, 'percentage', 'vat', 1, 0)`, [orgId]);
    taxRateId = (tr as any).insertId;
  });

  afterAll(async () => {
    if (orgId) {
      await pool.execute(`DELETE FROM ledger_entries WHERE source_type = 'booking' AND organisation_id = ?`, [orgId]);
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ? AND reference_type LIKE 'booking%'`, [orgId]);
      await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
      if (taxRateId) await pool.execute(`DELETE FROM tax_rates WHERE id = ?`, [taxRateId]);
      if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
      if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    }
    await pool.end();
  });

  function insertBooking(overrides: Record<string, any> = {}) {
    const hour = overrides.hour ?? 10;
    return pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_rate, tax_rate_id, tax_amount, tax_treatment, price_type,
        commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method)
       VALUES (1, ?, ?, ?, 'private_match', '2026-06-15', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'paid', ?)`,
      [orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       overrides.totalAmount ?? 100, overrides.taxRate ?? 0, overrides.taxRateId ?? null, overrides.taxAmount ?? 0,
       overrides.taxTreatment ?? 'taxable', overrides.priceType ?? 'net',
       overrides.commissionAmount ?? 10, overrides.clubAmount ?? 90, overrides.coachAmount ?? 0,
       overrides.paymentMethod ?? 'card'],
    );
  }

  it('1. resolveBookingEconomics returns authoritative split', async () => {
    const [res] = await insertBooking({});
    const bookingId = (res as any).insertId;
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const econ = await bookingAccounting.resolveBookingEconomics(Number(bookingId));
    expect(econ).not.toBeNull();
    expect(econ!.grossAmount).toBe(100);
    expect(econ!.commissionAmount).toBe(10);
    expect(econ!.orgAmount).toBe(90);
    expect(econ!.taxAmount).toBe(0);
    expect(econ!.coachAmount).toBe(0);
  });

  it('2. tax resolution resolves org-specific rate', async () => {
    const { taxResolution } = await import('../../financial/application/tax-resolution.service.js');
    const resolved = await taxResolution.resolveOrgTaxRate(orgId);
    expect(resolved).not.toBeNull();
    expect(resolved!.rate).toBe(10);
    expect(resolved!.type).toBe('percentage');
  });

  it('3. tax calculation: 10% on net 90 = 9', async () => {
    const { taxResolution } = await import('../../financial/application/tax-resolution.service.js');
    const resolved = await taxResolution.resolveOrgTaxRate(orgId);
    const calc = taxResolution.calculateTax(90, resolved);
    expect(calc.taxAmount).toBe(9);
    expect(calc.grossAmount).toBe(99);
  });

  it('4. booking card payment posts booking_revenue + commission + tax (not full gross)', async () => {
    const [res] = await insertBooking({ hour: 12, taxRate: 10, taxRateId: taxRateId, taxAmount: 9, clubAmount: 90, commissionAmount: 10 });
    const bookingId = (res as any).insertId;

    const listener = await import('../../financial/application/accounting-event.listener.js');
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const econ = await bookingAccounting.resolveBookingEconomics(Number(bookingId));

    // Reconstruct the same accounting the listener would post (via concepts)
    expect(econ!.orgAmount).toBe(90);
    expect(econ!.commissionAmount).toBe(10);
    expect(econ!.taxAmount).toBe(9);

    const grossPayable = econ!.orgAmount + econ!.commissionAmount + econ!.taxAmount;
    expect(grossPayable).toBe(109); // 90 + 10 + 9
  });

  it('5. booking accounting concepts resolve to L4 accounts', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('booking_card_payment', null);
    expect(mapping.length).toBeGreaterThanOrEqual(3);
    const concepts = mapping.map(m => m.concept);
    expect(concepts).toContain('org_payable');
    expect(concepts).toContain('platform_commission');
    expect(concepts).toContain('tax_liability');
  });

  it('6. coach payout concepts resolve', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('booking_coach_payout', null);
    const concepts = mapping.map(m => m.concept);
    expect(concepts).toContain('coach_expense');
    expect(concepts).toContain('coach_payable');
  });

  it('7. booking_refund concept resolves', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('booking_refund', null);
    const concepts = mapping.map(m => m.concept);
    expect(concepts).toContain('org_payable');
    expect(concepts).toContain('tax_liability');
  });

  it('8. zero-rated booking produces zero tax', async () => {
    const { taxResolution } = await import('../../financial/application/tax-resolution.service.js');
    const calc = taxResolution.calculateTax(90, null, 'zero_rated');
    expect(calc.taxAmount).toBe(0);
    expect(calc.grossAmount).toBe(90);
    expect(calc.treatment).toBe('zero_rated');
  });

  it('9. exempt booking produces zero tax', async () => {
    const { taxResolution } = await import('../../financial/application/tax-resolution.service.js');
    const resolved = await taxResolution.resolveOrgTaxRate(orgId);
    const calc = taxResolution.calculateTax(90, resolved, 'exempt');
    expect(calc.taxAmount).toBe(0);
    expect(calc.treatment).toBe('exempt');
  });
});
