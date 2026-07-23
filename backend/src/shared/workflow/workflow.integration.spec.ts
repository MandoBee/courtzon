import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { workflowRegistry } from './workflow-registry.js';
import { generateUlid } from '../event-bus/event-envelope.js';
import type { WorkflowDefinition } from './workflow-definition.js';

const DDL = `
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workflow_type   VARCHAR(64) NOT NULL,
  version         INT UNSIGNED NOT NULL,
  definition      JSON NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_workflow_version (workflow_type, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_instances (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id       VARCHAR(26) NOT NULL,
  workflow_type   VARCHAR(64) NOT NULL,
  workflow_definition_version INT UNSIGNED NOT NULL DEFAULT 1,
  status          ENUM('pending','active','completed','failed','compensating','compensated','cancelled') NOT NULL DEFAULT 'pending',
  correlation_id  VARCHAR(64) DEFAULT NULL,
  causation_id    VARCHAR(64) DEFAULT NULL,
  actor_id        INT UNSIGNED DEFAULT NULL,
  payload         JSON DEFAULT NULL,
  context         JSON DEFAULT NULL,
  started_at      TIMESTAMP NULL,
  completed_at    TIMESTAMP NULL,
  failed_at       TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version         INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uk_public_id (public_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_steps (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  step_name             VARCHAR(128) NOT NULL,
  step_type             ENUM('activity','compensation') NOT NULL DEFAULT 'activity',
  status                ENUM('pending','active','completed','failed','skipped','compensated') NOT NULL DEFAULT 'pending',
  retry_count           INT UNSIGNED NOT NULL DEFAULT 0,
  max_retries           INT UNSIGNED NOT NULL DEFAULT 3,
  timeout_at            TIMESTAMP NULL,
  compensation_status   ENUM('none','pending','completed','failed') NOT NULL DEFAULT 'none',
  input                 JSON DEFAULT NULL,
  output                JSON DEFAULT NULL,
  error                 TEXT DEFAULT NULL,
  started_at            TIMESTAMP NULL,
  completed_at          TIMESTAMP NULL,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_instance (workflow_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_event_subscriptions (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  step_name             VARCHAR(128) NOT NULL,
  event_name            VARCHAR(128) NOT NULL,
  correlation_value     VARCHAR(128) NOT NULL,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lookup (event_name, correlation_value),
  KEY idx_workflow (workflow_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_branch_instances (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  branch_id             VARCHAR(64) NOT NULL,
  parent_step_id        BIGINT UNSIGNED DEFAULT NULL,
  branch_type           ENUM('parallel','condition') NOT NULL DEFAULT 'parallel',
  status                ENUM('pending','active','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  current_step_name     VARCHAR(128) DEFAULT NULL,
  started_at            TIMESTAMP NULL,
  completed_at          TIMESTAMP NULL,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_branch_workflow (workflow_instance_id)
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

describe('WorkflowRegistry', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM workflow_definitions');
  });

  it('registers and retrieves a workflow definition', async () => {
    const def: WorkflowDefinition = {
      workflowType: 'test.simple',
      version: 0,
      startStep: 'begin',
      steps: [{ name: 'begin', type: 'END' }],
    };

    await workflowRegistry.register(def);
    const version = await workflowRegistry.getLatestVersion('test.simple');
    expect(version).toBe(1);

    const loaded = await workflowRegistry.getDefinition('test.simple', version);
    expect(loaded).not.toBeNull();
    expect(loaded!.workflowType).toBe('test.simple');
    expect(loaded!.steps[0].name).toBe('begin');
  });

  it('increments version on re-registration', async () => {
    const def: WorkflowDefinition = {
      workflowType: 'test.versioned',
      version: 0,
      startStep: 'a',
      steps: [{ name: 'a', type: 'END' }],
    };

    await workflowRegistry.register(def);
    await workflowRegistry.register(def);

    const version = await workflowRegistry.getLatestVersion('test.versioned');
    expect(version).toBe(2);
  });
});

describe('WorkflowEventSubscriptions', () => {
  it('allows multiple subscriptions for same event+correlation', async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM workflow_event_subscriptions');

    await pool.execute(
      `INSERT INTO workflow_event_subscriptions (workflow_instance_id, step_name, event_name, correlation_value)
       VALUES (?, ?, ?, ?)`,
      [1, 'wait', 'test.event', 'val-1'],
    );
    await pool.execute(
      `INSERT INTO workflow_event_subscriptions (workflow_instance_id, step_name, event_name, correlation_value)
       VALUES (?, ?, ?, ?)`,
      [2, 'wait', 'test.event', 'val-1'],
    );

    const [rows] = await pool.execute(
      'SELECT * FROM workflow_event_subscriptions WHERE event_name = ? AND correlation_value = ?',
      ['test.event', 'val-1'],
    );
    expect((rows as any[]).length).toBe(2);
  });

  it('lookup returns matching subscriptions', async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM workflow_event_subscriptions');

    await pool.execute(
      'INSERT INTO workflow_event_subscriptions (workflow_instance_id, step_name, event_name, correlation_value) VALUES (1, \'a\', \'e1\', \'c1\')',
    );
    await pool.execute(
      'INSERT INTO workflow_event_subscriptions (workflow_instance_id, step_name, event_name, correlation_value) VALUES (2, \'b\', \'e2\', \'c1\')',
    );

    const [rows] = await pool.execute(
      'SELECT * FROM workflow_event_subscriptions WHERE event_name = ? AND correlation_value = ?',
      ['e1', 'c1'],
    );
    expect((rows as any[]).length).toBe(1);
    expect((rows as any[])[0].workflow_instance_id).toBe(1);
  });
});

describe('WorkflowBranchInstances', () => {
  it('inserts and queries branches for a workflow', async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM workflow_branch_instances');

    await pool.execute(
      `INSERT INTO workflow_branch_instances (workflow_instance_id, branch_id, parent_step_id, branch_type, status, current_step_name)
       VALUES (?, ?, ?, 'parallel', 'active', ?)`,
      [1, 'branch_0', null, 'step_a'],
    );
    await pool.execute(
      `INSERT INTO workflow_branch_instances (workflow_instance_id, branch_id, parent_step_id, branch_type, status, current_step_name)
       VALUES (?, ?, ?, 'parallel', 'active', ?)`,
      [1, 'branch_1', null, 'step_b'],
    );

    const [rows] = await pool.execute(
      'SELECT * FROM workflow_branch_instances WHERE workflow_instance_id = ?',
      [1],
    );
    expect((rows as any[]).length).toBe(2);
  });
});
