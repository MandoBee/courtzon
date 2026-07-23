import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { registry } from '../metrics/metrics.js';
import client from 'prom-client';
import type { IWorkflowStepRepository, WorkflowStepRecord, WorkflowStepCreate, StepStatus, CompensationStatus, StepType } from './workflow-repository.interfaces.js';

const log = createModuleLogger('workflow');

type Executor = mysql.Pool | mysql.PoolConnection;

function resolveExecutor(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

const stepsCreatedTotal = new client.Counter({
  name: 'courtzon_workflow_steps_created_total',
  help: 'Total number of workflow steps created — labelled by step_name',
  labelNames: ['step_name'] as const,
  registers: [registry],
});

/**
 * Repository for the `workflow_steps` table.
 *
 * Each row represents one step (activity or compensation) within a workflow
 * execution. Steps are ordered by id and executed sequentially by the
 * workflow engine.
 *
 * ## Lifecycle
 * ```
 * pending → active → (completed | failed)
 *                       failed
 *                          ↓
 *                   retry (if retry_count < max_retries)
 *                   or
 *                   permanently failed → triggers compensation
 * ```
 *
 * ## Compensation lifecycle
 * ```
 * none → pending → (completed | failed)
 * ```
 *
 * When a step fails with retries exhausted, the engine marks previous
 * completed steps with compensation_status = 'pending' and executes their
 * compensation handlers in reverse order.
 *
 * ## JSON payload limits
 * - Maximum supported: 64 KB (MySQL JSON column limit)
 * - Recommended maximum: 16 KB
 * - input: Copied from workflow payload or previous step output
 * - output: Stored for use as input to the next step
 *   Keep both small — they are read on every retry and during crash recovery.
 *
 * ## Timeout query (findTimeoutSteps)
 * Designed for Worker polling. Scans the `idx_timeout_query` composite index
 * on (status, timeout_at). Returns steps WHERE status = 'active' AND
 * timeout_at IS NOT NULL AND timeout_at < NOW().
 * Expected cardinality: only ACTIVE workflow steps. Purpose: fast detection
 * of stalled steps so the engine can retry or compensate.
 *
 * ## Transaction behaviour
 * Every method accepts an optional `conn?: PoolConnection`. When provided the
 * operation runs inside the caller's transaction. When omitted a fresh
 * connection is acquired from the pool.
 *
 * ## Metrics (low-cardinality labels)
 * - courtzon_workflow_steps_created_total labels: [step_name]
 *   NOT labelled by id/workflow_instance_id (high cardinality).
 */
class WorkflowStepRepository implements IWorkflowStepRepository {

  async create(data: WorkflowStepCreate, conn?: mysql.PoolConnection): Promise<number> {
    const pool = resolveExecutor(conn);
    const [result] = await pool.execute(
      `INSERT INTO workflow_steps (workflow_instance_id, step_name, step_type, max_retries, timeout_at, input)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.workflowInstanceId,
        data.stepName,
        data.stepType || 'activity',
        data.maxRetries ?? 3,
        data.timeoutAt ? new Date(data.timeoutAt) : null,
        data.input ? JSON.stringify(data.input) : null,
      ],
    );
    stepsCreatedTotal.inc({ step_name: data.stepName });
    return (result as mysql.ResultSetHeader).insertId;
  }

  async findById(id: number, conn?: mysql.PoolConnection): Promise<WorkflowStepRecord | null> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT * FROM workflow_steps WHERE id = ?`,
      [id],
    );
    return (rows as any[])[0] || null;
  }

  async findByWorkflowInstance(
    workflowInstanceId: number,
    page = 1,
    limit = 50,
    conn?: mysql.PoolConnection,
  ): Promise<{ rows: WorkflowStepRecord[]; total: number }> {
    const pool = resolveExecutor(conn);
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM workflow_steps WHERE workflow_instance_id = ?`,
      [workflowInstanceId],
    );
    const total = (countRows as any[])[0]?.cnt || 0;

    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT * FROM workflow_steps WHERE workflow_instance_id = ? ORDER BY id ASC LIMIT ? OFFSET ?`,
      [workflowInstanceId, limit, offset],
    );
    return { rows: rows as WorkflowStepRecord[], total };
  }

  async updateStatus(
    id: number,
    status: StepStatus,
    conn?: mysql.PoolConnection,
  ): Promise<boolean> {
    const pool = resolveExecutor(conn);
    const setClauses: string[] = ['status = ?'];
    const params: any[] = [status];

    if (status === 'active') {
      setClauses.push('started_at = COALESCE(started_at, NOW())');
    }
    if (status === 'completed' || status === 'failed') {
      setClauses.push('completed_at = NOW()');
    }

    params.push(id);
    const [result] = await pool.execute(
      `UPDATE workflow_steps SET ${setClauses.join(', ')} WHERE id = ?`,
      params,
    );
    return (result as mysql.ResultSetHeader).affectedRows > 0;
  }

  async updateRetry(
    id: number,
    output?: Record<string, unknown>,
    error?: string,
    conn?: mysql.PoolConnection,
  ): Promise<boolean> {
    const pool = resolveExecutor(conn);
    const [result] = await pool.execute(
      `UPDATE workflow_steps
       SET retry_count = retry_count + 1,
           output = COALESCE(?, output),
           error = COALESCE(?, error)
       WHERE id = ?`,
      [
        output ? JSON.stringify(output) : null,
        error || null,
        id,
      ],
    );
    return (result as mysql.ResultSetHeader).affectedRows > 0;
  }

  async updateCompensation(
    id: number,
    compensationStatus: CompensationStatus,
    conn?: mysql.PoolConnection,
  ): Promise<boolean> {
    const pool = resolveExecutor(conn);
    const [result] = await pool.execute(
      `UPDATE workflow_steps SET compensation_status = ? WHERE id = ?`,
      [compensationStatus, id],
    );
    return (result as mysql.ResultSetHeader).affectedRows > 0;
  }

  async findTimeoutSteps(conn?: mysql.PoolConnection): Promise<WorkflowStepRecord[]> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT * FROM workflow_steps
       WHERE status = 'active' AND timeout_at IS NOT NULL AND timeout_at < NOW()
       ORDER BY timeout_at ASC`,
    );
    return rows as WorkflowStepRecord[];
  }
}

export const workflowStepRepository: IWorkflowStepRepository = new WorkflowStepRepository();
