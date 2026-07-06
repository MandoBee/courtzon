import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('cleanup');

export async function runCleanupPolicies(): Promise<{ policies: number; totalDeleted: number }> {
  const pool = getPool();
  const [policies] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM notification_cleanup_policies
     WHERE is_enabled = TRUE`,
  );

  let totalDeleted = 0;
  let count = 0;

  for (const policy of policies as any[]) {
    try {
      const cutoff = new Date(Date.now() - policy.retention_days * 86400 * 1000);
      const [result] = await pool.execute(
        `DELETE FROM ${policy.entity_table} WHERE created_at < ?`,
        [cutoff],
      );
      const deleted = (result as any).affectedRows || 0;
      totalDeleted += deleted;

      await pool.execute(
        'UPDATE notification_cleanup_policies SET last_run_at = NOW(), deleted_count = deleted_count + ? WHERE id = ?',
        [deleted, policy.id],
      );

      count++;
      log.info({ policy: policy.policy_key, deleted }, 'Cleanup complete');
    } catch (err: any) {
      log.error({ err, policy: policy.policy_key }, 'Cleanup failed');
    }
  }

  return { policies: count, totalDeleted };
}

export async function getCleanupPolicies(): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM notification_cleanup_policies ORDER BY retention_days ASC`,
  );
  return rows as any[];
}

export async function updateCleanupPolicy(
  policyKey: string,
  updates: { retention_days?: number; is_enabled?: boolean },
): Promise<void> {
  const pool = getPool();
  const setParts: string[] = [];
  const params: any[] = [];

  if (updates.retention_days !== undefined) {
    setParts.push('retention_days = ?');
    params.push(updates.retention_days);
  }
  if (updates.is_enabled !== undefined) {
    setParts.push('is_enabled = ?');
    params.push(updates.is_enabled ? 1 : 0);
  }

  if (setParts.length) {
    params.push(policyKey);
    await pool.execute(
      `UPDATE notification_cleanup_policies SET ${setParts.join(', ')} WHERE policy_key = ?`,
      params,
    );
  }
}
