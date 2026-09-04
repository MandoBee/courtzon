import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3026';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

type RowData = RowDataPacket[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Issue #1 + #3 (card payment lifecycle + realtime) and Issue #2 (accounting).
 *
 * A successful card payment flows: payment:succeeded → booking-payment listener
 * confirms the booking AND marks bookings.payment_status='paid' AND emits the
 * canonical booking:paid realtime event. Accounting is posted exactly once by
 * the accounting listener (booking_card_payment) and stays idempotent across
 * duplicate/replayed events. Cash/COD posts booking_cod_payment (receivable)
 * and never a gateway clearing entry.
 */
describe('Card payment success → booking paid lifecycle + accounting', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number; let userId: number;
  const SLUG = 'card-paid-bug-org';
  const PHONE = '+2010111223100';
  const EMAIL = 'card-paid-bug@courtzon.test';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    const [existing] = await pool.execute<RowData>(`SELECT id FROM organisations WHERE slug = ?`, [SLUG]);
    for (const row of existing as any[]) {
      const oid = Number(row.id);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM branches WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [oid]);
    }
    await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Card Paid Org', ?, 1)`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'CP Branch', 'cp-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'CP Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111223100', ?, ?, 'x', 'CP Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;

    // Register the in-memory handlers under test (same registration as app startup).
    const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
    registerAccountingEventListeners();
    const { registerBookingPaymentListeners } = await import('./../application/booking-payment.listener.js');
    registerBookingPaymentListeners();
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [userId]);
    await pool.end();
  });

  async function insertBooking(overrides: Record<string, any> = {}): Promise<number> {
    const hour = overrides.hour ?? 10;
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (?, ?, ?, ?, 'private_match', '2026-12-01', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)`,
      [userId, orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       overrides.totalAmount ?? 100, overrides.taxAmount ?? 0,
       overrides.commissionAmount ?? 10, overrides.clubAmount ?? 90,
       overrides.bookingStatus ?? 'pending_payment', overrides.paymentStatus ?? 'pending',
       overrides.paymentMethod ?? 'card'],
    );
    return (res as any).insertId;
  }

  function paidEvent(referenceId: number, paymentId: number, paymentMethod = 'card') {
    return {
      paymentId,
      referenceType: 'booking',
      referenceId,
      amount: 100,
      metadata: { paymentMethod, currency: 'EGP', gateway: 'paymob' },
    };
  }

  async function ledgerRows(bookingId: number, eventType: string) {
    const [rows] = await pool.execute<RowData>(
      `SELECT transaction_id, side, amount, account_type, organisation_id
       FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type=?`,
      [bookingId, eventType],
    );
    return rows as any[];
  }

  it('Issue#1: successful card payment marks bookings.payment_status=paid and confirms the booking', async () => {
    const bookingId = await insertBooking();
    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await eventBusV2.emit('payment:succeeded', paidEvent(bookingId, 9015001));

    await sleep(300);
    const [rows] = await pool.execute<RowData>(
      `SELECT booking_status, payment_status FROM bookings WHERE id = ?`, [bookingId],
    );
    expect((rows as any[])[0].booking_status).toBe('confirmed');
    expect((rows as any[])[0].payment_status).toBe('paid');

    // Issue#3 realtime: canonical booking:paid emitted with the OWNER userId
    // (room routing) + org/branch/resource for organisation/resource rooms.
    const paidCalls = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:paid');
    expect(paidCalls.length).toBeGreaterThanOrEqual(1);
    const payload = paidCalls[0][1] as any;
    expect(Number(payload.bookingId)).toBe(bookingId);
    expect(Number(payload.userId)).toBe(userId);
    expect(Number(payload.organisationId)).toBe(orgId);
    expect(Number(payload.resourceId)).toBe(resourceId);
    emitSpy.mockRestore();
  });

  it('Issue#2: card payment posts booking_card_payment exactly once (org_payable + commission + clearing), balanced', async () => {
    const bookingId = await insertBooking({ hour: 12 });
    await eventBusV2.emit('payment:succeeded', paidEvent(bookingId, 9015002));
    await sleep(400);

    const rows = await ledgerRows(bookingId, 'booking_card_payment');
    expect(rows.length).toBeGreaterThanOrEqual(3); // clearing + org_payable + commission (+ tax)
    const txIds = new Set(rows.map((r) => r.transaction_id));
    expect(txIds.size).toBe(1); // a single accounting transaction

    let debit = 0, credit = 0;
    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.side === 'debit') debit += amt; else credit += amt;
      expect(Number(r.organisation_id)).toBe(orgId);
    }
    expect(debit).toBe(credit); // balanced double-entry
    expect(debit).toBe(100); // gross payable
  });

  it('Issue#2: the same successful payment cannot duplicate accounting (idempotent replay)', async () => {
    const bookingId = await insertBooking({ hour: 13 });
    await eventBusV2.emit('payment:succeeded', paidEvent(bookingId, 9015003));
    await eventBusV2.emit('payment:succeeded', paidEvent(bookingId, 9015003)); // replay
    await sleep(400);

    const rows = await ledgerRows(bookingId, 'booking_card_payment');
    const txIds = new Set(rows.map((r) => r.transaction_id));
    expect(txIds.size).toBe(1);
    const [b] = await pool.execute<RowData>(`SELECT payment_status FROM bookings WHERE id = ?`, [bookingId]);
    expect((b as any[])[0].payment_status).toBe('paid');
  });

  it('Issue#2: failed/declined payment never marks paid and no successful accounting is posted', async () => {
    const bookingId = await insertBooking({ hour: 14 });
    await eventBusV2.emit('payment:failed-event', {
      paymentId: 9015004, referenceType: 'booking', referenceId: bookingId, amount: 100,
      reason: 'declined', metadata: { paymentMethod: 'card', currency: 'EGP' },
    });
    await sleep(400);
    const [b] = await pool.execute<RowData>(`SELECT booking_status, payment_status FROM bookings WHERE id = ?`, [bookingId]);
    // Payment failure cancels the booking; it must never become paid.
    expect((b as any[])[0].payment_status).not.toBe('paid');
    const rows = await ledgerRows(bookingId, 'booking_card_payment');
    expect(rows.length).toBe(0);
  });

  it('Issue#2: cash booking posts booking_cod_payment receivable (no gateway clearing) — matches Marketplace COD model', async () => {
    const bookingId = await insertBooking({ hour: 15, paymentMethod: 'cash', bookingStatus: 'confirmed', paymentStatus: 'pending' });
    // COD/cash booking:paid (S11) drives the receivable posting.
    await eventBusV2.emit('booking:paid', {
      bookingId, userId, organisationId: orgId,
      grossAmount: 100, taxAmount: 0, coachAmount: 0, organisationAmount: 90, commissionAmount: 10,
      paymentMethod: 'cash', currency: 'EGP', sourceId: bookingId,
    });
    await sleep(400);
    const rows = await ledgerRows(bookingId, 'booking_cod_payment');
    expect(rows.length).toBe(2); // receivable debit + commission credit
    const txIds = new Set(rows.map((r) => r.transaction_id));
    expect(txIds.size).toBe(1);
    let debit = 0, credit = 0;
    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.side === 'debit') debit += amt; else credit += amt;
    }
    expect(debit).toBe(credit);
    expect(debit).toBe(10); // CourtZon receivable = commission only for cash
    // No gateway clearing entry for cash.
    const clear = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='booking' AND source_id=? AND event_type='booking_card_payment'`,
      [bookingId],
    );
    expect(Number((clear[0] as any[])[0].c)).toBe(0);
  });
});