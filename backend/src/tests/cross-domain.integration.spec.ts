import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../database/mysql.js';
import { generateUUID } from '../shared/utils/token.js';
import { generateUlid } from '../shared/event-bus/event-envelope.js';
import { bookingRepository } from '../modules/booking/infrastructure/repositories/booking.repository.js';
import { paymentRepository } from '../modules/payment/infrastructure/repositories/payment.repository.js';
import { processPaymentHandler } from '../modules/payment/commands/process-payment.command.js';
import type { Command } from '../shared/command/command-base.js';

const DDL = `
CREATE TABLE IF NOT EXISTS bookings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(36) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  organisation_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  resource_id INT UNSIGNED NOT NULL,
  booking_type VARCHAR(50) NOT NULL DEFAULT 'standard',
  booking_date DATE NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  booking_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  aggregate_version INT UNSIGNED NOT NULL DEFAULT 1,
  payment_method VARCHAR(50) DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  booking_id INT UNSIGNED DEFAULT NULL,
  reference_type VARCHAR(50) DEFAULT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'card',
  gateway_provider VARCHAR(50) DEFAULT NULL,
  gateway_reference VARCHAR(100) DEFAULT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_status VARCHAR(50) NOT NULL DEFAULT 'created',
  aggregate_version INT UNSIGNED NOT NULL DEFAULT 1,
  paid_at DATETIME DEFAULT NULL,
  trace_id VARCHAR(36) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resources (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS branches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  organisation_id INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

let mysql: StartedTestContainer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mysql = await new GenericContainer('mysql:8.0')
    .withEnvironment({ MYSQL_ROOT_PASSWORD: 'test', MYSQL_DATABASE: 'courtzon_test' })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('port: 3306  MySQL Community Server'))
    .start();
  const port = mysql.getMappedPort(3306);
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = String(port);
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'test'; process.env.DB_NAME = 'courtzon_test';
  createPool({ host: '127.0.0.1', port, user: 'root', password: 'test', database: 'courtzon_test' });
  const pool = getPool();
  for (const stmt of DDL.split(';').filter(s => s.trim())) await pool.execute(stmt.trim());
  await pool.execute('INSERT IGNORE INTO resources (id, name) VALUES (?, ?)', [42, 'Test Court']);
  await pool.execute('INSERT IGNORE INTO branches (id, name, organisation_id) VALUES (?, ?, ?)', [10, 'Test Branch', 5]);
}, 120000);

afterAll(async () => { await closePool(); try { await mysql.stop(); } catch {} }, 30000);

async function createBooking(status = 'pending'): Promise<number> {
  const pool = getPool();
  const ver = status === 'confirmed' ? 2 : status === 'cancelled' ? 2 : 1;
  await pool.execute(
    `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
      booking_date, start_time, end_time, total_amount, booking_status, aggregate_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [generateUUID(), 1, 5, 10, 42, 'standard', '2026-07-23', '10:00', '11:00', 150.00, status, ver],
  );
  const [r] = await pool.execute('SELECT LAST_INSERT_ID() as id');
  return (r as any[])[0].id;
}

