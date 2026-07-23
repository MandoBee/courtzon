import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { processedCommandsRepository, DEFAULT_RETENTION_DAYS } from './processed-commands.repository.js';

const DDL = `
CREATE TABLE IF NOT EXISTS processed_commands (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  command_id      VARCHAR(26) NOT NULL,
  command_type    VARCHAR(64) NOT NULL,
  subscriber_id   VARCHAR(128) NOT NULL,
  correlation_id  VARCHAR(64) DEFAULT NULL,
  causation_id    VARCHAR(64) DEFAULT NULL,
  metadata        JSON DEFAULT NULL,
  processed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_command_subscriber (command_id, subscriber_id),
  INDEX idx_subscriber (subscriber_id),
  INDEX idx_command_type (command_type),
  INDEX idx_processed_at (processed_at)
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

describe('ProcessedCommandsRepository', () => {
  const subscriberId = 'test-command-handler';
  const commandId = '01JQYZABCDEFGHIJKLMNOPQRST';
  const commandType = 'CreateBookingCommand';

  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM processed_commands');
  });

  describe('hasBeenProcessed', () => {
    it('returns false when no row exists', async () => {
      const result = await processedCommandsRepository.hasBeenProcessed(commandId, subscriberId);
      expect(result).toBe(false);
    });

    it('returns true after recordProcessed is called', async () => {
      await processedCommandsRepository.recordProcessed({ commandId, commandType, subscriberId });
      const result = await processedCommandsRepository.hasBeenProcessed(commandId, subscriberId);
      expect(result).toBe(true);
    });

    it('is scoped by subscriber_id', async () => {
      await processedCommandsRepository.recordProcessed({ commandId, commandType, subscriberId: 'handler-a' });
      expect(await processedCommandsRepository.hasBeenProcessed(commandId, 'handler-a')).toBe(true);
      expect(await processedCommandsRepository.hasBeenProcessed(commandId, 'handler-b')).toBe(false);
    });
  });

  describe('recordProcessed', () => {
    it('inserts with all fields and returns without error', async () => {
      await expect(
        processedCommandsRepository.recordProcessed({
          commandId,
          commandType,
          subscriberId,
          correlationId: 'corr-001',
          causationId: 'caus-001',
          metadata: { userId: 42 },
        }),
      ).resolves.toBeUndefined();
    });

    it('handles duplicate silently (ER_DUP_ENTRY)', async () => {
      await processedCommandsRepository.recordProcessed({ commandId, commandType, subscriberId });
      await expect(
        processedCommandsRepository.recordProcessed({ commandId, commandType, subscriberId }),
      ).resolves.toBeUndefined();
    });
  });

  describe('getProcessedCount', () => {
    it('returns 0 for unknown subscriber', async () => {
      const count = await processedCommandsRepository.getProcessedCount('unknown');
      expect(count).toBe(0);
    });

    it('returns correct count within time window', async () => {
      await processedCommandsRepository.recordProcessed({ commandId: 'cmd-1', commandType, subscriberId });
      await processedCommandsRepository.recordProcessed({ commandId: 'cmd-2', commandType, subscriberId });
      await processedCommandsRepository.recordProcessed({ commandId: 'cmd-3', commandType, subscriberId });
      const count = await processedCommandsRepository.getProcessedCount(subscriberId, 24);
      expect(count).toBe(3);
    });

    it('excludes events older than the window', async () => {
      const pool = getPool();
      await processedCommandsRepository.recordProcessed({ commandId: 'recent', commandType, subscriberId });
      await pool.execute(
        `INSERT INTO processed_commands (command_id, command_type, subscriber_id, processed_at)
         VALUES ('old', ?, ?, DATE_SUB(NOW(), INTERVAL 48 HOUR))`,
        [commandType, subscriberId],
      );

      expect(await processedCommandsRepository.getProcessedCount(subscriberId, 24)).toBe(1);
      expect(await processedCommandsRepository.getProcessedCount(subscriberId, 72)).toBe(2);
    });
  });

  describe('getProcessedCountByType', () => {
    it('returns count grouped by command_type', async () => {
      await processedCommandsRepository.recordProcessed({ commandId: 'c1', commandType: 'TypeA', subscriberId });
      await processedCommandsRepository.recordProcessed({ commandId: 'c2', commandType: 'TypeA', subscriberId });
      await processedCommandsRepository.recordProcessed({ commandId: 'c3', commandType: 'TypeB', subscriberId });

      expect(await processedCommandsRepository.getProcessedCountByType('TypeA', 24)).toBe(2);
      expect(await processedCommandsRepository.getProcessedCountByType('TypeB', 24)).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('deletes rows older than retention period', async () => {
      const pool = getPool();
      await pool.execute(
        `INSERT INTO processed_commands (command_id, command_type, subscriber_id, processed_at)
         VALUES ('old', ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [commandType, subscriberId, DEFAULT_RETENTION_DAYS + 1],
      );

      const deleted = await processedCommandsRepository.cleanup(DEFAULT_RETENTION_DAYS);
      expect(deleted).toBeGreaterThanOrEqual(1);
      expect(await processedCommandsRepository.hasBeenProcessed('old', subscriberId)).toBe(false);
    });

    it('does not delete rows within retention period', async () => {
      const pool = getPool();
      await pool.execute(
        `INSERT INTO processed_commands (command_id, command_type, subscriber_id, processed_at)
         VALUES ('recent', ?, ?, NOW())`,
        [commandType, subscriberId],
      );

      await processedCommandsRepository.cleanup(DEFAULT_RETENTION_DAYS);
      expect(await processedCommandsRepository.hasBeenProcessed('recent', subscriberId)).toBe(true);
    });

    it('deletes in batches and returns total', async () => {
      const pool = getPool();
      for (let i = 0; i < 5; i++) {
        await pool.execute(
          `INSERT INTO processed_commands (command_id, command_type, subscriber_id, processed_at)
           VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [`old-${i}`, commandType, subscriberId, DEFAULT_RETENTION_DAYS + 1],
        );
      }

      const deleted = await processedCommandsRepository.cleanup(DEFAULT_RETENTION_DAYS, 2);
      expect(deleted).toBe(5);
    });

    it('retention boundary — row at exactly retention age is not deleted', async () => {
      const pool = getPool();
      await pool.execute(
        `INSERT INTO processed_commands (command_id, command_type, subscriber_id, processed_at)
         VALUES ('boundary', ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [commandType, subscriberId, DEFAULT_RETENTION_DAYS],
      );

      await processedCommandsRepository.cleanup(DEFAULT_RETENTION_DAYS);
      expect(await processedCommandsRepository.hasBeenProcessed('boundary', subscriberId)).toBe(true);
    });
  });

  describe('transaction support', () => {
    it('supports rollback within a transaction', async () => {
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await processedCommandsRepository.recordProcessed({ commandId, commandType, subscriberId }, conn);
        await conn.rollback();

        expect(await processedCommandsRepository.hasBeenProcessed(commandId, subscriberId)).toBe(false);
      } finally {
        conn.release();
      }
    });
  });
});
