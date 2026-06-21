import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

/**
 * Read a numeric feature limit from the org's active subscription plan.
 * Returns `defaultValue` when:
 *  - the org has no active subscription
 *  - the plan has no matching feature
 *  - the value is not a valid number
 *
 * The value `-1` or the string `"unlimited"` returns `Infinity`.
 */
export async function getPlanNumericLimit(
  orgId: number,
  key: string,
  defaultValue: number,
): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT spf.value
     FROM organisation_subscriptions os
     JOIN subscription_plans sp ON sp.id = os.plan_id
     JOIN subscription_plan_features spf ON spf.plan_id = sp.id
     JOIN subscription_features sf ON sf.id = spf.feature_id
     WHERE os.organisation_id = ? AND os.subscription_status = 'active'
       AND (os.end_date IS NULL OR os.end_date >= CURDATE())
       AND sf.feature_key = ?
     ORDER BY os.created_at DESC
     LIMIT 1`,
    [orgId, key],
  );

  if (!rows.length) return defaultValue;

  const val = rows[0].value;

  if (val === undefined || val === null) return defaultValue;

  const trimmed = String(val).trim().toLowerCase();
  if (trimmed === 'unlimited' || trimmed === '-1') return Infinity;

  const n = parseInt(trimmed, 10);
  if (isNaN(n)) return defaultValue;
  if (n < 0) return Infinity;
  return n;
}
