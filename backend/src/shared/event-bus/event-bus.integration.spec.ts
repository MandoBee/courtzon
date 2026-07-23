import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { generateUlid } from './event-envelope.js';
import { publishedEventsRepository } from '../../infrastructure/event-store/published-events.repository.js';
import { OutboxPoller } from './outbox-poller.js';
import { queueService } from '../../infrastructure/queue/queue.service.js';

const PUBLISHED_EVENTS_DDL = `
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

const CURSOR_DDL = `
CREATE TABLE IF NOT EXISTS outbox_cursors (
  subscriber_id  VARCHAR(64) NOT NULL PRIMARY KEY,
  last_event_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

  for (const stmt of [...PUBLISHED_EVENTS_DDL.split(';'), ...CURSOR_DDL.split(';')].filter(s => s.trim())) {
    await pool.execute(stmt.trim());
  }
}, 120000);

afterAll(async () => {
  await closePool();
  try { await mysql.stop(); } catch { /* ignore */ }
}, 30000);

describe('EventEnvelope', () => {
  it('generates ULIDs that are 26 characters', () => {
    const ulid = generateUlid();
    expect(ulid.length).toBe(26);
  });

  it('generates unique ULIDs', () => {
    const a = generateUlid();
    const b = generateUlid();
    expect(a).not.toBe(b);
  });
});

describe('PublishedEventsRepository', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM published_events');
  });

  it('inserts and retrieves an event', async () => {
    const eventId = generateUlid();
    await publishedEventsRepository.insert({
      eventId,
      eventName: 'booking.created',
      aggregateType: 'booking',
      aggregateId: '42',
      aggregateVersion: 1,
      payload: { courtId: 10 },
      occurredAt: new Date(),
    });

    const event = await publishedEventsRepository.findByEventId(eventId);
    expect(event).not.toBeNull();
    expect(event!.event_name).toBe('booking.created');
  });

  it('rejects duplicate event_id silently', async () => {
    const eventId = generateUlid();
    await publishedEventsRepository.insert({
      eventId, eventName: 'test', aggregateType: 't', aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
    });
    await expect(
      publishedEventsRepository.insert({
        eventId, eventName: 'test', aggregateType: 't', aggregateId: '1', aggregateVersion: 1, occurredAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });

  it('returns events for an aggregate in order', async () => {
    for (let v = 1; v <= 3; v++) {
      await publishedEventsRepository.insert({
        eventId: generateUlid(), eventName: `event.${v}`, aggregateType: 'booking',
        aggregateId: 'agg-1', aggregateVersion: v, occurredAt: new Date(),
      });
    }

    const events = await publishedEventsRepository.findByAggregate('booking', 'agg-1');
    expect(events.length).toBe(3);
  });
});

describe('OutboxCursors', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM outbox_cursors');
    await pool.execute('DELETE FROM published_events');
  });

  it('inserts cursor row on first poll', async () => {
    const pool = getPool();
    await pool.execute(
      'INSERT IGNORE INTO outbox_cursors (subscriber_id, last_event_id) VALUES (?, ?)',
      ['test-subscriber', 0],
    );

    const [rows] = await pool.execute(
      'SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?',
      ['test-subscriber'],
    );
    expect((rows as any[]).length).toBe(1);
  });

  it('advances cursor only forward', async () => {
    const pool = getPool();
    await pool.execute(
      'INSERT INTO outbox_cursors (subscriber_id, last_event_id) VALUES (?, ?)',
      ['test-sub', 5],
    );

    await pool.execute(
      'UPDATE outbox_cursors SET last_event_id = ? WHERE subscriber_id = ? AND last_event_id < ?',
      [10, 'test-sub', 10],
    );
    const [r1] = await pool.execute('SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?', ['test-sub']);
    expect((r1 as any[])[0].last_event_id).toBe(10);

    await pool.execute(
      'UPDATE outbox_cursors SET last_event_id = ? WHERE subscriber_id = ? AND last_event_id < ?',
      [3, 'test-sub', 3],
    );
    const [r2] = await pool.execute('SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?', ['test-sub']);
    expect((r2 as any[])[0].last_event_id).toBe(10);
  });

  it('poller scans events after cursor and advances', async () => {
    const pool = getPool();

    await pool.execute(
      'INSERT IGNORE INTO outbox_cursors (subscriber_id, last_event_id) VALUES (?, ?)',
      ['events.test', 0],
    );

    for (let i = 0; i < 5; i++) {
      await publishedEventsRepository.insert({
        eventId: generateUlid(),
        eventName: 'test.event',
        aggregateType: 'test',
        aggregateId: '1',
        aggregateVersion: i + 1,
        occurredAt: new Date(),
      });
    }

    const [events] = await pool.execute(
      `SELECT * FROM published_events WHERE id > 0 ORDER BY id ASC LIMIT 100`,
    );
    expect((events as any[]).length).toBe(5);

    const [cursorRows] = await pool.execute(
      'SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?',
      ['events.test'],
    );
    expect((cursorRows as any[])[0].last_event_id).toBe(0);

    const maxId = Math.max(...(events as any[]).map(e => e.id));
    await pool.execute(
      'UPDATE outbox_cursors SET last_event_id = ? WHERE subscriber_id = ? AND last_event_id < ?',
      [maxId, 'events.test', maxId],
    );

    const [updated] = await pool.execute(
      'SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?',
      ['events.test'],
    );
    expect((updated as any[])[0].last_event_id).toBe(maxId);
  });
});
