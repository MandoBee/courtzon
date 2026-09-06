import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3031';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Booking Settlements — entitlement-driven eligibility (UAT).
 *
 * Model under test (unified settlement + financial entitlements, commit
 * f003b82 and earlier):
 *   - Card/online booking → ORGANIZATION_EARNING collector='courtzon'
 *     (CourtZon holds the money, owes the org the org net).
 *   - Cash/COD booking → COURTZON_COMMISSION collector='org'
 *     (the org holds the gross, owes CourtZon the commission).
 *   - Both sides are netted via computeSettlementFinancials.
 *
 * UAT fixture: 4 bookings at E£400, E£20 commission each (2 card + 2 COD,
 * 2 private + 2 public) for ONE organisation.
 * Expected: gross 1600, online net 760, COD fee 40, net 720 (CourtZon → org).
 */
describe('Booking Settlements — entitlement-driven eligibility', () => {
  let pool: mysql.Pool;
  let orgId: number;
  let branchId: number;
  let resourceId: number;
  const bookingIds: number[] = [];

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    // Cleanup any prior run residue.
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'bs-elig-org')`);
    await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'bs-elig-org')`);
    await pool.execute(`DELETE FROM settlements WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'bs-elig-org')`);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'bs-elig-org')`);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'bs-elig-org')`);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'bs-elig-org')`);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'bs-elig-org')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'bs-elig-org'`);

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'BS Eligibility Org', 'bs-elig-org', 1)`,
      [otId],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'BS Eligibility Branch', 'bs-elig-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'BS Eligibility Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;

    // The 4-booking UAT fixture: E£400, E£20 commission, E£380 org net.
    // booking_status is 'confirmed' — eligibility must NOT depend on the legacy
    // completed/checked_in status, only on AVAILABLE booking entitlements.
    const fixture: Array<{ type: string; method: string }> = [
      { type: 'private_match', method: 'card' },
      { type: 'private_match', method: 'cash' },
      { type: 'public_match', method: 'card' },
      { type: 'public_match', method: 'cash' },
    ];
    for (let i = 0; i < fixture.length; i++) {
      const f = fixture[i];
      const [ins] = await pool.execute<RowData>(
        `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
          total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method)
         VALUES (1, ?, ?, ?, ?, '2026-08-10', ?, ?, 400, 0, 20, 380, 0, 'confirmed', 'paid', ?)`,
        [orgId, branchId, resourceId, f.type,
         `${String(9 + i).padStart(2, '0')}:00:00`, `${String(10 + i).padStart(2, '0')}:00:00`, f.method],
      );
      bookingIds.push((ins as any).insertId);
    }

    // Create entitlements exactly like entitlement-booking.listener does.
    const { financialEntitlementService } = await import('../../financial/application/financial-entitlement.service.js');
    for (const bookingId of bookingIds) {
      const method = fixture[bookingIds.indexOf(bookingId)].method;
      const collector: 'courtzon' | 'org' = ['cash', 'cod'].includes(method) ? 'org' : 'courtzon';
      await financialEntitlementService.createEntitlements([
        {
          organisationId: orgId,
          branchId,
          entitlementType: 'ORGANIZATION_EARNING',
          sourceType: 'booking',
          sourceId: bookingId,
          collector,
          amount: 380,
          currency: 'EGP',
          availableAt: null,
          description: `Booking #${bookingId} — org earning`,
        },
        {
          organisationId: orgId,
          branchId,
          entitlementType: 'COURTZON_COMMISSION',
          sourceType: 'booking',
          sourceId: bookingId,
          collector,
          amount: 20,
          currency: 'EGP',
          availableAt: null,
          description: `Booking #${bookingId} — CourtZon commission`,
        },
      ]);
      // Activate: PENDING → AVAILABLE (what the activation worker does).
      await pool.execute(
        `UPDATE financial_entitlements SET status = 'AVAILABLE'
         WHERE source_type = 'booking' AND source_id = ?`,
        [bookingId],
      );
    }
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM settlements WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM booking_settlements WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  it('F2. an eligible Card booking appears with its online net (cardOnlineNet 380, codFee 0)', async () => {
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const result = await bookingSettlementService.listEligible(orgId, 1, 20);
    const card = result.data.find((e) => e.paymentMethod === 'card');
    expect(card).toBeTruthy();
    expect(card!.cardOnlineNet).toBe(380);
    expect(card!.codFee).toBe(0);
    expect(card!.gross).toBe(400);
    expect(card!.eligibility).toBe('ELIGIBLE');
  });

  it('F3. an eligible COD booking appears with its commission receivable (codFee 20, cardOnlineNet 0)', async () => {
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const result = await bookingSettlementService.listEligible(orgId, 1, 20);
    const cod = result.data.find((e) => e.paymentMethod === 'cash');
    expect(cod).toBeTruthy();
    expect(cod!.codFee).toBe(20);
    expect(cod!.cardOnlineNet).toBe(0);
    expect(cod!.gross).toBe(400);
    expect(cod!.eligibility).toBe('ELIGIBLE');
  });

  it('F4. mixed Card + COD netting: 4 bookings, online 760, COD fee 40, net 720', async () => {
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const result = await bookingSettlementService.listEligible(orgId, 1, 20);
    expect(result.total).toBe(4);
    expect(result.data.length).toBe(4);
    expect(result.preview.eligibleBookings).toBe(4);
    expect(result.preview.gross).toBe(1600);
    expect(result.preview.onlineNet).toBe(760);
    expect(result.preview.codFee).toBe(40);
    expect(result.preview.commission).toBe(80);
    expect(result.preview.direction).toBe('COURTZON_TO_ORGANIZATION');
  });

  it('F5. the four-booking case nets to E£720 payable from CourtZon to the organisation', async () => {
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const result = await bookingSettlementService.listEligible(orgId, 1, 20);
    // Online net 760 (2×380 card) − COD fee 40 (2×20 COD commission) = 720.
    expect(result.preview.courtzonOwedToOrg).toBe(760);
    expect(result.preview.orgOwedToCourtZon).toBe(40);
    expect(result.preview.finalAmount).toBe(720);
    expect(result.preview.direction).toBe('COURTZON_TO_ORGANIZATION');
  });

  it('F6. no duplicate eligibility after a unified settlement is created and paid', async () => {
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');

    // Create + pay ONE unified settlement that nets the full org position.
    const created = await unifiedSettlementService.create({
      orgId,
      excludeEntitlementIds: [],
      requestedBy: 1,
      requestedByRole: 'admin',
      notes: 'Booking settlement UAT netting test',
    });
    expect(created.settlement.settlement_direction).toBe('courtzon_to_org');
    expect(Number(created.settlement.final_amount)).toBe(720);

    await unifiedSettlementService.recordPayment(created.settlement.id, {
      paidBy: 1,
      paymentMethod: 'settlement',
      paymentReference: 'uat-netting',
    });

    // All booking entitlements are now SETTLED → the bookings drop out.
    const after = await bookingSettlementService.listEligible(orgId, 1, 20);
    expect(after.total).toBe(0);
    expect(after.preview.eligibleBookings).toBe(0);
  });
});