import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

let pool: mysql.Pool;
const TEST_USER = 999998;
const TEST_BRANCH = 999999;
const TEST_RESOURCE = 999999;
const TEST_DATE = '2027-12-25';
const TEST_START = '10:00';
const TEST_END = '11:00';

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  // Clean up
  await pool.execute(`DELETE FROM booking_cancellations WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM bookings WHERE user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM payment_transactions WHERE gateway_reference LIKE 'test_book_%'`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM users WHERE id = ${TEST_USER}`);

  // Create test user + wallet
  await pool.execute(`INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (${TEST_USER}, UUID(), 1, '01299999998', '+201299999998', 'test-book@test.com', '$2b$10$test', 'Test Booker', 'male', 'active')`);
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (${TEST_USER}, 9999999, 'EGP', 1)`);

  // Create test branch + resource if not exists
  const [orgs] = await pool.execute<any[]>('SELECT id FROM organisations LIMIT 1');
  const orgId = orgs[0].id;
  await pool.execute(`INSERT IGNORE INTO branches (id, organisation_id, name, slug) VALUES (${TEST_BRANCH}, ${orgId}, 'Test Concurrency Branch', 'test-concurrency-branch')`);
  await pool.execute(`INSERT IGNORE INTO resources (id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time) VALUES (${TEST_RESOURCE}, ${TEST_BRANCH}, 1, 'Test Court', 1, 50, '08:00:00', '22:00:00')`);
});

afterAll(async () => {
  await pool.execute(`DELETE FROM booking_cancellations WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM bookings WHERE user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM payment_transactions WHERE gateway_reference LIKE 'test_book_%'`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM users WHERE id = ${TEST_USER}`);
  await pool.end();
});

describe('Booking Concurrency', () => {
  it('raw duplicate INSERTs are allowed at DB level (status-blind unique key removed)', async () => {
    // Group D: uq_booking_slot was removed. The database no longer rejects
    // identical (resource_id, booking_date, start_time) rows — overlap safety
    // is enforced by the authoritative service-layer availability guard
    // (resource-row serialization + overlap check), not by a unique key.
    const uuid1 = require('crypto').randomUUID();
    const uuid2 = require('crypto').randomUUID();

    await pool.execute(`INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time, total_amount, booking_status, payment_status)
      VALUES (?, ${TEST_USER}, 1, ${TEST_BRANCH}, ${TEST_RESOURCE}, 'public_match', ?, ?, ?, 50, 'confirmed', 'paid')`,
      [uuid1, TEST_DATE, TEST_START, TEST_END]);

    // Second identical-slot booking is allowed at the raw DB level (no unique
    // collision). Booking concurrency is the responsibility of the service layer.
    await expect(
      pool.execute(`INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time, total_amount, booking_status, payment_status)
        VALUES (?, ${TEST_USER}, 1, ${TEST_BRANCH}, ${TEST_RESOURCE}, 'public_match', ?, ?, ?, 50, 'confirmed', 'paid')`,
        [uuid2, TEST_DATE, TEST_START, TEST_END])
    ).resolves.toBeDefined();
  });

  it('concurrent raw identical inserts no longer collide (service layer enforces availability)', async () => {
    // Different date to avoid interference with the previous test.
    const date2 = '2027-12-26';
    const start = '14:00';
    const end = '15:00';

    await pool.execute(`DELETE FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`, [date2]);

    const uuid = () => require('crypto').randomUUID();

    const results: string[] = [];

    // Run 5 concurrent raw INSERTs of the same slot. With uq_booking_slot
    // removed, all succeed at the DB level. Service-layer concurrency safety is
    // covered separately in booking.concurrency.service.spec.ts (identical-slot
    // race → exactly one booking + ConflictError for the loser).
    const promises = Array.from({ length: 5 }, async (_, i) => {
      try {
        await pool.execute(`INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time, total_amount, booking_status, payment_status)
          VALUES (?, ${TEST_USER}, 1, ${TEST_BRANCH}, ${TEST_RESOURCE}, 'public_match', ?, ?, ?, 50, 'confirmed', 'paid')`,
          [uuid(), date2, start, end]);
        results.push('success');
      } catch (e: any) {
        results.push('error: ' + e.message);
      }
    });

    await Promise.all(promises);

    // All 5 succeed at the raw DB level (no unique-key rejection anymore).
    const successes = results.filter(r => r === 'success').length;
    expect(successes).toBe(5);
  });

  it('cancellation: INSERT + UPDATE are atomic in transaction', async () => {
    const date3 = '2027-12-27';
    const start3 = '16:00';
    const end3 = '17:00';

    await pool.execute(`DELETE FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`, [date3]);
    const bid = (await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time, total_amount, booking_status, payment_status)
       VALUES (?, ${TEST_USER}, 1, ${TEST_BRANCH}, ${TEST_RESOURCE}, 'public_match', ?, ?, ?, 50, 'confirmed', 'paid')`,
      [require('crypto').randomUUID(), date3, start3, end3]
    ))[0].insertId;

    // Simulate transactional cancellation
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('INSERT INTO booking_cancellations (booking_id, cancelled_by, reason, refund_amount) VALUES (?, ?, ?, ?)',
        [bid, TEST_USER, 'Test cancel', 50]);
      await conn.execute("UPDATE bookings SET booking_status = 'cancelled', payment_status = 'refunded' WHERE id = ?", [bid]);
      await conn.commit();

      const [bookings] = await conn.execute<any[]>('SELECT booking_status, payment_status FROM bookings WHERE id = ?', [bid]);
      expect(bookings[0].booking_status).toBe('cancelled');
      expect(bookings[0].payment_status).toBe('refunded');

      const [cancellations] = await conn.execute<any[]>('SELECT COUNT(*) as cnt FROM booking_cancellations WHERE booking_id = ?', [bid]);
      expect(cancellations[0].cnt).toBe(1);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  });

  it('cancellation rollback prevents orphaned cancellation record', async () => {
    const date4 = '2027-12-28';
    const start4 = '18:00';
    const end4 = '19:00';

    await pool.execute(`DELETE FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`, [date4]);
    const bid = (await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time, total_amount, booking_status, payment_status)
       VALUES (?, ${TEST_USER}, 1, ${TEST_BRANCH}, ${TEST_RESOURCE}, 'public_match', ?, ?, ?, 50, 'confirmed', 'paid')`,
      [require('crypto').randomUUID(), date4, start4, end4]
    ))[0].insertId;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('INSERT INTO booking_cancellations (booking_id, cancelled_by, reason, refund_amount) VALUES (?, ?, ?, ?)',
        [bid, TEST_USER, 'Test cancel rollback', 50]);
      // Simulate failure
      throw new Error('Simulated failure');
    } catch {
      await conn.rollback();
    } finally {
      conn.release();
    }

    // Booking should still be confirmed (not cancelled)
    const [bookings] = await pool.execute<any[]>('SELECT booking_status FROM bookings WHERE id = ?', [bid]);
    expect(bookings[0].booking_status).toBe('confirmed');

    // No cancellation record should exist
    const [cancellations] = await pool.execute<any[]>('SELECT COUNT(*) as cnt FROM booking_cancellations WHERE booking_id = ?', [bid]);
    expect(cancellations[0].cnt).toBe(0);
  });
});
