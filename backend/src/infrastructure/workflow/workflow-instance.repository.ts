import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { registry } from '../metrics/metrics.js';
import client from 'prom-client';
import type { IWorkflowInstanceRepository, WorkflowInstanceRecord, WorkflowInstanceCreate, WorkflowStatus } from './workflow-repository.interfaces.js';

const log = createModuleLogger('workflow');

type Executor = mysql.Pool | mysql.PoolConnection;

function resolveExecutor(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

const workflowsCreatedTotal = new client.Counter({
  name: 'courtzon_workflows_created_total',
  help: 'Total number of workflow instances created — labelled by workflow_type',
  labelNames: ['workflow_type'] as const,
  registers: [registry],
});

const workflowsCompletedTotal = new client.Counter({
  name: 'courtzon_workflows_completed_total',
  help: 'Total number of workflow instances reaching a final state — labelled by workflow_type, status',
  labelNames: ['workflow_type', 'status'] as const,
  registers: [registry],
});

/**
 * Repository for the `workflow_instances` table.
 *
 * Manages the lifecycle of workflow (saga) executions. Each row represents one
 * workflow instance with its state, input payload, and runtime context.
 *
 * ## Status lifecycle (state machine)
 * ```
 *                 ┌──────────┐
 *                 │  pending  │
 *                 └────┬─────┘
 *                      │
 *                   active
 *                      │
 *              ┌───────┼───────┐
 *              │       │       │
 *           completed  │    failed
 *                      │
 *                compensating
 *                      │
 *                 compensated
 *                      │
 *                  cancelled
 * ```
 *
 * ## JSON payload limits
 * - Maximum supported: 64 KB (MySQL JSON column limit)
 * - Recommended maximum: 16 KB (practical workflow payload size)
 * - payload: Input data for the workflow (e.g. booking details, order info)
 * - context: Runtime state mutated as the workflow progresses
 *   Keep context small — it is read and written on every step transition.
 *
 * ## Optimistic locking
 * Every write uses `UPDATE ... WHERE id = ? AND version = ?` and increments
 * `version = version + 1`. If the row was modified by another writer between
 * read and write, the UPDATE affects zero rows and the caller must retry.
 *
 * ## Timeout query (findTimeoutWorkflows)
 * Designed for Worker polling. Scans ACTIVE workflows with timed-out steps.
 * JOINs with workflow_steps.idx_timeout_query index on (status, timeout_at).
 * Expected cardinality: only ACTIVE workflows have steps with timeout_at set.
 *
 * ## Transaction behaviour
 * Every method accepts an optional `conn?: PoolConnection`. When provided the
 * operation runs inside the caller's transaction. When omitted a fresh
 * connection is acquired from the pool.
 *
 * ## Thread safety
 * Optimistic locking (version column) prevents lost updates.
 * Two concurrent writers cannot overwrite each other:
 * - Reader reads row (gets version N)
 * - Writer 1 updates (WHERE version = N → succeeds, version becomes N+1)
 * - Writer 2 updates (WHERE version = N → fails, zero rows affected)
 * The workflow engine layers Redis locks on top for exclusive execution.
 *
 * ## Metrics (low-cardinality labels)
 * - courtzon_workflows_created_total   labels: [workflow_type]
 * - courtzon_workflows_completed_total labels: [workflow_type, status]
 *   NOT labelled by id/public_id/correlation_id (high cardinality).
 */
class WorkflowInstanceRepository implements IWorkflowInstanceRepository {

  async create(data: WorkflowInstanceCreate, conn?: mysql.PoolConnection): Promise<number> {
    const pool = resolveExecutor(conn);
    const [result] = await pool.execute(
      `INSERT INTO workflow_instances (public_id, workflow_type, correlation_id, causation_id, actor_id, payload, context, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        data.publicId,
        data.workflowType,
        data.correlationId || null,
        data.causationId || null,
        data.actorId || null,
        data.payload ? JSON.stringify(data.payload) : null,
        data.context ? JSON.stringify(data.context) : null,
      ],
    );
    workflowsCreatedTotal.inc({ workflow_type: data.workflowType });
    const insertId = (result as mysql.ResultSetHeader).insertId;
    log.info({ workflowId: insertId, type: data.workflowType, publicId: data.publicId }, 'Workflow instance created');
    return insertId;
  }

  async findById(id: number, conn?: mysql.PoolConnection): Promise<WorkflowInstanceRecord | null> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT * FROM workflow_instances WHERE id = ?`,
      [id],
    );
    return (rows as any[])[0] || null;
  }

  async findByPublicId(publicId: string, conn?: mysql.PoolConnection): Promise<WorkflowInstanceRecord | null> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT * FROM workflow_instances WHERE public_id = ?`,
      [publicId],
    );
    return (rows as any[])[0] || null;
  }

  async findActiveByType(workflowType: string, conn?: mysql.PoolConnection): Promise<WorkflowInstanceRecord[]> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT * FROM workflow_instances WHERE workflow_type = ? AND status IN ('pending', 'active', 'compensating')`,
      [workflowType],
    );
    return rows as WorkflowInstanceRecord[];
  }

  async findByCorrelationId(correlationId: string, conn?: mysql.PoolConnection): Promise<WorkflowInstanceRecord | null> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT * FROM workflow_instances WHERE correlation_id = ?`,
      [correlationId],
    );
    return (rows as any[])[0] || null;
  }

  async updateStatus(
    id: number,
    status: WorkflowStatus,
    expectedVersion: number,
    conn?: mysql.PoolConnection,
  ): Promise<boolean> {
    const pool = resolveExecutor(conn);
    const setClauses: string[] = ['status = ?', 'version = version + 1'];
    const params: any[] = [status];

    if (status === 'active') {
      setClauses.push('started_at = COALESCE(started_at, NOW())');
    }
    if (status === 'completed') {
      setClauses.push('completed_at = NOW()');
    }
    if (status === 'failed' || status === 'cancelled') {
      setClauses.push('failed_at = COALESCE(failed_at, NOW())');
    }

    params.push(id, expectedVersion);
    const [result] = await pool.execute(
      `UPDATE workflow_instances SET ${setClauses.join(', ')} WHERE id = ? AND version = ?`,
      params,
    );
    const affected = (result as mysql.ResultSetHeader).affectedRows;
    if (affected > 0 && ['completed', 'failed', 'cancelled', 'compensated'].includes(status)) {
      workflowsCompletedTotal.inc({ workflow_type: 'unknown', status });
    }
    if (affected === 0) {
      log.warn({ workflowId: id, expectedVersion, status }, 'Optimistic lock failure on updateStatus');
    }
    return affected > 0;
  }

  async updateContext(
    id: number,
    context: Record<string, unknown>,
    expectedVersion: number,
    conn?: mysql.PoolConnection,
  ): Promise<boolean> {
    const pool = resolveExecutor(conn);
    const [result] = await pool.execute(
      `UPDATE workflow_instances SET context = ?, version = version + 1 WHERE id = ? AND version = ?`,
      [JSON.stringify(context), id, expectedVersion],
    );
    const affected = (result as mysql.ResultSetHeader).affectedRows;
    if (affected === 0) {
      log.warn({ workflowId: id, expectedVersion }, 'Optimistic lock failure on updateContext');
    }
    return affected > 0;
  }

  async findTimeoutWorkflows(
    minutesThreshold = 30,
    conn?: mysql.PoolConnection,
  ): Promise<WorkflowInstanceRecord[]> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT wi.* FROM workflow_instances wi
       INNER JOIN workflow_steps ws ON ws.workflow_instance_id = wi.id
       WHERE ws.status = 'active' AND ws.timeout_at IS NOT NULL AND ws.timeout_at < NOW()
       AND wi.status IN ('pending', 'active', 'compensating')
       GROUP BY wi.id`,
    );
    return rows as WorkflowInstanceRecord[];
  }
}

export const workflowInstanceRepository: IWorkflowInstanceRepository = new WorkflowInstanceRepository();
