import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { processedEventsRepository, DEFAULT_RETENTION_DAYS } from './processed-events.repository.js';

const PROCESSED_EVENTS_DDL = `
CREATE TABLE IF NOT EXISTS processed_events (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id        VARCHAR(26) NOT NULL COMMENT 'ULID of the published event',
  subscriber_id   VARCHAR(128) NOT NULL COMMENT 'Subscriber identifier (e.g. notification-engine, search-indexer)',
  processed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_subscriber (event_id, subscriber_id),
  INDEX idx_subscriber (subscriber_id),
  INDEX idx_processed_at (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

let mysql: StartedTestContainer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';

  mysql = await new GenericContainer('mysql:8.0')
    .withEnvironment({
      MYSQL_ROOT_PASSWORD: 'test',
      MYSQL_DATABASE: 'courtzon_test',
    })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('port: 3306  MySQL Community Server'))
    .start();

  const port = mysql.getMappedPort(3306);
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = String(port);
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'test';
  process.env.DB_NAME = 'courtzon_test';

  createPool({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: 'test',
    database: 'courtzon_test',
  });

  const pool = getPool();
  await pool.execute(PROCESSED_EVENTS_DDL);
}, 120000);

afterAll(async () => {
  await closePool();
  try { await mysql.stop(); } catch { /* ignore */ }
}, 30000);

describe('ProcessedEventsRepository', () => {
  const subscriberId = 'test-subscriber';
  const eventId = '01JQYZABCDEFGHIJKLMNOPQRST';

  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM processed_events');
  });

  describe('hasBeenProcessed', () => {
    it('returns false when no row exists', async () => {
      const result = await processedEventsRepository.hasBeenProcessed(eventId, subscriberId);
      expect(result).toBe(false);
    });

    it('returns true after recordProcessing is called', async () => {
      await processedEventsRepository.recordProcessing(eventId, subscriberId);
      const result = await processedEventsRepository.hasBeenProcessed(eventId, subscriberId);
      expect(result).toBe(true);
    });

    it('is scoped by subscriber_id — different subscriber does not see the event', async () => {
      await processedEventsRepository.recordProcessing(eventId, 'subscriber-a');
      const resultA = await processedEventsRepository.hasBeenProcessed(eventId, 'subscriber-a');
      const resultB = await processedEventsRepository.hasBeenProcessed(eventId, 'subscriber-b');
      expect(resultA).toBe(true);
      expect(resultB).toBe(false);
    });
  });

  describe('recordProcessing', () => {
    it('inserts a row and returns without error', async () => {
      await expect(
        processedEventsRepository.recordProcessing(eventId, subscriberId),
      ).resolves.toBeUndefined();
    });

    it('handles duplicate insert silently (ER_DUP_ENTRY)', async () => {
      await processedEventsRepository.recordProcessing(eventId, subscriberId);
      await expect(
        processedEventsRepository.recordProcessing(eventId, subscriberId),
      ).resolves.toBeUndefined();
    });
  });

  describe('getProcessedCount', () => {
    it('returns 0 for a subscriber with no events', async () => {
      const count = await processedEventsRepository.getProcessedCount('unknown-subscriber');
      expect(count).toBe(0);
    });

    it('returns the correct count within the time window', async () => {
      await processedEventsRepository.recordProcessing('event-1', subscriberId);
      await processedEventsRepository.recordProcessing('event-2', subscriberId);
      await processedEventsRepository.recordProcessing('event-3', subscriberId);

      const count = await processedEventsRepository.getProcessedCount(subscriberId, 24);
      expect(count).toBe(3);
    });

    it('excludes events older than the specified window', async () => {
      const pool = getPool();
      await processedEventsRepository.recordProcessing('recent-event', subscriberId);
      await pool.execute(
        `INSERT INTO processed_events (event_id, subscriber_id, processed_at)
         VALUES ('old-event', ?, DATE_SUB(NOW(), INTERVAL 48 HOUR))`,
        [subscriberId],
      );

      const last24h = await processedEventsRepository.getProcessedCount(subscriberId, 24);
      expect(last24h).toBe(1);

      const last72h = await processedEventsRepository.getProcessedCount(subscriberId, 72);
      expect(last72h).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('deletes rows older than the retention period', async () => {
      const pool = getPool();
      await pool.execute(
        `INSERT INTO processed_events (event_id, subscriber_id, processed_at)
         VALUES ('old-event', ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [subscriberId, DEFAULT_RETENTION_DAYS + 1],
      );

      const deleted = await processedEventsRepository.cleanup(DEFAULT_RETENTION_DAYS);
      expect(deleted).toBeGreaterThanOrEqual(1);

      const found = await processedEventsRepository.hasBeenProcessed('old-event', subscriberId);
      expect(found).toBe(false);
    });

    it('does not delete rows within the retention period', async () => {
      const pool = getPool();
      await pool.execute(
        `INSERT INTO processed_events (event_id, subscriber_id, processed_at)
         VALUES ('recent-event', ?, NOW())`,
        [subscriberId],
      );

      const deleted = await processedEventsRepository.cleanup(DEFAULT_RETENTION_DAYS);
      const found = await processedEventsRepository.hasBeenProcessed('recent-event', subscriberId);
      expect(found).toBe(true);
    });

    it('deletes rows in batches and returns total count', async () => {
      const pool = getPool();
      for (let i = 0; i < 5; i++) {
        await pool.execute(
          `INSERT INTO processed_events (event_id, subscriber_id, processed_at)
           VALUES (?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [`old-event-${i}`, subscriberId, DEFAULT_RETENTION_DAYS + 1],
        );
      }

      const deleted = await processedEventsRepository.cleanup(DEFAULT_RETENTION_DAYS, 2);
      expect(deleted).toBe(5);
    });
  });
});
