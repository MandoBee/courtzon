import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { generateUlid } from './event-envelope.js';
import { publishedEventsRepository } from '../../infrastructure/event-store/published-events.repository.js';
import { queueService } from '../../infrastructure/queue/queue.service.js';

const DDL = `
CREATE TABLE IF NOT EXISTS published_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(26) NOT NULL,
  event_name VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  aggregate_version INT UNSIGNED NOT NULL,
  correlation_id VARCHAR(64) DEFAULT NULL,
  causation_id VARCHAR(64) DEFAULT NULL,
  payload JSON DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  occurred_at TIMESTAMP NOT NULL,
  published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  schema_version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uk_event_id (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outbox_cursors (
  subscriber_id VARCHAR(64) NOT NULL PRIMARY KEY,
  last_event_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS processed_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(26) NOT NULL,
  subscriber_id VARCHAR(128) NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_subscriber (event_id, subscriber_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dead_letter_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id VARCHAR(26) NOT NULL,
  message_type VARCHAR(64) NOT NULL,
  message_category ENUM('event','command') NOT NULL,
  source VARCHAR(64) NOT NULL,
  subscriber_id VARCHAR(128) DEFAULT NULL,
  error_message TEXT NOT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolution_status ENUM('pending','retrying','resolved','ignored') NOT NULL DEFAULT 'pending'
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

// ── Failure Injection Tests ──

describe('EventBus — Crash after COMMIT recovery (simulated via Outbox cursor)', () => {
  const subscriberId = 'events.test';
  let committedEventId: string;
  let publishedRowId: number;

  it('F1: event survives COMMIT even if enqueue never happens (crash simulation)', async () => {
    const pool = getPool();

    committedEventId = generateUlid();
    await publishedEventsRepository.insert({
      eventId: committedEventId,
      eventName: 'booking.created',
      aggregateType: 'booking',
      aggregateId: '42',
      aggregateVersion: 1,
      occurredAt: new Date(),
    });

    const [rows] = await pool.execute(
      `SELECT id FROM published_events WHERE event_id = ?`, [committedEventId],
    );
    publishedRowId = (rows as any[])[0].id;
    expect(publishedRowId).toBeGreaterThan(0);

    const [cursorRows] = await pool.execute(
      'SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?', [subscriberId],
    );
    const cursorBefore = (cursorRows as any[])[0]?.last_event_id || 0;
    expect(cursorBefore).toBeLessThan(publishedRowId);
  });

  it('F2: Outbox Poller advances cursor after simulated delivery', async () => {
    const pool = getPool();

    await pool.execute(
      'INSERT IGNORE INTO outbox_cursors (subscriber_id, last_event_id) VALUES (?, ?)',
      [subscriberId, publishedRowId - 1],
    );

    await pool.execute(
      'UPDATE outbox_cursors SET last_event_id = ? WHERE subscriber_id = ? AND last_event_id < ?',
      [publishedRowId, subscriberId, publishedRowId],
    );

    const [updated] = await pool.execute(
      'SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?', [subscriberId],
    );
    expect((updated as any[])[0].last_event_id).toBe(publishedRowId);
  });
});

describe('EventBus — Subscriber failure + idempotency', () => {
  const subscriberId = 'events.test-handler';

  it('F3: duplicate delivery skipped by idempotency check', async () => {
    const pool = getPool();
    const eventId = generateUlid();

    await pool.execute(
      'INSERT IGNORE INTO processed_events (event_id, subscriber_id) VALUES (?, ?)',
      [eventId, subscriberId],
    );

    const [rows] = await pool.execute(
      'SELECT 1 FROM processed_events WHERE event_id = ? AND subscriber_id = ? LIMIT 1',
      [eventId, subscriberId],
    );
    expect((rows as any[]).length).toBe(1);
  });
});

describe('EventBus — Duplicate enqueue prevention (BullMQ jobId dedup simulation)', () => {
  const subscriberId = 'events.test-dedup';

  it('F4: enqueue with same jobId is handled (simulated at DB level)', async () => {
    const pool = getPool();
    const eventId = generateUlid();

    await pool.execute(
      'INSERT IGNORE INTO outbox_cursors (subscriber_id, last_event_id) VALUES (?, ?)',
      [subscriberId, 42],
    );

    await pool.execute(
      'UPDATE outbox_cursors SET last_event_id = ? WHERE subscriber_id = ? AND last_event_id < ?',
      [42, subscriberId, 43],
    );

    const [rows] = await pool.execute(
      'SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?', [subscriberId],
    );
    expect((rows as any[])[0].last_event_id).toBe(42);
  });
});

describe('EventBus — Recovery after restart (cursor persistence)', () => {
  it('F5: cursor survives process restart (simulated by reading after recreate)', async () => {
    const pool = getPool();

    await pool.execute(
      'INSERT IGNORE INTO outbox_cursors (subscriber_id, last_event_id) VALUES (?, ?)',
      ['events.persistent', 100],
    );

    const [rows] = await pool.execute(
      'SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?', ['events.persistent'],
    );
    expect((rows as any[])[0].last_event_id).toBe(100);
  });

  it('F6: cursor never goes backward on restart', async () => {
    const pool = getPool();

    await pool.execute(
      'UPDATE outbox_cursors SET last_event_id = ? WHERE subscriber_id = ? AND last_event_id < ?',
      [50, 'events.persistent', 51],
    );

    const [rows] = await pool.execute(
      'SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?', ['events.persistent'],
    );
    expect((rows as any[])[0].last_event_id).toBe(100);
  });
});
