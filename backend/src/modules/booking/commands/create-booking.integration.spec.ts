import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../../database/mysql.js';
import { createBookingHandler } from './create-booking.command.js';
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
}, 120000);

afterAll(async () => {
  await closePool();
  try { await mysql.stop(); } catch { /* ignore */ }
}, 30000);

describe('CreateBooking — Integration', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM bookings');
  });

  it('creates a booking via the handler with transaction conn', async () => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const command: Command = {
        commandId: generateUlid(),
        commandType: 'CreateBooking',
        aggregateType: 'booking',
        aggregateId: '42',
        payload: {
          userId: 1,
          branchId: 10,
          organisationId: 5,
          resourceId: 42,
          bookingDate: '2026-07-23',
          startTime: '10:00',
          endTime: '11:00',
          totalAmount: 150.00,
          startAtUtc: '2026-07-23 08:00:00',
          endAtUtc: '2026-07-23 09:00:00',
          bookingType: 'standard',
        },
        actorId: 1,
      };

      const result = await createBookingHandler.execute(command, conn);

      expect(result.bookingId).toBeGreaterThan(0);

      const [rows] = await conn.execute(
        'SELECT * FROM bookings WHERE id = ?', [result.bookingId],
      );
      const booking = (rows as any[])[0];
      expect(booking).not.toBeUndefined();
      expect(booking.total_amount).toBe('150.00');
      expect(booking.booking_status).toBe('pending');

      await conn.rollback();
    } finally {
      conn.release();
    }

    const [after] = await pool.execute('SELECT COUNT(*) as cnt FROM bookings', []);
    expect((after as any[])[0].cnt).toBe(0);
  });

  it('emits booking.created event with correct fields', () => {
    const command: Command = {
      commandId: generateUlid(),
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: '42',
      payload: {
        userId: 1, totalAmount: 100, bookingType: 'standard',
      },
      correlationId: 'integ-corr-001',
    };

    const result = { bookingId: 42, publicId: generateUlid() };
    const events = createBookingHandler.events!(command, result);

    expect(events.length).toBe(1);
    expect(events[0].eventName).toBe('booking.created');
    expect(events[0].payload.bookingId).toBe(42);
    expect(events[0].context.aggregateId).toBe('42');
    expect(events[0].context.correlationId).toBe('integ-corr-001');
  });

  it('validates and rejects missing required fields', async () => {
    const command: Command = {
      commandId: generateUlid(),
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: '1',
      payload: { userId: 1 },
    };

    await expect(createBookingHandler.validate(command)).rejects.toThrow();
  });
});
