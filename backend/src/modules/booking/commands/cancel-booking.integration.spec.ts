import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../../database/mysql.js';
import { cancelBookingHandler } from './cancel-booking.command.js';
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
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS branches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  organisation_id INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

let mysql: StartedTestContainer;

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

describe('CancelBooking — Integration', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM bookings');
  });

  it('cancels a pending booking', async () => {
    const bookingId = await createTestBooking('pending');
    const pool = getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const command: Command = {
        commandId: generateUlid(), commandType: 'CancelBooking',
        aggregateType: 'booking', aggregateId: String(bookingId),
        payload: { bookingId },
      };

      const result = await cancelBookingHandler.execute(command, conn);
      expect(result.bookingId).toBe(bookingId);

      const [rows] = await conn.execute('SELECT booking_status FROM bookings WHERE id = ?', [bookingId]);
      expect((rows as any[])[0].booking_status).toBe('cancelled');

      await conn.rollback();
    } finally {
      conn.release();
    }
  });

  it('rejects cancel for already cancelled booking', async () => {
    const bookingId = await createTestBooking('cancelled');
    const pool = getPool();
    const conn = await pool.getConnection();

    try {
      const command: Command = {
        commandId: generateUlid(), commandType: 'CancelBooking',
        aggregateType: 'booking', aggregateId: String(bookingId),
        payload: { bookingId },
      };

      await expect(cancelBookingHandler.execute(command, conn)).rejects.toThrow('terminal state');
    } finally {
      conn.release();
    }
  });

  it('rejects cancel for completed booking', async () => {
    const bookingId = await createTestBooking('completed');
    const pool = getPool();
    const conn = await pool.getConnection();

    try {
      const command: Command = {
        commandId: generateUlid(), commandType: 'CancelBooking',
        aggregateType: 'booking', aggregateId: String(bookingId),
        payload: { bookingId },
      };

      await expect(cancelBookingHandler.execute(command, conn)).rejects.toThrow('terminal state');
    } finally {
      conn.release();
    }
  });

  it('emits booking.cancelled event with correct fields', () => {
    const command: Command = {
      commandId: generateUlid(), commandType: 'CancelBooking',
      aggregateType: 'booking', aggregateId: '42',
      payload: { bookingId: 42, reason: 'Test cancellation' },
      correlationId: 'integ-corr-001',
    };

    const events = cancelBookingHandler.events!(command, { bookingId: 42 });
    expect(events[0].eventName).toBe('booking.cancelled');
    expect(events[0].payload.reason).toBe('Test cancellation');
  });

  it('first cancel succeeds, second concurrent cancel fails (state machine guard)', async () => {
    const pool = getPool();
    const bookingId = await createTestBooking('pending');

    const cmd: Command = {
      commandId: generateUlid(), commandType: 'CancelBooking',
      aggregateType: 'booking', aggregateId: String(bookingId),
      payload: { bookingId },
    };

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cancelBookingHandler.execute(cmd, conn);
      await conn.commit();
    } finally {
      conn.release();
    }

    const [rows] = await pool.execute('SELECT booking_status FROM bookings WHERE id = ?', [bookingId]);
    expect((rows as any[])[0].booking_status).toBe('cancelled');

    const conn2 = await pool.getConnection();
    try {
      const cmd2: Command = {
        commandId: generateUlid(), commandType: 'CancelBooking',
        aggregateType: 'booking', aggregateId: String(bookingId),
        payload: { bookingId },
      };

      await expect(cancelBookingHandler.execute(cmd2, conn2)).rejects.toThrow('terminal state');
    } finally {
      conn2.release();
    }
  });
});
