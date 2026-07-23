import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../../../database/mysql.js';
import { BookingRepository } from './booking.repository.js';
import { generateUUID } from '../../../shared/utils/token.js';

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
let repo: BookingRepository;

const sampleData = {
  userId: 1,
  branchId: 10,
  organisationId: 5,
  resourceId: 42,
  bookingType: 'standard' as const,
  bookingDate: '2026-07-23',
  startTime: '10:00',
  endTime: '11:00',
  totalAmount: 150.00,
  commissionAmount: 15.00,
  clubAmount: 135.00,
  startAtUtc: '2026-07-23 08:00:00',
  endAtUtc: '2026-07-23 09:00:00',
  notes: 'Test booking',
  bookingStatus: 'pending' as const,
  paymentStatus: 'pending' as const,
  paymentMethod: 'wallet',
};

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

  repo = new BookingRepository();

  await pool.execute('INSERT IGNORE INTO resources (id, name) VALUES (?, ?)', [42, 'Test Court']);
  await pool.execute('INSERT IGNORE INTO branches (id, name, organisation_id) VALUES (?, ?, ?)', [10, 'Test Branch', 5]);
}, 120000);

afterAll(async () => {
  await closePool();
  try { await mysql.stop(); } catch { /* ignore */ }
}, 30000);

describe('BookingRepository — contract', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM bookings');
  });

  describe('create', () => {
    it('persists a booking and returns the auto-increment id', async () => {
      const id = await repo.create(sampleData);
      expect(id).toBeGreaterThan(0);

      const pool = getPool();
      const [rows] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [id]);
      const booking = (rows as any[])[0];
      expect(booking).toBeDefined();
      expect(booking.user_id).toBe(1);
      expect(booking.total_amount).toBe('150.00');
      expect(booking.booking_status).toBe('pending');
    });

    it('persists with default values when optional fields omitted', async () => {
      const id = await repo.create({
        userId: 2,
        branchId: 20,
        organisationId: 10,
        resourceId: 100,
        bookingType: 'standard',
        bookingDate: '2026-07-24',
        startTime: '14:00',
        endTime: '15:00',
        totalAmount: 75.00,
      });

      expect(id).toBeGreaterThan(0);
      const pool = getPool();
      const [rows] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [id]);
      const booking = (rows as any[])[0];
      expect(booking.booking_status).toBe('pending');
      expect(booking.payment_status).toBe('pending');
      expect(booking.commission_amount).toBe('0.00');
      expect(booking.notes).toBeNull();
    });

    it('generates a unique public_id for each booking', async () => {
      const id1 = await repo.create({ ...sampleData, bookingDate: '2026-07-25' });
      const id2 = await repo.create({ ...sampleData, bookingDate: '2026-07-26' });

      const pool = getPool();
      const [r1] = await pool.execute('SELECT public_id FROM bookings WHERE id = ?', [id1]);
      const [r2] = await pool.execute('SELECT public_id FROM bookings WHERE id = ?', [id2]);
      expect((r1 as any[])[0].public_id).not.toBe((r2 as any[])[0].public_id);
    });

    it('supports transaction participation — rollback discards the insert', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      let bookingId: number;

      try {
        await conn.beginTransaction();
        bookingId = await repo.create(sampleData, conn);
        expect(bookingId).toBeGreaterThan(0);
        await conn.rollback();
      } finally {
        conn.release();
      }

      const [rows] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      expect((rows as any[]).length).toBe(0);
    });

    it('supports transaction participation — commit persists the insert', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      let bookingId: number;

      try {
        await conn.beginTransaction();
        bookingId = await repo.create({ ...sampleData, bookingDate: '2026-07-27' }, conn);
        await conn.commit();
      } finally {
        conn.release();
      }

      const [rows] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      expect((rows as any[]).length).toBe(1);
    });

    it('handles concurrent inserts without collision', async () => {
      const results = await Promise.all([
        repo.create({ ...sampleData, bookingDate: '2026-07-28' }),
        repo.create({ ...sampleData, bookingDate: '2026-07-29' }),
        repo.create({ ...sampleData, bookingDate: '2026-07-30' }),
      ]);

      const unique = new Set(results);
      expect(unique.size).toBe(3);
      results.forEach(id => expect(id).toBeGreaterThan(0));
    });
  });

  describe('persistTransition', () => {
    it('updates booking status', async () => {
      const id = await repo.create(sampleData);
      await repo.persistTransition(id, 'confirmed');

      const pool = getPool();
      const [rows] = await pool.execute('SELECT booking_status FROM bookings WHERE id = ?', [id]);
      expect((rows as any[])[0].booking_status).toBe('confirmed');
    });

    it('updates both booking status and payment status', async () => {
      const id = await repo.create(sampleData);
      await repo.persistTransition(id, 'confirmed', 'paid');

      const pool = getPool();
      const [rows] = await pool.execute('SELECT booking_status, payment_status FROM bookings WHERE id = ?', [id]);
      expect((rows as any[])[0].booking_status).toBe('confirmed');
      expect((rows as any[])[0].payment_status).toBe('paid');
    });

    it('rolls back status change within a transaction', async () => {
      const id = await repo.create(sampleData);
      const pool = getPool();
      const conn = await pool.getConnection();

      try {
        await conn.beginTransaction();
        await repo.persistTransition(id, 'confirmed', undefined, undefined, conn);
        await conn.rollback();
      } finally {
        conn.release();
      }

      const [rows] = await pool.execute('SELECT booking_status FROM bookings WHERE id = ?', [id]);
      expect((rows as any[])[0].booking_status).toBe('pending');
    });
  });

  describe('findById', () => {
    it('returns booking by id with resource and branch names', async () => {
      const id = await repo.create(sampleData);
      const booking = await repo.findById(id);

      expect(booking).toBeDefined();
      expect(booking.id).toBe(id);
      expect(booking.resource_name).toBe('Test Court');
      expect(booking.branch_name).toBe('Test Branch');
    });

    it('returns null for non-existent id', async () => {
      const booking = await repo.findById(9999);
      expect(booking).toBeNull();
    });

    it('accepts optional transaction connection', async () => {
      const id = await repo.create(sampleData);
      const pool = getPool();
      const conn = await pool.getConnection();

      try {
        const booking = await repo.findById(id, conn);
        expect(booking).toBeDefined();
        expect(booking.id).toBe(id);
      } finally {
        conn.release();
      }
    });
  });
});
