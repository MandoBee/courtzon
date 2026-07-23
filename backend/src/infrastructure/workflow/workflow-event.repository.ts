import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import type { IWorkflowEventRepository, WorkflowEventRecord, WorkflowEventCreate } from './workflow-repository.interfaces.js';

const log = createModuleLogger('workflow');

type Executor = mysql.Pool | mysql.PoolConnection;

function resolveExecutor(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

/**
 * Repository for the `workflow_events` table.
 *
 * Journals all events that a workflow produces or consumes during its
 * execution. Used for replay, crash recovery, observability, and audit.
 *
 * ## Usage
 * - Every incoming EventEnvelope that triggers a workflow step is recorded here.
 * - Every outgoing event emitted by a workflow step is recorded here.
 * - Replay loads events by workflow_instance_id and replays them in order.
 *
 * ## JSON payload limits
 * - Maximum supported: 64 KB (MySQL JSON column limit)
 * - Recommended maximum: 16 KB
 * - event_body: The full event payload from the EventEnvelope.
 *   Events with larger payloads should store references (e.g. file URL) instead.
 *
 * ## Transaction behaviour
 * Every method accepts an optional `conn?: PoolConnection`. When provided the
 * operation runs inside the caller's transaction. When omitted a fresh
 * connection is acquired from the pool.
 *
 * ## No per-event metrics
 * Events are high-volume. Metrics are aggregated at the workflow-instance level
 * by WorkflowInstanceRepository counters to keep Prometheus label cardinality low.
 */
class WorkflowEventRepository implements IWorkflowEventRepository {

  async create(data: WorkflowEventCreate, conn?: mysql.PoolConnection): Promise<number> {
    const pool = resolveExecutor(conn);
    const [result] = await pool.execute(
      `INSERT INTO workflow_events (workflow_instance_id, event_name, event_body, correlation_id, causation_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.workflowInstanceId,
        data.eventName,
        data.eventBody ? JSON.stringify(data.eventBody) : null,
        data.correlationId || null,
        data.causationId || null,
      ],
    );
    return (result as mysql.ResultSetHeader).insertId;
  }

  async findByWorkflowInstance(
    workflowInstanceId: number,
    page = 1,
    limit = 50,
    conn?: mysql.PoolConnection,
  ): Promise<{ rows: WorkflowEventRecord[]; total: number }> {
    const pool = resolveExecutor(conn);
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM workflow_events WHERE workflow_instance_id = ?`,
      [workflowInstanceId],
    );
    const total = (countRows as any[])[0]?.cnt || 0;

    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT * FROM workflow_events WHERE workflow_instance_id = ? ORDER BY id ASC LIMIT ? OFFSET ?`,
      [workflowInstanceId, limit, offset],
    );
    return { rows: rows as WorkflowEventRecord[], total };
  }

  async findByCorrelationId(
    correlationId: string,
    page = 1,
    limit = 50,
    conn?: mysql.PoolConnection,
  ): Promise<{ rows: WorkflowEventRecord[]; total: number }> {
    const pool = resolveExecutor(conn);
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM workflow_events WHERE correlation_id = ?`,
      [correlationId],
    );
    const total = (countRows as any[])[0]?.cnt || 0;

    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT * FROM workflow_events WHERE correlation_id = ? ORDER BY id ASC LIMIT ? OFFSET ?`,
      [correlationId, limit, offset],
    );
    return { rows: rows as WorkflowEventRecord[], total };
  }

  async getEventCount(workflowInstanceId: number, conn?: mysql.PoolConnection): Promise<number> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM workflow_events WHERE workflow_instance_id = ?`,
      [workflowInstanceId],
    );
    return (rows as any[])[0]?.cnt || 0;
  }
}

export const workflowEventRepository: IWorkflowEventRepository = new WorkflowEventRepository();
