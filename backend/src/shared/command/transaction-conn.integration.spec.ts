import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { withTransaction } from '../../database/database.transaction.js';
import { commandPipeline } from './command-pipeline.js';
import type { Command, CommandHandler } from './command-base.js';
import { processWithdrawalHandler } from '../../modules/financial/commands/process-withdrawal.command.js';
import { updateActivityStatusHandler } from '../../modules/activities/commands/update-activity-status.command.js';
import { checkRateLimit, incrementRateLimit } from '../../modules/notifications/application/rate-limiter.service.js';
import { accumulateDigest } from '../../modules/notifications/application/digest.service.js';
import { getTemplate } from '../../modules/notifications/application/template.service.js';
import { notificationRepository } from '../../modules/notifications/infrastructure/repositories/notification.repository.js';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

const DDL = `
CREATE TABLE IF NOT EXISTS processed_commands (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  command_id VARCHAR(128) NOT NULL,
  command_type VARCHAR(64) NOT NULL,
  subscriber_id VARCHAR(128) NOT NULL,
  correlation_id VARCHAR(64) DEFAULT NULL,
  causation_id VARCHAR(64) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_command_subscriber (command_id, command_type),
  INDEX idx_subscriber (subscriber_id),
  INDEX idx_command_type (command_type),
  INDEX idx_processed_at (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS txn_targets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  admin_notes VARCHAR(255) DEFAULT NULL,
  reviewed_at TIMESTAMP NULL,
  aggregate_version INT UNSIGNED DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_type VARCHAR(64) DEFAULT NULL,
  user_id BIGINT UNSIGNED DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  aggregate_version INT UNSIGNED DEFAULT 1,
  updated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_actions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  action_key VARCHAR(64) NOT NULL,
  UNIQUE KEY uk_action_key (action_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_name VARCHAR(128) NOT NULL,
  locale VARCHAR(8) NOT NULL DEFAULT 'en',
  category_slug VARCHAR(64) DEFAULT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'info',
  priority VARCHAR(16) NOT NULL DEFAULT 'normal',
  title_template VARCHAR(255) NOT NULL,
  body_template VARCHAR(500) DEFAULT NULL,
  action_key VARCHAR(64) DEFAULT NULL,
  route_pattern VARCHAR(255) DEFAULT NULL,
  actions JSON DEFAULT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_locale (event_name, locale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_rate_limits (
  user_id BIGINT UNSIGNED NOT NULL,
  category_slug VARCHAR(64) NOT NULL,
  event_name VARCHAR(128) NOT NULL DEFAULT 'default',
  count INT UNSIGNED NOT NULL DEFAULT 0,
  window_start TIMESTAMP NOT NULL,
  UNIQUE KEY uk_user_category_window (user_id, category_slug, window_start),
  INDEX idx_user_category (user_id, category_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_digest_windows (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  category_slug VARCHAR(64) NOT NULL,
  event_name VARCHAR(128) NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 1,
  window_opens_at TIMESTAMP NOT NULL,
  window_closes_at TIMESTAMP NOT NULL,
  is_aggregated TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED DEFAULT NULL,
  action_id BIGINT UNSIGNED DEFAULT NULL,
  action_payload JSON DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  body VARCHAR(2000) DEFAULT NULL,
  icon VARCHAR(255) DEFAULT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'info',
  priority VARCHAR(16) NOT NULL DEFAULT 'normal',
  organization_id BIGINT UNSIGNED DEFAULT NULL,
  branch_id BIGINT UNSIGNED DEFAULT NULL,
  sender_id BIGINT UNSIGNED DEFAULT NULL,
  related_entity_type VARCHAR(64) DEFAULT NULL,
  related_entity_id VARCHAR(64) DEFAULT NULL,
  event_name VARCHAR(128) DEFAULT NULL,
  actions JSON DEFAULT NULL,
  image_urls JSON DEFAULT NULL,
  template_id BIGINT UNSIGNED DEFAULT NULL,
  template_version INT UNSIGNED DEFAULT NULL,
  rendered_title VARCHAR(255) DEFAULT NULL,
  rendered_body VARCHAR(2000) DEFAULT NULL,
  is_pushed TINYINT(1) NOT NULL DEFAULT 0,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_channel_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  category_slug VARCHAR(64) NOT NULL,
  channels JSON DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, category_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

let mysql: StartedTestContainer;

function createUlid(): string {
  const ts = Date.now().toString(36).padStart(10, '0');
  return (ts + Math.random().toString(36).slice(2, 18)).substring(0, 26);
}

async function countRows(table: string): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) as cnt FROM ${table}`);
  return Number((rows[0] as any).cnt);
}

