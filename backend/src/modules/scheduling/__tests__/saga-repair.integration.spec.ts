import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.REDIS_DB = '0';
  process.env.REDIS_PASSWORD = '';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

const PLAYER_USER = 10006200;
const COACH_USER = 10006201;

describe('Saga repair worker — orphaned coach bookings/sessions', () => {
  let pool: mysql.Pool;
  let coachProfileId: number;
  let branchId: number;
  let resourceId: number;

  async function cleanupFixtures() {
    // Idempotent cleanup by fixed user ids + fixed org slug — safe to run before
    // fixtures exist (no undefined binds) and handles leftovers from crashed runs.
    await pool.execute(`DELETE FROM coach_sessions WHERE coach_id IN (SELECT id FROM coach_profiles WHERE user_id = ?) OR player_id = ?`, [COACH_USER, PLAYER_USER]);
    await pool.execute(`DELETE FROM coach_service_locations WHERE coach_id IN (SELECT id FROM coach_profiles WHERE user_id = ?)`, [COACH_USER]);
    await pool.execute(`DELETE FROM transaction_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE source_type = 'booking' AND source_id IN (SELECT id FROM bookings WHERE user_id = ?))`, [PLAYER_USER]);
    await pool.execute(`DELETE FROM transactions WHERE source_type = 'booking' AND source_id IN (SELECT id FROM bookings WHERE user_id = ?)`, [PLAYER_USER]);
    await pool.execute(`DELETE FROM payment_transactions WHERE user_id = ?`, [PLAYER_USER]);
    await pool.execute(`DELETE FROM bookings WHERE user_id = ?`, [PLAYER_USER]);
    await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'saga-repair-org'))`);
    await pool.execute(`DELETE FROM branches WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'saga-repair-org')`);
    await pool.execute(`DELETE FROM coach_profiles WHERE user_id = ?`, [COACH_USER]);
    await pool.execute(`DELETE FROM professional_profiles WHERE user_id = ?`, [COACH_USER]);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'saga-repair-org'`);
    await pool.execute(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id = ?)`, [PLAYER_USER]);
    await pool.execute(`DELETE FROM user_wallets WHERE user_id = ?`, [PLAYER_USER]);
    await pool.execute(`DELETE FROM users WHERE id IN (?, ?)`, [PLAYER_USER, COACH_USER]);
  }

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await cleanupFixtures();

    const { createPool } = await import('../../../database/mysql.js');
    createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, '01290002000', '+201290002000', 'saga-repair-player@test.com', '$2b$10$x', 'Saga Player', 'male', 'active')`, [PLAYER_USER]);
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, '01290002001', '+201290002001', 'saga-repair-coach@test.com', '$2b$10$x', 'Saga Coach', 'male', 'active')`, [COACH_USER]);
    await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (?, 999999, 'EGP', 1)`, [PLAYER_USER]);

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const [orgRes] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, ?, 'Saga Repair Org', 'saga-repair-org', 1)`,
      [ot[0].id, PLAYER_USER]);
    const orgId = (orgRes as any).insertId;
    const [brRes] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone, coach_policy, opening_time, closing_time)
       VALUES (UUID(), ?, 'Saga Branch', 'saga-branch', 'Africa/Cairo', 'contract_required', '08:00', '22:00')`, [orgId]);
    branchId = (brRes as any).insertId;
    const [resRes] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, sport_id, hourly_price, is_active, opening_time, closing_time, slot_duration)
       VALUES (UUID(), 'Saga Court', (SELECT id FROM resource_types LIMIT 1), ?, (SELECT id FROM sports LIMIT 1), 200, 1, '08:00', '22:00', 60)`, [branchId]);
    resourceId = (resRes as any).insertId;

    const [cpRes] = await pool.execute<RowData>(
      `INSERT INTO coach_profiles (user_id, status, is_verified) VALUES (?, 'approved', 1)`, [COACH_USER]);
    coachProfileId = (cpRes as any).insertId;
    await pool.execute(
      `INSERT INTO professional_profiles (user_id, sports, is_available) VALUES (?, JSON_ARRAY((SELECT id FROM sports LIMIT 1)), 1)`, [COACH_USER]);
    await pool.execute(`INSERT INTO coach_service_locations (coach_id, branch_id) VALUES (?, ?)`, [coachProfileId, branchId]);
  }, 60000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanupFixtures();
    const { closePool } = await import('../../../database/mysql.js');
    await closePool().catch(() => {});
    await pool.end();
  });

  async function insertBooking(opts: { status: string; bookingType?: string; createdAt?: string }): Promise<number> {
    const created = opts.createdAt ?? new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version, created_at)
       VALUES (?, (SELECT organisation_id FROM branches WHERE id = ?), ?, ?, ?, '2027-06-01', '09:00:00', '10:00:00',
        300, 20, 180, 100, ?, 'paid', 'wallet', 1, ?)`,
      [PLAYER_USER, branchId, branchId, resourceId, opts.bookingType || 'coach_session', opts.status, created]);
    return (res as any).insertId;
  }

  async function insertSession(bookingId: number | null, status: string, startedAt?: string): Promise<number> {
    const created = startedAt ?? new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const [res] = await pool.execute<RowData>(
      `INSERT INTO coach_sessions (coach_id, player_id, organisation_id, branch_id, resource_id, booking_id, start_time, end_time, status, price, currency_code, platform_commission_pct, requested_at)
       VALUES (?, ?, (SELECT organisation_id FROM branches WHERE id = ?), ?, ?, ?, '2027-06-01 09:00:00', '2027-06-01 10:00:00', ?, 100, 'EGP', 10, ?)`,
      [coachProfileId, PLAYER_USER, branchId, branchId, resourceId, bookingId, status, created]);
    return (res as any).insertId;
  }

  async function sessionStatus(id: number): Promise<string> {
    const [rows] = await pool.execute<RowData>(`SELECT status FROM coach_sessions WHERE id = ?`, [id]);
    return rows.length ? String(rows[0].status) : 'missing';
  }

  async function bookingStatus(id: number): Promise<string | null> {
    const [rows] = await pool.execute<RowData>(`SELECT booking_status FROM bookings WHERE id = ?`, [id]);
    return rows.length ? String(rows[0].booking_status) : null;
  }

  // --- R3 (reverse booking ↔ coach_session reconciliation) helpers ---

  async function insertCapturedPayment(bookingId: number, amount: number): Promise<void> {
    await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, booking_id, reference_type, payment_method, gateway_provider, gateway_reference, amount, payment_status, trace_id)
       VALUES (?, ?, 'booking', 'wallet', 'wallet_system', ?, ?, 'paid', UUID())`,
      [PLAYER_USER, bookingId, `saga_r3_pay_${bookingId}_${Date.now()}_${Math.random()}`, amount],
    );
  }

  async function refundTxCount(bookingId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM transactions WHERE source_type = 'booking' AND source_id = ? AND type = 'refund'`,
      [bookingId],
    );
    return Number(rows[0].cnt);
  }

  async function refundedAmount(bookingId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    return Number(rows[0].refunded_amount);
  }

  async function walletBalance(): Promise<number> {
    const [rows] = await pool.execute<RowData>(`SELECT balance FROM user_wallets WHERE user_id = ?`, [PLAYER_USER]);
    return Number(rows[0].balance);
  }

  it('R1: cancels a coach session linked to a TERMINAL booking; leaves valid sessions untouched', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');

    // Orphan: cancelled booking + active (scheduled) linked session.
    const cancelledBooking = await insertBooking({ status: 'cancelled' });
    const orphanSession = await insertSession(cancelledBooking, 'scheduled');

    // Valid: confirmed booking + active linked session (must NOT be cancelled).
    const validBooking = await insertBooking({ status: 'confirmed' });
    const validSession = await insertSession(validBooking, 'scheduled');

    try {
      await handleSagaRepair({ graceMinutes: 30 });

      expect(await sessionStatus(orphanSession)).toBe('cancelled');
      expect(await sessionStatus(validSession)).toBe('scheduled');
    } finally {
      await pool.execute(`DELETE FROM coach_sessions WHERE id IN (?, ?)`, [orphanSession, validSession]);
      await pool.execute(`DELETE FROM bookings WHERE id IN (?, ?)`, [cancelledBooking, validBooking]);
    }
  });

  it('R1: an already-cancelled session and a freshly-created (in-grace) booking are ignored', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');

    const freshBooking = await insertBooking({ status: 'pending_payment', createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    // Already-cancelled session linked to a cancelled booking (already terminal on both sides).
    const cancelledBooking = await insertBooking({ status: 'cancelled' });
    const cancelledSession = await insertSession(cancelledBooking, 'cancelled');

    try {
      await handleSagaRepair({ graceMinutes: 30 });
      // Fresh booking (within grace, no session) must NOT be compensated.
      expect(await bookingStatus(freshBooking)).toBe('pending_payment');
      // Already-cancelled session stays cancelled (no error, no change).
      expect(await sessionStatus(cancelledSession)).toBe('cancelled');
    } finally {
      await pool.execute(`DELETE FROM coach_sessions WHERE id = ?`, [cancelledSession]);
      await pool.execute(`DELETE FROM bookings WHERE id IN (?, ?)`, [freshBooking, cancelledBooking]);
    }
  });

  it('R2: compensates a session-less coach_session booking stuck beyond the grace window via the canonical path', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');

    const stuckBooking = await insertBooking({ status: 'confirmed' });
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking').mockResolvedValue({ cancelled: true, refunded: false, refundAmount: 0 });

    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(compensateSpy).toHaveBeenCalledWith(stuckBooking, expect.stringContaining('Saga repair'));
      // The canonical path is the ONLY financial decision-maker (no manual refund).
      expect(compensateSpy.mock.calls.length).toBe(1);
    } finally {
      compensateSpy.mockRestore();
      await pool.execute(`DELETE FROM bookings WHERE id = ?`, [stuckBooking]);
    }
  });

  it('R2: ignores a fresh (within-grace) session-less coach_session booking', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');

    const freshBooking = await insertBooking({ status: 'pending_payment', createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking').mockResolvedValue({ cancelled: true, refunded: false, refundAmount: 0 });

    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(compensateSpy).not.toHaveBeenCalledWith(freshBooking, expect.anything());
      expect(await bookingStatus(freshBooking)).toBe('pending_payment');
    } finally {
      compensateSpy.mockRestore();
      await pool.execute(`DELETE FROM bookings WHERE id = ?`, [freshBooking]);
    }
  });

  it('idempotency: running repair twice produces no additional side effects', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');

    const cancelledBooking = await insertBooking({ status: 'cancelled' });
    const orphanSession = await insertSession(cancelledBooking, 'scheduled');

    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(await sessionStatus(orphanSession)).toBe('cancelled');
      // Second run: the session is already cancelled → no change, no error.
      await handleSagaRepair({ graceMinutes: 30 });
      expect(await sessionStatus(orphanSession)).toBe('cancelled');
    } finally {
      await pool.execute(`DELETE FROM coach_sessions WHERE id = ?`, [orphanSession]);
      await pool.execute(`DELETE FROM bookings WHERE id = ?`, [cancelledBooking]);
    }
  });

  it('multiple stale records are processed in a bounded batch', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');

    const booking1 = await insertBooking({ status: 'cancelled' });
    const booking2 = await insertBooking({ status: 'cancelled' });
    const s1 = await insertSession(booking1, 'scheduled');
    const s2 = await insertSession(booking2, 'pending_acceptance');

    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(await sessionStatus(s1)).toBe('cancelled');
      expect(await sessionStatus(s2)).toBe('cancelled');
    } finally {
      await pool.execute(`DELETE FROM coach_sessions WHERE id IN (?, ?)`, [s1, s2]);
      await pool.execute(`DELETE FROM bookings WHERE id IN (?, ?)`, [booking1, booking2]);
    }
  });

  it('error isolation: a failing compensation record does not block the remaining batch', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');

    const stuck1 = await insertBooking({ status: 'confirmed' });
    const stuck2 = await insertBooking({ status: 'confirmed' });
    // First compensation fails; second succeeds.
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ cancelled: true, refunded: false, refundAmount: 0 });

    try {
      await handleSagaRepair({ graceMinutes: 30 });
      // Both were attempted (error on one does not stop the loop).
      expect(compensateSpy).toHaveBeenCalledTimes(2);
      const calledIds = compensateSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calledIds).toContain(stuck1);
      expect(calledIds).toContain(stuck2);
    } finally {
      compensateSpy.mockRestore();
      await pool.execute(`DELETE FROM bookings WHERE id IN (?, ?)`, [stuck1, stuck2]);
    }
  });

  describe('R3 — reverse booking ↔ coach_session reconciliation', () => {
    const R3_REASON = 'Saga repair: linked coach session cancelled';

    async function r3Fixture(status: string): Promise<{ bookingId: number; sessionId: number }> {
    const bookingId = await insertBooking({ status });
    const sessionId = await insertSession(bookingId, 'cancelled');
    return { bookingId, sessionId };
  }

  async function deleteR3Fixture(sessionId: number, bookingId: number): Promise<void> {
    await pool.execute(`DELETE FROM coach_sessions WHERE id = ?`, [sessionId]);
    await pool.execute(`DELETE FROM payment_transactions WHERE booking_id = ?`, [bookingId]);
    await pool.execute(`DELETE FROM transaction_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE source_id = ?)`, [bookingId]);
    await pool.execute(`DELETE FROM transactions WHERE source_id = ?`, [bookingId]);
    await pool.execute(`DELETE FROM bookings WHERE id = ?`, [bookingId]);
  }

  it('R3: cancels an active coach booking whose linked coach session is cancelled (no money moved → no refund)', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingId, sessionId } = await r3Fixture('confirmed');
    const before = await walletBalance();
    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(await bookingStatus(bookingId)).toBe('cancelled');
      expect(await sessionStatus(sessionId)).toBe('cancelled');
      expect(await refundedAmount(bookingId)).toBe(0);
      expect(await refundTxCount(bookingId)).toBe(0);
      expect(await walletBalance()).toBe(before);
    } finally {
      await deleteR3Fixture(sessionId, bookingId);
    }
  });

  it('R3: refunds through the canonical booking path when the booking already moved money', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingId, sessionId } = await r3Fixture('confirmed');
    await insertCapturedPayment(bookingId, 300);
    const before = await walletBalance();
    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(await bookingStatus(bookingId)).toBe('cancelled');
      expect(await refundedAmount(bookingId)).toBe(300);
      expect(await refundTxCount(bookingId)).toBe(1);
      expect(await walletBalance()).toBe(before + 300);
    } finally {
      await deleteR3Fixture(sessionId, bookingId);
    }
  });

  it('R3: an already-cancelled booking + cancelled session → no duplicate cancellation/refund', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const bookingId = await insertBooking({ status: 'cancelled' });
    await pool.execute(`UPDATE bookings SET refunded_amount = 300 WHERE id = ?`, [bookingId]);
    const sessionId = await insertSession(bookingId, 'cancelled');
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking');
    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(await bookingStatus(bookingId)).toBe('cancelled');
      expect(await refundedAmount(bookingId)).toBe(300);
      expect(compensateSpy).not.toHaveBeenCalledWith(bookingId, expect.anything());
      expect(await refundTxCount(bookingId)).toBe(0);
    } finally {
      compensateSpy.mockRestore();
      await deleteR3Fixture(sessionId, bookingId);
    }
  });

  it('R3: running repair twice produces exactly one financial effect', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingId, sessionId } = await r3Fixture('confirmed');
    await insertCapturedPayment(bookingId, 300);
    const before = await walletBalance();
    try {
      await handleSagaRepair({ graceMinutes: 30 });
      await handleSagaRepair({ graceMinutes: 30 });
      expect(await bookingStatus(bookingId)).toBe('cancelled');
      expect(await refundedAmount(bookingId)).toBe(300);
      expect(await refundTxCount(bookingId)).toBe(1);
      expect(await walletBalance()).toBe(before + 300);
    } finally {
      await deleteR3Fixture(sessionId, bookingId);
    }
  });

  it('R3 race: session stops being cancelled between the scan and the action → skipped', async () => {
    const worker = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const { bookingId, sessionId } = await r3Fixture('confirmed');
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking');
    try {
      // Injectable guard: the candidate scan already saw the cancelled session,
      // but state changes in the scan→act window. The re-check sees the updated
      // state and the worker must skip (no compensation).
      await worker.runR3Reconciliation(async (sid: number, bid: number) => {
        await pool.execute(`UPDATE coach_sessions SET status = 'scheduled' WHERE id = ?`, [sid]);
        return worker.refreshR3Candidate(sid, bid);
      });
      expect(compensateSpy).not.toHaveBeenCalled();
      expect(await bookingStatus(bookingId)).toBe('confirmed');
      expect(await sessionStatus(sessionId)).toBe('scheduled');
    } finally {
      compensateSpy.mockRestore();
      await deleteR3Fixture(sessionId, bookingId);
    }
  });

  it('R3 race: booking becomes terminal between the scan and the action → skipped', async () => {
    const worker = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const { bookingId, sessionId } = await r3Fixture('confirmed');
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking');
    try {
      await worker.runR3Reconciliation(async (sid: number, bid: number) => {
        await pool.execute(`UPDATE bookings SET booking_status = 'completed' WHERE id = ?`, [bid]);
        return worker.refreshR3Candidate(sid, bid);
      });
      expect(compensateSpy).not.toHaveBeenCalled();
      expect(await bookingStatus(bookingId)).toBe('completed');
    } finally {
      compensateSpy.mockRestore();
      await deleteR3Fixture(sessionId, bookingId);
    }
  });

  it('R3: a non-coach booking linked to a cancelled session is ignored', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const bookingId = await insertBooking({ status: 'confirmed', bookingType: 'academy' });
    const sessionId = await insertSession(bookingId, 'cancelled');
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking');
    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(await bookingStatus(bookingId)).toBe('confirmed');
      expect(await sessionStatus(sessionId)).toBe('cancelled');
      expect(compensateSpy).not.toHaveBeenCalledWith(bookingId, expect.anything());
    } finally {
      compensateSpy.mockRestore();
      await deleteR3Fixture(sessionId, bookingId);
    }
  });

  it('R3: legacy (unlinked) cancelled/active sessions are never treated as reconciliation candidates', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const legacyCancelled = await insertSession(null, 'cancelled');
    const legacyActive = await insertSession(null, 'pending_acceptance');
    const bookingId = await insertBooking({ status: 'confirmed' });
    const livingSession = await insertSession(bookingId, 'scheduled');
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking');
    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(await sessionStatus(legacyCancelled)).toBe('cancelled');
      expect(await sessionStatus(legacyActive)).toBe('pending_acceptance');
      expect(await sessionStatus(livingSession)).toBe('scheduled');
      expect(await bookingStatus(bookingId)).toBe('confirmed');
      expect(compensateSpy).not.toHaveBeenCalled();
    } finally {
      compensateSpy.mockRestore();
      await deleteR3Fixture(livingSession, bookingId);
      await pool.execute(`DELETE FROM coach_sessions WHERE id IN (?, ?)`, [legacyCancelled, legacyActive]);
    }
  });

  it('R3: a failing reconciliation is isolated — remaining candidates are still processed', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const fail = await r3Fixture('confirmed');
    const good = await r3Fixture('confirmed');
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking')
      .mockImplementation(async (bid: number) => {
        if (bid === fail.bookingId) throw new Error('boom');
        return { cancelled: true, refunded: false, refundAmount: 0 };
      });
    try {
      await handleSagaRepair({ graceMinutes: 30 });
      const calledIds = compensateSpy.mock.calls.map((c: any[]) => c[0]);
      expect(calledIds).toContain(fail.bookingId);
      expect(calledIds).toContain(good.bookingId);
    } finally {
      compensateSpy.mockRestore();
      await deleteR3Fixture(fail.sessionId, fail.bookingId);
      await deleteR3Fixture(good.sessionId, good.bookingId);
    }
  });

  it('R3: batch limit is enforced even when far more candidates exist', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const fixtures: Array<{ bookingId: number; sessionId: number }> = [];
    for (let i = 0; i < 105; i += 1) {
      const bookingId = await insertBooking({ status: 'confirmed' });
      const sessionId = await insertSession(bookingId, 'cancelled');
      fixtures.push({ bookingId, sessionId });
    }
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking')
      .mockResolvedValue({ cancelled: true, refunded: false, refundAmount: 0 });
    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(compensateSpy.mock.calls.length).toBe(100);
    } finally {
      compensateSpy.mockRestore();
      for (const f of fixtures) {
        await pool.execute(`DELETE FROM coach_sessions WHERE id = ?`, [f.sessionId]);
        await pool.execute(`DELETE FROM bookings WHERE id = ?`, [f.bookingId]);
      }
    }
  });

  it('R3: pending and pending_payment bookings are also valid R3 candidates', async () => {
    const { handleSagaRepair } = await import('../infrastructure/saga-repair.worker.js');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const pending = await r3Fixture('pending');
    const pendingPayment = await r3Fixture('pending_payment');
    const compensationLog: number[] = [];
    const compensateSpy = vi.spyOn(bookingService, 'compensateFailedBooking')
      .mockImplementation(async (bid: number) => {
        compensationLog.push(bid);
        return { cancelled: true, refunded: false, refundAmount: 0 };
      });
    try {
      await handleSagaRepair({ graceMinutes: 30 });
      expect(compensationLog).toContain(pending.bookingId);
      expect(compensationLog).toContain(pendingPayment.bookingId);
    } finally {
      compensateSpy.mockRestore();
      await deleteR3Fixture(pending.sessionId, pending.bookingId);
      await deleteR3Fixture(pendingPayment.sessionId, pendingPayment.bookingId);
    }
  });
  });
});