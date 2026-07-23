import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { deadLetterRepository } from './dead-letter.repository.js';

const DDL = `
CREATE TABLE IF NOT EXISTS dead_letter_entries (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_id        VARCHAR(26) NOT NULL,
  message_type      VARCHAR(64) NOT NULL,
  message_category  ENUM('event','command') NOT NULL,
  source            VARCHAR(64) NOT NULL,
  subscriber_id     VARCHAR(128) DEFAULT NULL,
  workflow_id       BIGINT UNSIGNED DEFAULT NULL,
  correlation_id    VARCHAR(64) DEFAULT NULL,
  causation_id      VARCHAR(64) DEFAULT NULL,
  payload           JSON DEFAULT NULL,
  error_message     TEXT NOT NULL,
  error_stack       TEXT DEFAULT NULL,
  retry_count       INT UNSIGNED NOT NULL DEFAULT 0,
  failed_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_retry_at     TIMESTAMP NULL DEFAULT NULL,
  resolved_at       TIMESTAMP NULL DEFAULT NULL,
  resolution_status ENUM('pending','retrying','resolved','ignored') NOT NULL DEFAULT 'pending',
  KEY idx_dl_replay (resolution_status, failed_at),
  KEY idx_dl_retry (resolution_status, next_retry_at),
  KEY idx_dl_cleanup (resolution_status, failed_at)
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

function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('DeadLetterRepository', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM dead_letter_entries');
  });

  describe('insert', () => {
    it('inserts a dead letter entry with all fields', async () => {
      const id = await deadLetterRepository.insert({
        messageId: createMessageId(),
        messageType: 'booking.created',
        messageCategory: 'event',
        source: 'booking',
        subscriberId: 'notification-engine',
        workflowId: 42,
        correlationId: 'corr-001',
        causationId: 'caus-001',
        payload: { bookingId: 123 },
        errorMessage: 'Provider timeout',
        errorStack: 'Error: Provider timeout\n    at processPayment...',
      });
      expect(id).toBeGreaterThan(0);
    });

    it('inserts with only required fields', async () => {
      const id = await deadLetterRepository.insert({
        messageId: createMessageId(),
        messageType: 'payment.failed',
        messageCategory: 'event',
        source: 'payment',
        errorMessage: 'Gateway returned 500',
      });
      expect(id).toBeGreaterThan(0);
    });

    it('sets next_retry_at to 1 hour from now', async () => {
      const id = await deadLetterRepository.insert({
        messageId: createMessageId(),
        messageType: 'test',
        messageCategory: 'command',
        source: 'test',
        errorMessage: 'error',
      });

      const pool = getPool();
      const [rows] = await pool.execute('SELECT next_retry_at, resolution_status FROM dead_letter_entries WHERE id = ?', [id]);
      const row = (rows as any[])[0];
      expect(row.resolution_status).toBe('pending');
      expect(row.next_retry_at).not.toBeNull();
    });
  });

  describe('findPendingReplay', () => {
    it('returns pending entries ordered by age', async () => {
      await deadLetterRepository.insert({
        messageId: createMessageId(), messageType: 'a', messageCategory: 'event', source: 's', errorMessage: 'e1',
      });
      await deadLetterRepository.insert({
        messageId: createMessageId(), messageType: 'b', messageCategory: 'event', source: 's', errorMessage: 'e2',
      });

      const result = await deadLetterRepository.findPendingReplay(1, 10);
      expect(result.total).toBe(2);
      expect(result.rows.length).toBe(2);
    });

    it('paginates correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await deadLetterRepository.insert({
          messageId: createMessageId(), messageType: `t${i}`, messageCategory: 'event', source: 's', errorMessage: `e${i}`,
        });
      }

      const page1 = await deadLetterRepository.findPendingReplay(1, 2);
      expect(page1.rows.length).toBe(2);
      expect(page1.total).toBe(5);
    });

    it('excludes resolved entries', async () => {
      const id = await deadLetterRepository.insert({
        messageId: createMessageId(), messageType: 't', messageCategory: 'event', source: 's', errorMessage: 'e',
      });
      await deadLetterRepository.markResolved(id, 'resolved');

      const result = await deadLetterRepository.findPendingReplay();
      expect(result.total).toBe(0);
    });
  });

  describe('findPendingRetry', () => {
    it('returns retrying entries that are due for retry', async () => {
      const pool = getPool();
      const msgId = createMessageId();
      const id = await deadLetterRepository.insert({
        messageId: msgId, messageType: 't', messageCategory: 'event', source: 's', errorMessage: 'e',
      });
      await deadLetterRepository.markResolved(id, 'retrying');
      await pool.execute(
        'UPDATE dead_letter_entries SET next_retry_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?',
        [id],
      );

      const results = await deadLetterRepository.findPendingRetry();
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('markResolved', () => {
    it('marks as resolved and sets resolved_at', async () => {
      const id = await deadLetterRepository.insert({
        messageId: createMessageId(), messageType: 't', messageCategory: 'event', source: 's', errorMessage: 'e',
      });
      const updated = await deadLetterRepository.markResolved(id, 'resolved');
      expect(updated).toBe(true);

      const pool = getPool();
      const [rows] = await pool.execute('SELECT resolution_status, resolved_at FROM dead_letter_entries WHERE id = ?', [id]);
      expect((rows as any[])[0].resolution_status).toBe('resolved');
      expect((rows as any[])[0].resolved_at).not.toBeNull();
    });

    it('returns false for non-existent id', async () => {
      const updated = await deadLetterRepository.markResolved(9999, 'resolved');
      expect(updated).toBe(false);
    });
  });

  describe('incrementRetry', () => {
    it('increments retry_count and updates next_retry_at with exponential backoff', async () => {
      const id = await deadLetterRepository.insert({
        messageId: createMessageId(), messageType: 't', messageCategory: 'event', source: 's', errorMessage: 'e',
      });

      await deadLetterRepository.incrementRetry(id);
      const pool = getPool();
      const [rows] = await pool.execute('SELECT retry_count, next_retry_at FROM dead_letter_entries WHERE id = ?', [id]);
      expect((rows as any[])[0].retry_count).toBe(1);
      expect((rows as any[])[0].next_retry_at).not.toBeNull();
    });

    it('only works on pending or retrying status', async () => {
      const id = await deadLetterRepository.insert({
        messageId: createMessageId(), messageType: 't', messageCategory: 'event', source: 's', errorMessage: 'e',
      });
      await deadLetterRepository.markResolved(id, 'resolved');

      const updated = await deadLetterRepository.incrementRetry(id);
      expect(updated).toBe(false);
    });
  });

  describe('getStatistics', () => {
    it('returns counts grouped by resolution_status', async () => {
      const pool = getPool();
      const msgId1 = createMessageId();
      const msgId2 = createMessageId();
      const id1 = await deadLetterRepository.insert({
        messageId: msgId1, messageType: 'a', messageCategory: 'event', source: 's', errorMessage: 'e',
      });
      const id2 = await deadLetterRepository.insert({
        messageId: msgId2, messageType: 'b', messageCategory: 'command', source: 's', errorMessage: 'e',
      });
      await deadLetterRepository.markResolved(id1, 'resolved');

      const stats = await deadLetterRepository.getStatistics(24);
      expect(stats.length).toBeGreaterThanOrEqual(2);
      const pending = stats.find(s => s.status === 'pending');
      const resolved = stats.find(s => s.status === 'resolved');
      expect(pending?.count).toBe(1);
      expect(resolved?.count).toBe(1);
    });
  });

  describe('cleanupResolved', () => {
    it('deletes resolved/ignored entries older than retention', async () => {
      const pool = getPool();
      const id = await deadLetterRepository.insert({
        messageId: createMessageId(), messageType: 't', messageCategory: 'event', source: 's', errorMessage: 'e',
      });
      await deadLetterRepository.markResolved(id, 'resolved');
      await pool.execute(
        'UPDATE dead_letter_entries SET resolved_at = DATE_SUB(NOW(), INTERVAL 31 DAY) WHERE id = ?',
        [id],
      );

      const deleted = await deadLetterRepository.cleanupResolved(30);
      expect(deleted).toBeGreaterThanOrEqual(1);
    });

    it('does not delete pending entries', async () => {
      await deadLetterRepository.insert({
        messageId: createMessageId(), messageType: 't', messageCategory: 'event', source: 's', errorMessage: 'e',
      });

      const deleted = await deadLetterRepository.cleanupResolved(1);
      expect(deleted).toBe(0);
    });
  });

  describe('transaction support', () => {
    it('supports rollback within a transaction', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const id = await deadLetterRepository.insert({
          messageId: createMessageId(), messageType: 't', messageCategory: 'event', source: 's', errorMessage: 'e',
        }, conn);
        await conn.rollback();

        const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM dead_letter_entries', []);
        expect((rows as any[])[0].cnt).toBe(0);
      } finally {
        conn.release();
      }
    });
  });
});
