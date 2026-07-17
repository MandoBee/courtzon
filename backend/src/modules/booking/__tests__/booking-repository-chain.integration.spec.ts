import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startContainers, runSchema, stopContainers, applyTestProcessEnv, TestContext } from '../../../tests/helpers/integration-setup.js';
import { createPool, getPool } from '../../../database/mysql.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { TimeEngine } from '../../time/time-engine.js';
import type { BookingConflict } from '../../time/types.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await startContainers();
  await runSchema(ctx.mysqlPort);
  applyTestProcessEnv(ctx);

  createPool({
    host: '127.0.0.1',
    port: ctx.mysqlPort,
    user: 'root',
    password: 'test',
    database: 'courtzon_test',
  });
}, 120000);

afterAll(async () => {
  await stopContainers();
}, 30000);

describe('Repository → TimeEngine contract: findBookingsByBusinessDate returns camelCase', () => {
  it('findBookingsByBusinessDate returns startAtUtc/endAtUtc (camelCase), not start_at_utc/end_at_utc', async () => {
    const pool = getPool();

    // Find a resource and branch to insert test data
    const [resources] = await pool.execute<any[]>(
      `SELECT r.id as resourceId, r.branch_id as branchId
       FROM resources r WHERE r.is_active = TRUE LIMIT 1`
    );
    if (resources.length === 0) return;
    const { resourceId, branchId } = resources[0];

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    // Insert a confirmed booking with UTC timestamps
    await pool.execute(
      `INSERT INTO bookings (user_id, organisation_id, resource_id, branch_id, booking_type,
        booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
        total_amount, payment_status, booking_status, visibility)
       VALUES (1, 1, ?, ?, 'public_match', ?, ?, '10:00', '11:00',
        CONCAT(?, 'T08:00:00.000Z'), CONCAT(?, 'T09:00:00.000Z'),
        100.00, 'paid', 'confirmed', 'public')`,
      [resourceId, branchId, dateStr, dateStr, dateStr, dateStr]
    );

    try {
      // Call the REAL repository method
      const rawBookings = await bookingRepository.findBookingsByBusinessDate(resourceId, dateStr);

      expect(rawBookings.length).toBeGreaterThan(0);

      // THE CONTRACT: output must have camelCase properties
      const booking = rawBookings[0];
      expect(booking).toHaveProperty('startAtUtc');
      expect(booking).toHaveProperty('endAtUtc');
      // Must NOT have the broken snake_case properties as primary access
      expect(typeof booking.startAtUtc).toBe('string');
      expect(typeof booking.endAtUtc).toBe('string');
      expect(booking.startAtUtc.length).toBeGreaterThan(0);
      expect(booking.endAtUtc.length).toBeGreaterThan(0);

      // Now pass directly to TimeEngine — this is the critical integration test
      const slots = TimeEngine.generateSlots(dateStr, '08:00', '22:00', 60, 'Africa/Cairo');

      // Map like booking.service.ts does
      const existingBookings: BookingConflict[] = rawBookings
        .filter((b) => b.startAtUtc && b.endAtUtc)
        .map((b) => ({ startAtUtc: b.startAtUtc, endAtUtc: b.endAtUtc }));

      const resolved = TimeEngine.resolveAvailability(slots, existingBookings);

      // The 10:00-11:00 local slot (08:00-09:00 UTC) must be booked
      const targetSlot = resolved.find(
        (s) => s.localStartTime === '10:00' && s.localEndTime === '11:00'
      );
      expect(targetSlot).toBeDefined();
      expect(targetSlot!.status).toBe('booked');
    } finally {
      // Cleanup: remove test booking
      await pool.execute(
        `DELETE FROM bookings WHERE resource_id = ? AND booking_status = 'confirmed' AND user_id = 1`,
        [resourceId]
      );
    }
  });

  it('detects pending booking intents as conflicts', async () => {
    const pool = getPool();

    const [resources] = await pool.execute<any[]>(
      `SELECT r.id as resourceId, r.branch_id as branchId
       FROM resources r WHERE r.is_active = TRUE LIMIT 1`
    );
    if (resources.length === 0) return;
    const { resourceId, branchId } = resources[0];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    // Insert a pending booking intent
    await pool.execute(
      `INSERT INTO booking_intents (user_id, resource_id, branch_id, booking_type,
        booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
        intent_status, expires_at)
       VALUES (1, ?, ?, 'public_match', ?, ?, '14:00', '15:00',
        CONCAT(?, 'T12:00:00.000Z'), CONCAT(?, 'T13:00:00.000Z'),
        'pending', DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
      [resourceId, branchId, dateStr, dateStr, dateStr, dateStr]
    );

    try {
      const rawBookings = await bookingRepository.findBookingsByBusinessDate(resourceId, dateStr);

      const existingBookings: BookingConflict[] = rawBookings
        .filter((b) => b.startAtUtc && b.endAtUtc)
        .map((b) => ({ startAtUtc: b.startAtUtc, endAtUtc: b.endAtUtc }));

      const slots = TimeEngine.generateSlots(dateStr, '08:00', '22:00', 60, 'Africa/Cairo');
      const resolved = TimeEngine.resolveAvailability(slots, existingBookings);

      // The 15:00-16:00 local slot (12:00-13:00 UTC) must be booked by the intent
      const targetSlot = resolved.find(
        (s) => s.localStartTime === '15:00' && s.localEndTime === '16:00'
      );
      expect(targetSlot).toBeDefined();
      expect(targetSlot!.status).toBe('booked');
    } finally {
      await pool.execute(
        `DELETE FROM booking_intents WHERE resource_id = ? AND intent_status = 'pending'`,
        [resourceId]
      );
    }
  });

  it('all slot types blocked: confirmed booking, pending intent, payment_initiated intent', async () => {
    const pool = getPool();

    const [resources] = await pool.execute<any[]>(
      `SELECT r.id as resourceId, r.branch_id as branchId
       FROM resources r WHERE r.is_active = TRUE LIMIT 1`
    );
    if (resources.length === 0) return;
    const { resourceId, branchId } = resources[0];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    // Insert confirmed booking (08:00-09:00 UTC = 11:00-12:00 local)
    await pool.execute(
      `INSERT INTO bookings (user_id, organisation_id, resource_id, branch_id, booking_type,
        booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
        total_amount, payment_status, booking_status, visibility)
       VALUES (1, 1, ?, ?, 'public_match', ?, ?, '11:00', '12:00',
        CONCAT(?, 'T08:00:00.000Z'), CONCAT(?, 'T09:00:00.000Z'),
        100.00, 'paid', 'confirmed', 'public')`,
      [resourceId, branchId, dateStr, dateStr, dateStr, dateStr]
    );

    // Insert pending intent (10:00-11:00 UTC = 13:00-14:00 local)
    await pool.execute(
      `INSERT INTO booking_intents (user_id, resource_id, branch_id, booking_type,
        booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
        intent_status, expires_at)
       VALUES (1, ?, ?, 'public_match', ?, ?, '13:00', '14:00',
        CONCAT(?, 'T10:00:00.000Z'), CONCAT(?, 'T11:00:00.000Z'),
        'pending', DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
      [resourceId, branchId, dateStr, dateStr, dateStr, dateStr]
    );

    // Insert payment_initiated intent (11:00-12:00 UTC = 14:00-15:00 local)
    await pool.execute(
      `INSERT INTO booking_intents (user_id, resource_id, branch_id, booking_type,
        booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
        intent_status, expires_at)
       VALUES (1, ?, ?, 'public_match', ?, ?, '14:00', '15:00',
        CONCAT(?, 'T11:00:00.000Z'), CONCAT(?, 'T12:00:00.000Z'),
        'payment_initiated', DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
      [resourceId, branchId, dateStr, dateStr, dateStr, dateStr]
    );

    try {
      const rawBookings = await bookingRepository.findBookingsByBusinessDate(resourceId, dateStr);

      const existingBookings: BookingConflict[] = rawBookings
        .filter((b) => b.startAtUtc && b.endAtUtc)
        .map((b) => ({ startAtUtc: b.startAtUtc, endAtUtc: b.endAtUtc }));

      const slots = TimeEngine.generateSlots(dateStr, '08:00', '22:00', 60, 'Africa/Cairo');
      const resolved = TimeEngine.resolveAvailability(slots, existingBookings);

      // 11:00-12:00 booked (confirmed)
      const slot11 = resolved.find((s) => s.localStartTime === '11:00');
      expect(slot11!.status).toBe('booked');

      // 13:00-14:00 booked (pending intent)
      const slot13 = resolved.find((s) => s.localStartTime === '13:00');
      expect(slot13!.status).toBe('booked');

      // 14:00-15:00 booked (payment_initiated intent)
      const slot14 = resolved.find((s) => s.localStartTime === '14:00');
      expect(slot14!.status).toBe('booked');

      // 12:00-13:00 still available
      const slot12 = resolved.find((s) => s.localStartTime === '12:00');
      expect(slot12!.status).toBe('available');
    } finally {
      await pool.execute(
        `DELETE FROM bookings WHERE resource_id = ? AND booking_status = 'confirmed' AND user_id = 1`,
        [resourceId]
      );
      await pool.execute(
        `DELETE FROM booking_intents WHERE resource_id = ? AND intent_status IN ('pending', 'payment_initiated')`,
        [resourceId]
      );
    }
  });
});
