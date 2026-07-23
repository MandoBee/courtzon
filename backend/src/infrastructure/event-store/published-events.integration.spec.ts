import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { publishedEventsRepository } from './published-events.repository.js';

const DDL = `
CREATE TABLE IF NOT EXISTS published_events (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id          VARCHAR(26) NOT NULL,
  event_name        VARCHAR(128) NOT NULL,
  aggregate_type    VARCHAR(64) NOT NULL,
  aggregate_id      VARCHAR(64) NOT NULL,
  aggregate_version INT UNSIGNED NOT NULL,
  correlation_id    VARCHAR(64) DEFAULT NULL,
  causation_id      VARCHAR(64) DEFAULT NULL,
  payload           JSON DEFAULT NULL,
  metadata          JSON DEFAULT NULL,
  occurred_at       TIMESTAMP NOT NULL,
  published_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  schema_version    INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uk_event_id (event_id),
  KEY idx_aggregate (aggregate_type, aggregate_id, aggregate_version),
  KEY idx_correlation_id (correlation_id),
  KEY idx_event_name_occurred (event_name, occurred_at),
  KEY idx_occurred_at (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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

function ulid(): string {
  const ts = Date.now().toString(36).padStart(10, '0');
  const rand = Math.random().toString(36).slice(2, 18);
  return (ts + rand).substring(0, 26);
}

describe('PublishedEventsRepository', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM published_events');
  });

  describe('insert', () => {
    it('inserts an event with all fields', async () => {
      await publishedEventsRepository.insert({
        eventId: ulid(),
        eventName: 'booking.created',
        aggregateType: 'booking',
        aggregateId: '42',
        aggregateVersion: 1,
        correlationId: 'corr-001',
        causationId: 'caus-001',
        payload: { courtId: 10, userId: 5 },
        metadata: { actorId: 5 },
        occurredAt: new Date(),
        schemaVersion: 2,
      });

      const count = await publishedEventsRepository.getStatistics(24);
      expect(count.length).toBeGreaterThanOrEqual(1);
    });

    it('handles duplicate event_id silently', async () => {
      const eid = ulid();
      await publishedEventsRepository.insert({
        eventId: eid, eventName: 'booking.created', aggregateType: 'booking',
        aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
      });
      await expect(
        publishedEventsRepository.insert({
          eventId: eid, eventName: 'booking.created', aggregateType: 'booking',
          aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findByEventId', () => {
    it('finds an event by its ULID', async () => {
      const eid = ulid();
      await publishedEventsRepository.insert({
        eventId: eid, eventName: 'booking.created', aggregateType: 'booking',
        aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
      });
      const event = await publishedEventsRepository.findByEventId(eid);
      expect(event).not.toBeNull();
      expect(event!.event_name).toBe('booking.created');
    });

    it('returns null for unknown event_id', async () => {
      const event = await publishedEventsRepository.findByEventId('nonexistent');
      expect(event).toBeNull();
    });
  });

  describe('findByAggregate', () => {
    it('returns all events for an aggregate in version order', async () => {
      const aggregateId = 'booking-42';
      for (let v = 1; v <= 3; v++) {
        await publishedEventsRepository.insert({
          eventId: ulid(), eventName: `booking.${v}`, aggregateType: 'booking',
          aggregateId, aggregateVersion: v, occurredAt: new Date(),
        });
      }

      const events = await publishedEventsRepository.findByAggregate('booking', aggregateId);
      expect(events.length).toBe(3);
      expect(events[0].aggregate_version).toBe(1);
      expect(events[2].aggregate_version).toBe(3);
    });

    it('returns empty array for unknown aggregate', async () => {
      const events = await publishedEventsRepository.findByAggregate('booking', '999');
      expect(events.length).toBe(0);
    });
  });

  describe('findByCorrelationId', () => {
    it('finds events by correlation id with pagination', async () => {
      for (let i = 0; i < 3; i++) {
        await publishedEventsRepository.insert({
          eventId: ulid(), eventName: `e${i}`, aggregateType: 'test',
          aggregateId: '1', aggregateVersion: i + 1, correlationId: 'trace-abc',
          occurredAt: new Date(),
        });
      }

      const result = await publishedEventsRepository.findByCorrelationId('trace-abc', 1, 10);
      expect(result.total).toBe(3);
      expect(result.rows.length).toBe(3);
    });
  });

  describe('findByEventName', () => {
    it('finds events by name within a time window', async () => {
      await publishedEventsRepository.insert({
        eventId: ulid(), eventName: 'payment.completed', aggregateType: 'payment',
        aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
      });
      await publishedEventsRepository.insert({
        eventId: ulid(), eventName: 'payment.failed', aggregateType: 'payment',
        aggregateId: '2', aggregateVersion: 1, occurredAt: new Date(),
      });

      const result = await publishedEventsRepository.findByEventName('payment.completed', 24);
      expect(result.total).toBe(1);
    });
  });

  describe('getStatistics', () => {
    it('returns counts grouped by event_name', async () => {
      await publishedEventsRepository.insert({
        eventId: ulid(), eventName: 'booking.created', aggregateType: 'booking',
        aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
      });
      await publishedEventsRepository.insert({
        eventId: ulid(), eventName: 'booking.created', aggregateType: 'booking',
        aggregateId: '2', aggregateVersion: 1, occurredAt: new Date(),
      });
      await publishedEventsRepository.insert({
        eventId: ulid(), eventName: 'payment.succeeded', aggregateType: 'payment',
        aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
      });

      const stats = await publishedEventsRepository.getStatistics(24);
      const booking = stats.find(s => s.event_name === 'booking.created');
      const payment = stats.find(s => s.event_name === 'payment.succeeded');
      expect(booking?.count).toBe(2);
      expect(payment?.count).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('deletes events older than retention', async () => {
      const pool = getPool();
      await publishedEventsRepository.insert({
        eventId: ulid(), eventName: 'old', aggregateType: 't',
        aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(Date.now() - 100 * 86400000),
      });

      const deleted = await publishedEventsRepository.cleanup(30);
      expect(deleted).toBeGreaterThanOrEqual(1);
    });

    it('does not delete recent events', async () => {
      await publishedEventsRepository.insert({
        eventId: ulid(), eventName: 'recent', aggregateType: 't',
        aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
      });

      const deleted = await publishedEventsRepository.cleanup(90);
      const event = await publishedEventsRepository.findByEventName('recent', 24);
      expect(event.total).toBe(1);
      expect(deleted).toBe(0);
    });
  });

  describe('transaction support', () => {
    it('supports rollback within a transaction', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await publishedEventsRepository.insert({
          eventId: ulid(), eventName: 'test', aggregateType: 't',
          aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
        }, conn);
        await conn.rollback();

        const stats = await publishedEventsRepository.getStatistics(24);
        expect(stats.length).toBe(0);
      } finally {
        conn.release();
      }
    });
  });
});
