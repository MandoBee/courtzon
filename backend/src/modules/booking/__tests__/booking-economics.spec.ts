import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Booking economics snapshot — the V2 create path MUST compute and persist
 * commission_amount / club_amount / tax_amount at booking creation. This is a
 * regression test for the critical defect where the V2 command path created
 * bookings with all-zero economics (so accounting produced zero revenue,
 * zero payable, zero tax).
 */
describe('Booking Economics Snapshot (V2)', () => {
  let pool: mysql.Pool;
  let orgId: number;
  let branchId: number;
  let resourceId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'booking-econ-org')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'booking-econ-org'`);

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Booking Econ Org', 'booking-econ-org', 1)`,
      [otId],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'Econ Branch', 'booking-econ-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'Econ Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  it('1. createBookingHandler persists commission/club/tax snapshot', async () => {
    const { commandPipeline } = await import('../../../shared/command/command-pipeline.js');
    const { createBookingHandler } = await import('../commands/create-booking.command.js');
    const command = {
      commandId: `create-booking-econ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: String(resourceId),
      payload: {
        userId: 1, branchId, organisationId: orgId, resourceId,
        bookingDate: '2026-08-15', startTime: '10:00', endTime: '11:00',
        totalAmount: 100, startAtUtc: '2026-08-15T08:00:00Z', endAtUtc: '2026-08-15T09:00:00Z',
        bookingType: 'private_match', paymentMethod: 'wallet',
        commissionAmount: 20, clubAmount: 80, taxRate: 10, taxRateId: null, taxAmount: 8, taxTreatment: 'taxable', priceType: 'net',
      },
      correlationId: 'econ-1',
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => {},
      execute: async (cmd, conn) => createBookingHandler.execute(cmd, conn),
      events: (cmd, res) => createBookingHandler.events!(cmd, res),
    });

    expect(result.status).toBe('processed');
    const bookingId = (result as any).data.bookingId;

    const [rows] = await pool.execute<RowData>(
      `SELECT total_amount, commission_amount, club_amount, tax_amount, tax_rate FROM bookings WHERE id = ?`,
      [bookingId],
    );
    const b = rows[0] as any;
    expect(Number(b.commission_amount)).toBe(20);
    expect(Number(b.club_amount)).toBe(80);
    expect(Number(b.tax_amount)).toBe(8);
    expect(Number(b.tax_rate)).toBe(10);

    // Also verify the economics resolve from the persisted snapshot.
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const econ = await bookingAccounting.resolveBookingEconomics(Number(bookingId));
    expect(econ).not.toBeNull();
    expect(econ!.commissionAmount).toBe(20);
    expect(econ!.orgAmount).toBe(80);
    expect(econ!.taxAmount).toBe(8);
  });
});
