import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../../database/mysql.js';
import { confirmBookingHandler } from './confirm-booking.command.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { generateUUID } from '../../../shared/utils/token.js';
import { generateUlid } from '../../../shared/event-bus/event-envelope.js';
import type { Command } from '../../../shared/command/command-base.js';

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
  business_date DATE DEFAULT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  start_at_utc DATETIME DEFAULT NULL,
  end_at_utc DATETIME DEFAULT NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  club_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  booking_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resources (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sport_id INT UNSIGNED DEFAULT NULL,
  opening_time VARCHAR(10) DEFAULT '08:00',
  closing_time VARCHAR(10) DEFAULT '22:00',
  slot_duration INT DEFAULT 60
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS branches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  organisation_id INT UNSIGNED NOT NULL DEFAULT 1,
  timezone VARCHAR(50) DEFAULT 'Africa/Cairo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

let mysql: StartedTestContainer;

const sampleData = {
  userId: 1, branchId: 10, organisationId: 5, resourceId: 42,
  bookingType: 'standard', bookingDate: '2026-07-23',
  startTime: '10:00', endTime: '11:00', totalAmount: 150.00,
  startAtUtc: '2026-07-23 08:00:00', endAtUtc: '2026-07-23 09:00:00',
  bookingStatus: 'pending', paymentStatus: 'pending',
};

async function createTestBooking(status = 'pending'): Promise<number> {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
      booking_date, start_time, end_time, total_amount, booking_status, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [generateUUID(), 1, 5, 10, 42, 'standard', '2026-07-23', '10:00', '11:00', 150.00, status, 'pending'],
  );
  const [rows] = await pool.execute('SELECT LAST_INSERT_ID() as id');
  return (rows as any[])[0].id;
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';

  mysql = await new GenericContainer('mysql:8.0')
    .withEnvironment({ MYSQL_ROOT_PASSWORD: 'test', MYSQL_DATABASE: 'courtzon_test' })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('port: 3306  MySQL Community Server'))
    .start();

  const port = mysql.getMappedPort(3306);
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = String(port);
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'test';
  process.env.DB_NAME = 'courtzon_test';

  createPool({ host: '127.0.0.1', port, user: 'root', password: 'test', database: 'courtzon_test' });
  const pool = getPool();
  for (const stmt of DDL.split(';').filter(s => s.trim())) {
    await pool.execute(stmt.trim());
  }

  await pool.execute('INSERT IGNORE INTO resources (id, name) VALUES (?, ?)', [42, 'Test Court']);
  await pool.execute('INSERT IGNORE INTO branches (id, name, organisation_id) VALUES (?, ?, ?)', [10, 'Test Branch', 5]);
}, 120000);

afterAll(async () => {
  await closePool();
  try { await mysql.stop(); } catch { /* ignore */ }
}, 30000);

describe('ConfirmBooking — Integration', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM bookings');
  });

  it('confirms a pending booking via handler with transaction conn', async () => {
    const bookingId = await createTestBooking('pending');
    const pool = getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const command: Command = {
        commandId: generateUlid(),
        commandType: 'ConfirmBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId },
      };

      const result = await confirmBookingHandler.execute(command, conn);
      expect(result.bookingId).toBe(bookingId);

      const [rows] = await conn.execute('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      expect((rows as any[])[0].booking_status).toBe('confirmed');

      await conn.rollback();
    } finally {
      conn.release();
    }

    const [after] = await pool.execute('SELECT booking_status FROM bookings WHERE id = ?', [bookingId]);
    expect((after as any[])[0].booking_status).toBe('pending');
  });

  it('rejects confirm for cancelled booking', async () => {
    const bookingId = await createTestBooking('cancelled');
    const pool = getPool();
    const conn = await pool.getConnection();

    try {
      const command: Command = {
        commandId: generateUlid(),
        commandType: 'ConfirmBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId },
      };

      await expect(confirmBookingHandler.execute(command, conn)).rejects.toThrow(
        'Cannot confirm a cancelled or no-show booking',
      );
    } finally {
      conn.release();
    }
  });

  it('emits booking.confirmed event with correct fields', () => {
    const command: Command = {
      commandId: generateUlid(),
      commandType: 'ConfirmBooking',
      aggregateType: 'booking',
      aggregateId: '42',
      payload: { bookingId: 42 },
      correlationId: 'integ-corr-001',
    };

    const events = confirmBookingHandler.events!(command, { bookingId: 42 });

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('booking.confirmed');
    expect(events[0].payload.bookingId).toBe(42);
    expect(events[0].context.correlationId).toBe('integ-corr-001');
  });
});
