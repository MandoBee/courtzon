import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { createPool, closePool, getPool } from '../../database/mysql.js';
import { generateUUID } from '../../shared/utils/token.js';
import { workflowInstanceRepository } from './workflow-instance.repository.js';
import { workflowStepRepository } from './workflow-step.repository.js';
import { workflowEventRepository } from './workflow-event.repository.js';

const WORKFLOW_DDL = `
CREATE TABLE IF NOT EXISTS workflow_instances (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id       VARCHAR(26) NOT NULL,
  workflow_type   VARCHAR(64) NOT NULL,
  status          ENUM('pending','active','completed','failed','compensating','compensated','cancelled') NOT NULL DEFAULT 'pending',
  correlation_id  VARCHAR(64) DEFAULT NULL,
  causation_id    VARCHAR(64) DEFAULT NULL,
  actor_id        INT UNSIGNED DEFAULT NULL,
  payload         JSON DEFAULT NULL,
  context         JSON DEFAULT NULL,
  started_at      TIMESTAMP NULL DEFAULT NULL,
  completed_at    TIMESTAMP NULL DEFAULT NULL,
  failed_at       TIMESTAMP NULL DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version         INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uk_public_id (public_id),
  KEY idx_workflow_type_status (workflow_type, status),
  KEY idx_correlation_id (correlation_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workflow_steps (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  step_name             VARCHAR(128) NOT NULL,
  step_type             ENUM('activity','compensation') NOT NULL DEFAULT 'activity',
  status                ENUM('pending','active','completed','failed','skipped','compensated') NOT NULL DEFAULT 'pending',
  retry_count           INT UNSIGNED NOT NULL DEFAULT 0,
  max_retries           INT UNSIGNED NOT NULL DEFAULT 3,
  timeout_at            TIMESTAMP NULL DEFAULT NULL,
  compensation_status   ENUM('none','pending','completed','failed') NOT NULL DEFAULT 'none',
  input                 JSON DEFAULT NULL,
  output                JSON DEFAULT NULL,
  error                 TEXT DEFAULT NULL,
  started_at            TIMESTAMP NULL DEFAULT NULL,
  completed_at          TIMESTAMP NULL DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_workflow_instance (workflow_instance_id),
  KEY idx_step_status (workflow_instance_id, status),
  KEY idx_timeout_query (status, timeout_at),
  CONSTRAINT fk_ws_workflow FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workflow_events (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  event_name            VARCHAR(128) NOT NULL,
  event_body            JSON DEFAULT NULL,
  correlation_id        VARCHAR(64) DEFAULT NULL,
  causation_id          VARCHAR(64) DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_we_workflow_instance (workflow_instance_id),
  KEY idx_we_correlation (correlation_id),
  KEY idx_we_created (created_at),
  CONSTRAINT fk_we_workflow FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances (id) ON DELETE CASCADE
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

  for (const stmt of WORKFLOW_DDL.split(';').filter(s => s.trim())) {
    await pool.execute(stmt.trim());
  }
}, 120000);

afterAll(async () => {
  await closePool();
  try { await mysql.stop(); } catch { /* ignore */ }
}, 30000);

// ── Helpers ──

function createPublicId(): string {
  return generateUUID().replace(/-/g, '').substring(0, 26);
}

async function createTestWorkflow(correlationId = 'corr-001'): Promise<{ id: number; version: number }> {
  const id = await workflowInstanceRepository.create({
    publicId: createPublicId(),
    workflowType: 'test.workflow',
    correlationId,
    causationId: 'caus-001',
    actorId: 1,
    payload: { orderId: 42 },
    context: { step: 0 },
  });
  return { id, version: 1 };
}

// ── WorkflowInstanceRepository ──

describe('WorkflowInstanceRepository', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM workflow_events');
    await pool.execute('DELETE FROM workflow_steps');
    await pool.execute('DELETE FROM workflow_instances');
  });

  describe('create', () => {
    it('creates a workflow instance with status pending and version 1', async () => {
      const { id } = await createTestWorkflow();

      const instance = await workflowInstanceRepository.findById(id);
      expect(instance).not.toBeNull();
      expect(instance!.workflow_type).toBe('test.workflow');
      expect(instance!.status).toBe('pending');
      expect(instance!.correlation_id).toBe('corr-001');
      expect(instance!.causation_id).toBe('caus-001');
      expect(instance!.actor_id).toBe(1);
      expect(instance!.payload).toEqual({ orderId: 42 });
      expect(instance!.context).toEqual({ step: 0 });
      expect(instance!.version).toBe(1);
    });
  });

  describe('findById', () => {
    it('returns null for non-existent id', async () => {
      const result = await workflowInstanceRepository.findById(9999);
      expect(result).toBeNull();
    });
  });

  describe('findByPublicId', () => {
    it('looks up a workflow by its ULID', async () => {
      const publicId = createPublicId();
      await workflowInstanceRepository.create({ publicId, workflowType: 'test.lookup' });
      const instance = await workflowInstanceRepository.findByPublicId(publicId);
      expect(instance).not.toBeNull();
      expect(instance!.public_id).toBe(publicId);
    });
  });

  describe('findActiveByType', () => {
    it('returns only active workflows of the specified type', async () => {
      const { id: id1, version: v1 } = await createTestWorkflow();
      await workflowInstanceRepository.updateStatus(id1, 'active', v1);

      const { id: id2 } = await createTestWorkflow();
      const inst2 = await workflowInstanceRepository.findById(id2);
      await workflowInstanceRepository.updateStatus(id2, 'completed', inst2!.version);

      const active = await workflowInstanceRepository.findActiveByType('test.workflow');
      expect(active.length).toBe(1);
      expect(active[0].id).toBe(id1);
    });
  });

  describe('findByCorrelationId', () => {
    it('finds a workflow by its correlation id', async () => {
      const id = await workflowInstanceRepository.create({
        publicId: createPublicId(),
        workflowType: 'test.corr',
        correlationId: 'unique-corr-id',
      });
      const instance = await workflowInstanceRepository.findByCorrelationId('unique-corr-id');
      expect(instance).not.toBeNull();
      expect(instance!.id).toBe(id);
    });
  });

  describe('updateStatus — optimistic locking', () => {
    it('transitions from pending to active with correct version', async () => {
      const { id, version } = await createTestWorkflow();
      const updated = await workflowInstanceRepository.updateStatus(id, 'active', version);
      expect(updated).toBe(true);

      const instance = await workflowInstanceRepository.findById(id);
      expect(instance!.status).toBe('active');
      expect(instance!.started_at).not.toBeNull();
      expect(instance!.version).toBe(version + 1);
    });

    it('transitions to completed', async () => {
      const { id, version: v1 } = await createTestWorkflow();
      await workflowInstanceRepository.updateStatus(id, 'active', v1);
      const inst = await workflowInstanceRepository.findById(id);
      await workflowInstanceRepository.updateStatus(id, 'completed', inst!.version);

      const instance = await workflowInstanceRepository.findById(id);
      expect(instance!.status).toBe('completed');
      expect(instance!.completed_at).not.toBeNull();
    });

    it('transitions to failed', async () => {
      const { id, version } = await createTestWorkflow();
      await workflowInstanceRepository.updateStatus(id, 'failed', version);

      const instance = await workflowInstanceRepository.findById(id);
      expect(instance!.status).toBe('failed');
      expect(instance!.failed_at).not.toBeNull();
    });

    it('returns false when id does not exist', async () => {
      const updated = await workflowInstanceRepository.updateStatus(9999, 'completed', 1);
      expect(updated).toBe(false);
    });

    it('fails when version does not match (optimistic lock)', async () => {
      const { id } = await createTestWorkflow();
      const wrongVersion = 999;

      const updated = await workflowInstanceRepository.updateStatus(id, 'active', wrongVersion);
      expect(updated).toBe(false);

      const instance = await workflowInstanceRepository.findById(id);
      expect(instance!.status).toBe('pending');
      expect(instance!.version).toBe(1);
    });
  });

  describe('updateContext — optimistic locking', () => {
    it('updates the runtime context with correct version', async () => {
      const { id, version } = await createTestWorkflow();
      const updated = await workflowInstanceRepository.updateContext(id, { step: 1, bookingRef: 'BK-001' }, version);
      expect(updated).toBe(true);

      const instance = await workflowInstanceRepository.findById(id);
      expect(instance!.context).toEqual({ step: 1, bookingRef: 'BK-001' });
      expect(instance!.version).toBe(version + 1);
    });

    it('fails when version does not match', async () => {
      const { id } = await createTestWorkflow();

      const updated = await workflowInstanceRepository.updateContext(id, { step: 1 }, 999);
      expect(updated).toBe(false);
    });
  });
});

// ── WorkflowStepRepository ──

describe('WorkflowStepRepository', () => {
  let workflowId: number;

  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM workflow_events');
    await pool.execute('DELETE FROM workflow_steps');
    await pool.execute('DELETE FROM workflow_instances');
    const result = await createTestWorkflow();
    workflowId = result.id;
  });

  describe('create', () => {
    it('creates a step with status pending', async () => {
      const stepId = await workflowStepRepository.create({
        workflowInstanceId: workflowId,
        stepName: 'validate_booking',
        maxRetries: 5,
        input: { courtId: 10 },
      });
      expect(stepId).toBeGreaterThan(0);

      const step = await workflowStepRepository.findById(stepId);
      expect(step).not.toBeNull();
      expect(step!.step_name).toBe('validate_booking');
      expect(step!.status).toBe('pending');
      expect(step!.step_type).toBe('activity');
      expect(step!.max_retries).toBe(5);
      expect(step!.input).toEqual({ courtId: 10 });
    });
  });

  describe('findByWorkflowInstance', () => {
    it('paginates steps correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await workflowStepRepository.create({ workflowInstanceId: workflowId, stepName: `step_${i}` });
      }

      const page1 = await workflowStepRepository.findByWorkflowInstance(workflowId, 1, 2);
      expect(page1.rows.length).toBe(2);
      expect(page1.total).toBe(5);

      const page3 = await workflowStepRepository.findByWorkflowInstance(workflowId, 3, 2);
      expect(page3.rows.length).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('transitions step from pending to active', async () => {
      const stepId = await workflowStepRepository.create({ workflowInstanceId: workflowId, stepName: 'process' });
      await workflowStepRepository.updateStatus(stepId, 'active');

      const step = await workflowStepRepository.findById(stepId);
      expect(step!.status).toBe('active');
      expect(step!.started_at).not.toBeNull();
    });

    it('transitions step to completed', async () => {
      const stepId = await workflowStepRepository.create({ workflowInstanceId: workflowId, stepName: 'process' });
      await workflowStepRepository.updateStatus(stepId, 'completed');

      const step = await workflowStepRepository.findById(stepId);
      expect(step!.status).toBe('completed');
      expect(step!.completed_at).not.toBeNull();
    });
  });

  describe('updateRetry', () => {
    it('increments retry_count and updates error', async () => {
      const stepId = await workflowStepRepository.create({ workflowInstanceId: workflowId, stepName: 'retryable' });
      await workflowStepRepository.updateRetry(stepId, undefined, 'Timeout error');

      const step = await workflowStepRepository.findById(stepId);
      expect(step!.retry_count).toBe(1);
      expect(step!.error).toBe('Timeout error');
    });
  });

  describe('updateCompensation', () => {
    it('sets compensation status', async () => {
      const stepId = await workflowStepRepository.create({ workflowInstanceId: workflowId, stepName: 'billable' });
      await workflowStepRepository.updateCompensation(stepId, 'pending');

      const step = await workflowStepRepository.findById(stepId);
      expect(step!.compensation_status).toBe('pending');
    });
  });

  describe('findTimeoutSteps', () => {
    it('finds steps that have exceeded their timeout', async () => {
      const stepId = await workflowStepRepository.create({
        workflowInstanceId: workflowId,
        stepName: 'slow_operation',
        timeoutAt: new Date(Date.now() - 60000),
      });
      await workflowStepRepository.updateStatus(stepId, 'active');

      const timedOut = await workflowStepRepository.findTimeoutSteps();
      expect(timedOut.length).toBeGreaterThanOrEqual(1);
      expect(timedOut.some(s => s.id === stepId)).toBe(true);
    });
  });
});

// ── WorkflowEventRepository ──

describe('WorkflowEventRepository', () => {
  let workflowId: number;

  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM workflow_events');
    await pool.execute('DELETE FROM workflow_steps');
    await pool.execute('DELETE FROM workflow_instances');
    const result = await createTestWorkflow();
    workflowId = result.id;
  });

  describe('create', () => {
    it('records an event for a workflow', async () => {
      const eventId = await workflowEventRepository.create({
        workflowInstanceId: workflowId,
        eventName: 'booking.payment.received',
        eventBody: { amount: 100, currency: 'USD' },
        correlationId: 'corr-001',
        causationId: 'caus-001',
      });
      expect(eventId).toBeGreaterThan(0);
    });
  });

  describe('findByWorkflowInstance', () => {
    it('paginates events in order', async () => {
      for (let i = 0; i < 3; i++) {
        await workflowEventRepository.create({ workflowInstanceId: workflowId, eventName: `event_${i}` });
      }

      const result = await workflowEventRepository.findByWorkflowInstance(workflowId, 1, 10);
      expect(result.total).toBe(3);
      expect(result.rows.length).toBe(3);
      expect(result.rows[0].event_name).toBe('event_0');
      expect(result.rows[2].event_name).toBe('event_2');
    });
  });

  describe('findByCorrelationId', () => {
    it('finds events by correlation id', async () => {
      await workflowEventRepository.create({
        workflowInstanceId: workflowId,
        eventName: 'test.event',
        correlationId: 'unique-corr',
      });

      const result = await workflowEventRepository.findByCorrelationId('unique-corr');
      expect(result.total).toBe(1);
      expect(result.rows[0].event_name).toBe('test.event');
    });
  });

  describe('getEventCount', () => {
    it('returns the total count for a workflow', async () => {
      for (let i = 0; i < 3; i++) {
        await workflowEventRepository.create({ workflowInstanceId: workflowId, eventName: `e${i}` });
      }
      const count = await workflowEventRepository.getEventCount(workflowId);
      expect(count).toBe(3);
    });
  });
});

// ── End-to-End: CorrelationId Chain ──

describe('E2E — CorrelationId execution chain', () => {
  const sharedCorrelationId = 'e2e-chain-corr-001';

  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM workflow_events');
    await pool.execute('DELETE FROM workflow_steps');
    await pool.execute('DELETE FROM workflow_instances');
  });

  it('reconstructs the complete execution chain via correlation_id', async () => {
    const { id: workflowId, version: v1 } = await createTestWorkflow(sharedCorrelationId);
    await workflowInstanceRepository.updateStatus(workflowId, 'active', v1);

    await workflowStepRepository.create({ workflowInstanceId: workflowId, stepName: 'validate_booking' });
    await workflowStepRepository.create({ workflowInstanceId: workflowId, stepName: 'process_payment' });
    await workflowStepRepository.create({ workflowInstanceId: workflowId, stepName: 'confirm_booking' });

    await workflowEventRepository.create({
      workflowInstanceId: workflowId,
      eventName: 'booking.payment.received',
      correlationId: sharedCorrelationId,
    });
    await workflowEventRepository.create({
      workflowInstanceId: workflowId,
      eventName: 'booking.confirmed',
      correlationId: sharedCorrelationId,
    });

    const workflow = await workflowInstanceRepository.findByCorrelationId(sharedCorrelationId);
    expect(workflow).not.toBeNull();
    expect(workflow!.workflow_type).toBe('test.workflow');

    const steps = await workflowStepRepository.findByWorkflowInstance(workflowId);
    expect(steps.total).toBe(3);
    expect(steps.rows.map(s => s.step_name)).toEqual(['validate_booking', 'process_payment', 'confirm_booking']);

    const events = await workflowEventRepository.findByCorrelationId(sharedCorrelationId);
    expect(events.total).toBe(2);
    expect(events.rows.map(e => e.event_name)).toEqual(['booking.payment.received', 'booking.confirmed']);

    const workflowEvents = await workflowEventRepository.findByWorkflowInstance(workflowId);
    expect(workflowEvents.total).toBe(2);
  });
});

// ── FK Constraints & Transaction ──

describe('Workflow — FK constraints & transaction support', () => {
  beforeEach(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM workflow_events');
    await pool.execute('DELETE FROM workflow_steps');
    await pool.execute('DELETE FROM workflow_instances');
  });

  it('FK constraint prevents orphan workflow_steps', async () => {
    await expect(
      workflowStepRepository.create({ workflowInstanceId: 9999, stepName: 'orphan' }),
    ).rejects.toThrow();
  });

  it('FK constraint prevents orphan workflow_events', async () => {
    await expect(
      workflowEventRepository.create({ workflowInstanceId: 9999, eventName: 'orphan' }),
    ).rejects.toThrow();
  });

  it('supports rollback within a transaction', async () => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const id = await workflowInstanceRepository.create({
        publicId: createPublicId(),
        workflowType: 'test.rollback',
      }, conn);

      await conn.rollback();

      const instance = await workflowInstanceRepository.findById(id);
      expect(instance).toBeNull();
    } finally {
      conn.release();
    }
  });
});

// ── Cascade Delete Stress Test ──

describe('Workflow — Cascade delete stress test', () => {
  it('deletes 1 workflow with 1000 steps and 10000 events cleanly', async () => {
    const pool = getPool();
    const { id: workflowId } = await createTestWorkflow('stress-test');

    for (let i = 0; i < 1000; i++) {
      await workflowStepRepository.create({ workflowInstanceId: workflowId, stepName: `step_${i}` });
    }

    for (let i = 0; i < 10000; i++) {
      await workflowEventRepository.create({
        workflowInstanceId: workflowId,
        eventName: `event_${i}`,
        correlationId: 'stress-test',
      });
    }

    const stepsBefore = await workflowStepRepository.findByWorkflowInstance(workflowId);
    expect(stepsBefore.total).toBe(1000);
    const eventsBefore = await workflowEventRepository.findByWorkflowInstance(workflowId);
    expect(eventsBefore.total).toBe(10000);

    await pool.execute('DELETE FROM workflow_instances WHERE id = ?', [workflowId]);

    const stepsAfter = await workflowStepRepository.findByWorkflowInstance(workflowId);
    expect(stepsAfter.total).toBe(0);
    const eventsAfter = await workflowEventRepository.findByWorkflowInstance(workflowId);
    expect(eventsAfter.total).toBe(0);

    const instance = await workflowInstanceRepository.findById(workflowId);
    expect(instance).toBeNull();
  }, 180000);
});