async function openTransactions(): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT COUNT(*) as cnt FROM information_schema.innodb_trx t JOIN information_schema.PROCESSLIST p ON p.ID = t.trx_mysql_thread_id WHERE p.DB = ?',
    [process.env.DB_NAME],
  );
  return Number((rows[0] as any).cnt);
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

  // Constrained pool: concurrency tests must exercise queueing and prove that
  // handlers honour the transaction connection instead of grabbing a second
  // pooled connection (pool-starvation regression on 2026-09-14).
  createPool({ host: '127.0.0.1', port, user: 'root', password: 'test', database: 'courtzon_test', connectionLimit: 2 });
  const pool = getPool();

  for (const stmt of DDL.split(';').filter(s => s.trim())) {
    await pool.execute(stmt.trim());
  }
}, 120000);

afterAll(async () => {
  await closePool();
  try { await mysql.stop(); } catch { /* ignore */ }
}, 30000);

describe('Transaction connection integrity (pool-starvation regression)', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM processed_commands');
    await pool.execute('DELETE FROM published_events');
    await pool.execute('DELETE FROM txn_targets');
    await pool.execute('DELETE FROM withdrawal_requests');
    await pool.execute('DELETE FROM activities');
    await pool.execute('DELETE FROM notifications');
    await pool.execute('DELETE FROM notification_rate_limits');
    await pool.execute('DELETE FROM notification_digest_windows');
    await pool.execute('DELETE FROM notification_templates');
    await pool.execute('DELETE FROM notification_categories');
    await pool.execute('DELETE FROM notification_actions');
  });

  it('TEST A — concurrent commands using the transaction connection complete on a constrained pool with zero leaked transactions', async () => {
    const N = 20;
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => {
        const command: Command = {
          commandId: createUlid(),
          commandType: 'ConcurrentTargetWrite',
          aggregateType: 'txn_target',
          aggregateId: String(i),
          payload: { actor: `actor-${i}` },
          actorId: 1,
        };
        const handler: CommandHandler<typeof command, { ok: boolean }> = {
          validate: async () => {},
          execute: async (cmd, conn) => {
            await conn.execute<ResultSetHeader>(
              'INSERT INTO txn_targets (actor) VALUES (?)',
              [((cmd.payload as any).actor)],
            );
            await conn.execute<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM txn_targets');
            return { ok: true };
          },
          events: () => [{
            eventName: 'txn_target.written',
            payload: {},
            context: { aggregateType: 'txn_target', aggregateId: '0', aggregateVersion: 1 },
          }],
        };
        return commandPipeline.execute(command, handler);
      }),
    );

    for (const r of results) {
      expect(r.status).toBe('fulfilled');
      if (r.status === 'fulfilled') {
        expect(r.value.status).toBe('processed');
      }
    }

    expect(await countRows('txn_targets')).toBe(N);
    expect(await countRows('processed_commands')).toBe(N);
    // All transactions committed/released — none leaked under concurrency.
    expect(await openTransactions()).toBe(0);
  });

  it('TEST B — real fixed handlers (process-withdrawal, update-activity-status) run concurrently via conn', async () => {
    const pool = getPool();
    for (let i = 0; i < 6; i++) {
      await pool.execute("INSERT INTO withdrawal_requests (status) VALUES ('pending')");
    }
    await pool.execute("INSERT INTO activities (activity_type, user_id, status) VALUES ('fitness', 1, 'scheduled')");

    const withdrawals = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => {
        const command: Command = {
          commandId: createUlid(),
          commandType: 'ProcessWithdrawal',
          aggregateType: 'withdrawal',
          aggregateId: String(i + 1),
          payload: { withdrawalId: i + 1, toStatus: 'approved', actorId: 1 },
        };
        return commandPipeline.execute(command, processWithdrawalHandler);
      }),
    );
    for (const r of withdrawals) {
      expect(r.status).toBe('fulfilled');
      if (r.status === 'fulfilled') expect(r.value.status).toBe('processed');
    }

    const [wRows] = await pool.execute<RowDataPacket[]>('SELECT status FROM withdrawal_requests');
    expect(wRows.filter(r => r.status === 'approved').length).toBe(6);
    expect(await openTransactions()).toBe(0);

    const activityCommand: Command = {
      commandId: createUlid(),
      commandType: 'UpdateActivityStatus',
      aggregateType: 'activity',
      aggregateId: '1',
      payload: { activityId: 1, status: 'in_progress' },
    };
    const ar = await commandPipeline.execute(activityCommand, updateActivityStatusHandler);
    expect(ar.status).toBe('processed');
    const [aRows] = await pool.execute<RowDataPacket[]>('SELECT status FROM activities WHERE id = 1');
    expect(aRows[0].status).toBe('in_progress');
    expect(await openTransactions()).toBe(0);
  });

  it('TEST C — transaction atomicity: writes via conn are committed atomically with idempotency', async () => {
    const command: Command = {
      commandId: createUlid(),
      commandType: 'AtomicTargetWrite',
      aggregateType: 'txn_target',
      aggregateId: '99',
      payload: { actor: 'atomic' },
      actorId: 1,
    };
    const handler: CommandHandler<typeof command, { ok: boolean }> = {
      validate: async () => {},
      execute: async (cmd, conn) => {
        await conn.execute<ResultSetHeader>('INSERT INTO txn_targets (actor) VALUES (?)', [cmd.payload.actor as string]);
        return { ok: true };
      },
      events: () => [{
        eventName: 'txn_target.written',
        payload: {},
        context: { aggregateType: 'txn_target', aggregateId: '0', aggregateVersion: 1 },
      }],
    };

    const result = await commandPipeline.execute(command, handler);
    expect(result.status).toBe('processed');
    expect(await countRows('txn_targets')).toBe(1);
    expect(await countRows('processed_commands')).toBe(1);
    expect(await openTransactions()).toBe(0);
  });

  it('TEST D — error path rolls back handler writes and the idempotency record, releases the connection', async () => {
    const pool = getPool();
    const command: Command = {
      commandId: createUlid(),
      commandType: 'AtomicTargetWrite',
      aggregateType: 'txn_target',
      aggregateId: '100',
      payload: { actor: 'should-rollback' },
      actorId: 1,
    };
    const handler: CommandHandler<typeof command, { ok: boolean }> = {
      validate: async () => {},
      execute: async (cmd, conn) => {
        await conn.execute<ResultSetHeader>('INSERT INTO txn_targets (actor) VALUES (?)', [cmd.payload.actor as string]);
        throw new Error('Simulated business failure');
      },
    };

    await expect(commandPipeline.execute(command, handler)).rejects.toThrow('Simulated business failure');

    expect(await countRows('txn_targets')).toBe(0);
    expect(await countRows('processed_commands')).toBe(0);
    expect(await openTransactions()).toBe(0);
    // Connection was released — pool still serves queries immediately.
    const db = getPool();
    const [rows] = await db.execute<RowDataPacket[]>('SELECT 1 as ok');
    expect(Number((rows[0] as any).ok)).toBe(1);
  });

  it('TEST E — notification services used by dispatch-notification honour the passed transaction connection', async () => {
    const userId = 77;
    const categorySlug = 'test-cat';
    const eventName = 'test:unique-event';

    // Seed a template through the transaction connection itself. If any service
    // fell back to the pool, the uncommitted row would be invisible to it.
    await expect(withTransaction(async (conn) => {
      await conn.execute<ResultSetHeader>(
        `INSERT INTO notification_categories (slug, is_active, sort_order) VALUES (?, 1, 0)`,
        [categorySlug],
      );
      await conn.execute<ResultSetHeader>(
        'INSERT INTO notification_actions (action_key) VALUES (?)',
        ['test.open'],
      );
      const before = await checkRateLimit(userId, categorySlug, conn);
      expect(before.allowed).toBe(true);

      await incrementRateLimit(userId, categorySlug, eventName, conn);
      const after = await checkRateLimit(userId, categorySlug, conn);
      expect(after.allowed).toBe(true);
      expect(after.remaining).toBe(29);

      await accumulateDigest(userId, categorySlug, eventName, conn);

      await conn.execute<ResultSetHeader>(
        `INSERT INTO notification_templates
         (event_name, locale, category_slug, type, priority, title_template, body_template, action_key, version, is_active)
         VALUES (?, 'en', ?, 'info', 'normal', 'Test {{x}}', '{{x}}', 'test.open', 1, 1)`,
        [eventName, categorySlug],
      );
      const template = await getTemplate(eventName, 'en', conn);
      expect(template).not.toBeNull();
      expect(template!.titleTemplate).toBe('Test {{x}}');

      const notificationId = await notificationRepository.create({
        userId,
        categorySlug,
        actionKey: 'test.open',
        title: 'Test Notification',
        body: 'body',
        eventName,
      }, conn);
      expect(notificationId).toBeGreaterThan(0);

      throw new Error('rollback-before-commit');
    })).rejects.toThrow('rollback-before-commit');

    // Nothing persisted — every write went through the rolled-back conn.
    expect(await countRows('notifications')).toBe(0);
    expect(await countRows('notification_rate_limits')).toBe(0);
    expect(await countRows('notification_digest_windows')).toBe(0);
    expect(await countRows('notification_categories')).toBe(0);
    expect(await countRows('notification_actions')).toBe(0);
    expect(await openTransactions()).toBe(0);
  });

  it('TEST F — architecture guard: fixed command handlers must not import or use getPool in their execute path', async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      'modules/financial/commands/process-withdrawal.command.ts',
      'modules/activities/commands/update-activity-status.command.ts',
      'modules/organisations/commands/update-org-status.command.ts',
      'modules/match/commands/update-match-status.command.ts',
      'modules/notifications/commands/dispatch-notification.command.ts',
      'modules/payment/commands/process-payment.command.ts',
      'modules/rbac/commands/assign-role-permissions.command.ts',
      'modules/security/commands/revoke-session.command.ts',
    ];
    for (const rel of files) {
      const abs = resolve(here, '../../', rel);
      const src = await fs.readFile(abs, 'utf8');
      expect(src.includes('getPool()')).toBe(false);
      expect(src.includes('_conn: PoolConnection')).toBe(false);
    }
  });
});