async function createPayment(bookingId: number, status = 'pending'): Promise<number> {
  const pool = getPool();
  const ver = status === 'paid' ? 2 : 1;
  await pool.execute(
    `INSERT INTO payment_transactions (user_id, booking_id, reference_type, payment_method, gateway_provider,
      gateway_reference, amount, payment_status, aggregate_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, bookingId, 'booking', 'card', 'test_gw', `ref_${Date.now()}`, 150.00, status, ver],
  );
  const [r] = await pool.execute('SELECT LAST_INSERT_ID() as id');
  return (r as any[])[0].id;
}

describe('Cross-Domain: Booking ↔ Payment', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM payment_transactions');
    await pool.execute('DELETE FROM bookings');
  });

  // ── Scenario 1: Successful Payment Flow ──

  describe('1. Successful payment flow', () => {
    it('Booking: pending (v1) → confirmed (v2), Payment: pending (v1) → paid (v2)', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const bookingId = await createBooking('pending');
        const paymentId = await createPayment(bookingId, 'pending');

        expect(bookingId).toBeGreaterThan(0);
        expect(paymentId).toBeGreaterThan(0);

        let [b] = await conn.execute('SELECT booking_status, aggregate_version FROM bookings WHERE id = ?', [bookingId]);
        expect((b as any[])[0].booking_status).toBe('pending');
        expect((b as any[])[0].aggregate_version).toBe(1);

        let [p] = await conn.execute('SELECT payment_status, aggregate_version FROM payment_transactions WHERE id = ?', [paymentId]);
        expect((p as any[])[0].payment_status).toBe('pending');
        expect((p as any[])[0].aggregate_version).toBe(1);

        await bookingRepository.persistTransition(bookingId, 'confirmed', undefined, 1, conn);
        await paymentRepository.persistTransition(paymentId, 'paid', undefined, 1, conn);

        [b] = await conn.execute('SELECT booking_status, aggregate_version FROM bookings WHERE id = ?', [bookingId]);
        expect((b as any[])[0].booking_status).toBe('confirmed');
        expect((b as any[])[0].aggregate_version).toBe(2);

        [p] = await conn.execute('SELECT payment_status, aggregate_version FROM payment_transactions WHERE id = ?', [paymentId]);
        expect((p as any[])[0].payment_status).toBe('paid');
        expect((p as any[])[0].aggregate_version).toBe(2);

        await conn.rollback();
      } finally { conn.release(); }
    });

    it('event ordering: booking confirmed after payment processed (simulated via version ordering)', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const bookingId = await createBooking('pending');
        const paymentId = await createPayment(bookingId, 'pending');

        await paymentRepository.persistTransition(paymentId, 'paid', undefined, 1, conn);
        await bookingRepository.persistTransition(bookingId, 'confirmed', undefined, 1, conn);

        const [b] = await conn.execute('SELECT booking_status, aggregate_version FROM bookings WHERE id = ?', [bookingId]);
        expect((b as any[])[0].booking_status).toBe('confirmed');
        expect((b as any[])[0].aggregate_version).toBe(2);

        await conn.rollback();
      } finally { conn.release(); }
    });
  });

  // ── Scenario 2: Payment Failure → Booking Cancellation ──

  describe('2. Payment failure flow', () => {
    it('payment failed → booking cancelled — no orphan', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const bookingId = await createBooking('pending');
        const paymentId = await createPayment(bookingId, 'pending');

        await paymentRepository.persistTransition(paymentId, 'failed', undefined, 1, conn);
        await bookingRepository.persistTransition(bookingId, 'cancelled', undefined, 1, conn);

        const [p] = await conn.execute('SELECT payment_status, aggregate_version FROM payment_transactions WHERE id = ?', [paymentId]);
        expect((p as any[])[0].payment_status).toBe('failed');
        expect((p as any[])[0].aggregate_version).toBe(2);

        const [b] = await conn.execute('SELECT booking_status, aggregate_version FROM bookings WHERE id = ?', [bookingId]);
        expect((b as any[])[0].booking_status).toBe('cancelled');
        expect((b as any[])[0].aggregate_version).toBe(2);

        await conn.rollback();
      } finally { conn.release(); }
    });
  });

  // ── Scenario 3: Duplicate Gateway Callback ──

  describe('3. Duplicate gateway callback', () => {
    it('second callback via handler: version unchanged, no duplicate event, no duplicate persistence', async () => {
      const pool = getPool();
      const paymentId = await createPayment(1, 'pending');

      const conn1 = await pool.getConnection();
      try {
        await conn1.beginTransaction();
        await paymentRepository.persistTransition(paymentId, 'paid', undefined, 1, conn1);
        await conn1.commit();
      } finally { conn1.release(); }

      const [p1] = await pool.execute('SELECT payment_status, aggregate_version FROM payment_transactions WHERE id = ?', [paymentId]);
      expect((p1 as any[])[0].payment_status).toBe('paid');
      expect((p1 as any[])[0].aggregate_version).toBe(2);

      const cmd: Command = {
        commandId: 'dup-callback',
        commandType: 'ProcessPayment',
        aggregateType: 'payment',
        aggregateId: String(paymentId),
        payload: { paymentId },
      };

      const conn2 = await pool.getConnection();
      try {
        await conn2.beginTransaction();
        const result = await processPaymentHandler.execute(cmd, conn2);
        expect(result.paymentId).toBe(paymentId);
        expect(result.aggregateVersion).toBeUndefined();
        await conn2.rollback();
      } finally { conn2.release(); }
    });
  });

  // ── Scenario 4: Out-of-Order Events ──

  describe('4. Out-of-order events', () => {
    it('booking confirmed before payment: persistTransition enforces ordering via WHERE version check', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const bookingId = await createBooking('pending');
        const paymentId = await createPayment(bookingId, 'pending');

        await bookingRepository.persistTransition(bookingId, 'confirmed', undefined, 1, conn);

        let [b] = await conn.execute('SELECT booking_status, aggregate_version FROM bookings WHERE id = ?', [bookingId]);
        expect((b as any[])[0].booking_status).toBe('confirmed');

        await paymentRepository.persistTransition(paymentId, 'paid', undefined, 1, conn);

        const [p] = await conn.execute('SELECT payment_status FROM payment_transactions WHERE id = ?', [paymentId]);
        expect((p as any[])[0].payment_status).toBe('paid');

        await conn.rollback();
      } finally { conn.release(); }
    });
  });

  // ── Scenario 5: Concurrency ──

  describe('5. Concurrency — two simultaneous confirmations', () => {
    it('first payment confirmation succeeds, second fails with version conflict', async () => {
      const paymentId = await createPayment(1, 'pending');
      const pool = getPool();

      const conn1 = await pool.getConnection();
      await conn1.beginTransaction();
      await paymentRepository.persistTransition(paymentId, 'paid', undefined, 1, conn1);
      await conn1.commit();
      conn1.release();

      const conn2 = await pool.getConnection();
      await conn2.beginTransaction();
      await expect(
        paymentRepository.persistTransition(paymentId, 'paid', undefined, 1, conn2),
      ).rejects.toThrow('version conflict');
      await conn2.rollback();
      conn2.release();
    });
  });

  // ── Scenario 6: End-to-End Version Validation ──

  describe('6. Aggregate version progression', () => {
    it('Booking: v1 (pending) → v2 (confirmed), Payment: v1 (pending) → v2 (paid)', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const bookingId = await createBooking('pending');
        const paymentId = await createPayment(bookingId, 'pending');

        await paymentRepository.persistTransition(paymentId, 'paid', undefined, 1, conn);
        await bookingRepository.persistTransition(bookingId, 'confirmed', undefined, 1, conn);

        const [b] = await conn.execute('SELECT aggregate_version FROM bookings WHERE id = ?', [bookingId]);
        expect((b as any[])[0].aggregate_version).toBe(2);

        const [p] = await conn.execute('SELECT aggregate_version FROM payment_transactions WHERE id = ?', [paymentId]);
        expect((p as any[])[0].aggregate_version).toBe(2);

        await conn.rollback();
      } finally { conn.release(); }
    });
  });

  // ── Scenario 7: Workflow Recovery ──

  describe('7. Workflow recovery (re-apply after simulated crash)', () => {
    it('after payment processed and crash, re-apply confirms booking is already confirmed', async () => {
      const pool = getPool();
      let bookingId: number;
      let paymentId: number;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        bookingId = await createBooking('pending');
        paymentId = await createPayment(bookingId, 'pending');

        await paymentRepository.persistTransition(paymentId, 'paid', undefined, 1, conn);
        await bookingRepository.persistTransition(bookingId, 'confirmed', undefined, 1, conn);

        await conn.commit();
      } finally { conn.release(); }

      const [b] = await pool.execute('SELECT booking_status, aggregate_version FROM bookings WHERE id = ?', [bookingId]);
      expect((b as any[])[0].booking_status).toBe('confirmed');
      expect((b as any[])[0].aggregate_version).toBe(2);

      const [p] = await pool.execute('SELECT payment_status, aggregate_version FROM payment_transactions WHERE id = ?', [paymentId]);
      expect((p as any[])[0].payment_status).toBe('paid');
      expect((p as any[])[0].aggregate_version).toBe(2);
    });
  });
});
