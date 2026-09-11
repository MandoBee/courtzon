// ============================================================================
// Academy G4 — authoritative "has this group started?" helper.
// Single implementation used by promotion/replacement gates — never duplicated
// in controllers.
// ============================================================================
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];
type Executor = mysql.Pool | mysql.PoolConnection;

/**
 * A group is considered started when its EARLIEST non-cancelled session:
 *   - has begun according to its resolved UTC start (`start_at_utc <= now`), OR
 *   - has status `in_progress` or `completed`, OR
 *   - (legacy sessions without `start_at_utc`) has a `session_date` before today.
 *
 * Once started, waitlist promotion/replacement is blocked. An empty group
 * (no sessions) is NOT started.
 */
export async function isAcademyGroupStarted(groupId: number, conn?: mysql.PoolConnection): Promise<boolean> {
  const db: Executor = conn ?? getPool();
  const [rows] = await db.query<RowData>(
    `SELECT
       MAX(status IN ('in_progress','completed')) AS any_started,
       MIN(start_at_utc) AS earliest_utc,
       MIN(session_date) AS earliest_date
     FROM academy_group_sessions
     WHERE group_id = ? AND status != 'cancelled'`,
    [groupId],
  );
  const r = (rows[0] as any) || {};
  if (Number(r.any_started) === 1) return true;
  if (r.earliest_utc != null) {
    const t = new Date(r.earliest_utc).getTime();
    if (!Number.isNaN(t)) return t <= Date.now();
  }
  if (r.earliest_date != null) {
    const today = new Date();
    const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(
      today.getUTCDate(),
    ).padStart(2, '0')}`;
    return String(r.earliest_date) < todayStr;
  }
  return false;
}