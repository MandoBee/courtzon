import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { processedCommandsRepository } from '../../infrastructure/command/processed-commands.repository.js';
import { commandPipeline } from './command-pipeline.js';
import { ValidationError } from '../errors/app-error.js';
import type { Command, CommandHandler } from './command-base.js';

const DDL = `
CREATE TABLE IF NOT EXISTS processed_commands (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  command_id VARCHAR(26) NOT NULL,
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

CREATE TABLE IF NOT EXISTS workflow_instances (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(26) NOT NULL,
  workflow_type VARCHAR(64) NOT NULL,
  status ENUM('pending','active','completed','failed','compensating','compensated','cancelled') NOT NULL DEFAULT 'pending',
  correlation_id VARCHAR(64) DEFAULT NULL,
  causation_id VARCHAR(64) DEFAULT NULL,
  actor_id INT UNSIGNED DEFAULT NULL,
  payload JSON DEFAULT NULL,
  context JSON DEFAULT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  failed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT UNSIGNED DEFAULT 1,
  UNIQUE KEY uk_public_id (public_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
`;

let mysql: StartedTestContainer;
let mockConn: any;

function createUlid(): string {
  const ts = Date.now().toString(36).padStart(10, '0');
  return (ts + Math.random().toString(36).slice(2, 18)).substring(0, 26);
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

  mockConn = await pool.getConnection();
}, 120000);

afterAll(async () => {
  if (mockConn) mockConn.release();
  await closePool();
  try { await mysql.stop(); } catch { /* ignore */ }
}, 30000);

interface BookingResult {
  bookingId: number;
}

describe('CommandPipeline — Integration', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM processed_commands');
  });

  it('executes a command and records idempotency', async () => {
    const command: Command = {
      commandId: createUlid(),
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: '42',
      payload: { courtId: 10, userId: 5 },
      actorId: 1,
      correlationId: 'integ-corr-001',
    };

    const handler: CommandHandler<typeof command, BookingResult> = {
      validate: async () => {},
      execute: async (cmd, conn) => {
        const pool = getPool();
        await pool.execute(
          `INSERT INTO workflow_instances (public_id, workflow_type, status, correlation_id, actor_id, payload)
           VALUES (?, 'test.booking', 'pending', ?, ?, ?)`,
          [createUlid(), cmd.correlationId, cmd.actorId, JSON.stringify(cmd.payload)],
        );
        return { bookingId: 42 };
      },
      events: () => [{
        eventName: 'booking.created',
        payload: { bookingId: 42 },
        context: { aggregateType: 'booking', aggregateId: '42', aggregateVersion: 1 },
      }],
    };

    const result = await commandPipeline.execute(command, handler);

    expect(result.status).toBe('processed');
    if (result.status === 'processed') {
      expect(result.data?.bookingId).toBe(42);
    }

    const already = await processedCommandsRepository.hasBeenProcessed(command.commandId, 'CreateBooking');
    expect(already).toBe(true);
  });

  it('skips duplicate command via idempotency', async () => {
    const command: Command = {
      commandId: createUlid(),
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: '42',
      payload: { courtId: 10 },
      actorId: 1,
    };

    await processedCommandsRepository.recordProcessed({
      commandId: command.commandId,
      commandType: command.commandType,
      subscriberId: command.commandType,
    });

    let executeCount = 0;
    const handler: CommandHandler<typeof command, { ok: boolean }> = {
      validate: async () => {},
      execute: async () => {
        executeCount++;
        return { ok: true };
      },
    };

    const result = await commandPipeline.execute(command, handler);
    expect(result.status).toBe('skipped');
    expect(executeCount).toBe(0);
  });

  it('returns validation errors without executing', async () => {
    const command: Command = {
      commandId: createUlid(),
      commandType: 'ValidateBooking',
      aggregateType: 'booking',
      aggregateId: '1',
      payload: {},
    };

    let executeCalled = false;
    const handler: CommandHandler<typeof command, any> = {
      validate: async () => {
        throw new ValidationError('Court ID is required');
      },
      execute: async () => {
        executeCalled = true;
        return {};
      },
    };

    const result = await commandPipeline.execute(command, handler);
    expect(result.status).toBe('error');
    expect((result as any).code).toBe('VALIDATION_ERROR');
    expect(executeCalled).toBe(false);
  });

  it('works without event definitions', async () => {
    const command: Command = {
      commandId: createUlid(),
      commandType: 'SimpleCommand',
      aggregateType: 'test',
      aggregateId: '1',
      payload: {},
    };

    const handler: CommandHandler<typeof command, { done: boolean }> = {
      validate: async () => {},
      execute: async () => ({ done: true }),
    };

    const result = await commandPipeline.execute(command, handler);
    expect(result.status).toBe('processed');
    if (result.status === 'processed') {
      expect(result.data?.done).toBe(true);
    }
  });

  it('records idempotency inside the transaction', async () => {
    const command: Command = {
      commandId: createUlid(),
      commandType: 'FailOnPurpose',
      aggregateType: 'test',
      aggregateId: '1',
      payload: {},
    };

    const handler: CommandHandler<typeof command, any> = {
      validate: async () => {},
      execute: async () => {
        throw new Error('Simulated failure');
      },
    };

    await expect(commandPipeline.execute(command, handler)).rejects.toThrow('Simulated failure');

    const processed = await processedCommandsRepository.hasBeenProcessed(
      command.commandId, 'FailOnPurpose',
    );
    expect(processed).toBe(false);
  });
});
