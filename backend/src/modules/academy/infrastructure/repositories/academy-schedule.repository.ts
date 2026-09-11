// ============================================================================
// Academy G2 — Recurring Scheduling repository (additive; keeps the Academy
// module's existing inline-SQL conventions).
// ============================================================================
import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import type {
  AcademyGroupSession,
  AcademySchedule,
  AcademyScheduleStatus,
  AcademyScheduleWeekday,
} from '../../domain/academy-schedule.types.js';

type RowData = mysql.RowDataPacket[];
type Executor = mysql.Pool | mysql.PoolConnection;

export interface ScheduleCreateInput {
  group_id: number;
  name?: string | null;
  weekdays: AcademyScheduleWeekday[];
  start_date: string;
  end_date: string;
  local_start_time: string;
  local_end_time: string;
  timezone: string;
  branch_id: number | null;
  preferred_court_id: number | null;
  pending_priority_minutes: number;
  created_by: number;
}

export interface SessionInsertInput {
  group_id: number;
  schedule_id: number;
  source_type: 'recurring';
  session_date: string;
  start_time: string;
  end_time: string;
  court_id: number;
  coach_id: number | null;
  status: 'scheduled';
  timezone: string;
  start_at_utc?: string | null;
  end_at_utc?: string | null;
  reservation_status: string;
  priority_seq: number;
  pending_expires_at?: string | null;
  original_session_date: string;
  original_start_time: string;
  original_end_time: string;
  original_court_id: number;
  conflict_metadata?: Record<string, any> | null;
  generation_ref: string;
}

const toMySqlDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

export class AcademyScheduleRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  private resolve(conn?: mysql.PoolConnection): Executor {
    return conn ?? this.pool;
  }

  // ── Schedules ──

  async listSchedules(scopeWhere: string, scopeParams: number[], pag: { offset: number; limit: number }): Promise<{ data: any[]; total: number }> {
    const base = `FROM academy_schedules s
                  JOIN academy_groups g ON g.id = s.group_id
                  JOIN academy_programs p ON p.id = g.program_id`;
    const where = scopeWhere ? `WHERE ${scopeWhere}` : '';
    const [countRows] = await this.pool.query<RowData>(
      `SELECT COUNT(*) AS total ${base} ${where}`, scopeParams,
    );
    const [rows] = await this.pool.query<RowData>(
      `SELECT s.*, g.name AS group_name, p.name AS program_name, p.organisation_id, p.branch_id AS program_branch_id,
              r.name AS preferred_court_name, br.name AS branch_name
       ${base}
       LEFT JOIN resources r ON r.id = s.preferred_court_id
       LEFT JOIN branches br ON br.id = s.branch_id
       ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
      [...scopeParams, pag.limit, pag.offset],
    );
    return { data: rows, total: (countRows[0] as any)?.total ?? 0 };
  }

  async getScheduleById(id: number, conn?: mysql.PoolConnection): Promise<AcademySchedule | null> {
    const db = this.resolve(conn);
    const [rows] = await db.query<RowData>('SELECT * FROM academy_schedules WHERE id = ?', [id]);
    return rows.length ? this.mapSchedule(rows[0] as any) : null;
  }

  async listSchedulesByGroup(groupId: number, conn?: mysql.PoolConnection): Promise<AcademySchedule[]> {
    const db = this.resolve(conn);
    const [rows] = await db.query<RowData>(
      'SELECT * FROM academy_schedules WHERE group_id = ? ORDER BY created_at ASC', [groupId],
    );
    return (rows as any[]).map((r) => this.mapSchedule(r));
  }

  async countActiveSchedulesByGroup(groupId: number, conn?: mysql.PoolConnection): Promise<number> {
    const db = this.resolve(conn);
    const [rows] = await db.query<RowData>(
      "SELECT COUNT(*) AS cnt FROM academy_schedules WHERE group_id = ? AND status IN ('active','paused')",
      [groupId],
    );
    return (rows[0] as any)?.cnt ?? 0;
  }

  async createSchedule(input: ScheduleCreateInput, conn?: mysql.PoolConnection): Promise<number> {
    const db = this.resolve(conn);
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `INSERT INTO academy_schedules
        (group_id, name, weekdays, start_date, end_date, local_start_time, local_end_time,
         timezone, branch_id, preferred_court_id, pending_priority_minutes, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [input.group_id, input.name ?? null, input.weekdays.join(','), input.start_date, input.end_date,
       input.local_start_time, input.local_end_time, input.timezone, input.branch_id,
       input.preferred_court_id, input.pending_priority_minutes, input.created_by],
    );
    return result.insertId;
  }

  async updateSchedule(id: number, fields: Record<string, any>, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    const allowed: Record<string, any> = {
      name: fields.name !== undefined ? fields.name : undefined,
      weekdays: fields.weekdays !== undefined ? fields.weekdays.join(',') : undefined,
      start_date: fields.start_date,
      end_date: fields.end_date,
      local_start_time: fields.local_start_time,
      local_end_time: fields.local_end_time,
      timezone: fields.timezone,
      branch_id: fields.branch_id,
      preferred_court_id: fields.preferred_court_id,
      pending_priority_minutes: fields.pending_priority_minutes,
      status: fields.status,
      updated_by: fields.updated_by,
    };
    const setCols: string[] = [];
    const params: any[] = [];
    for (const [col, val] of Object.entries(allowed)) {
      if (val !== undefined) {
        setCols.push(`${col} = ?`);
        params.push(val);
      }
    }
    if (!setCols.length) return;
    params.push(id);
    await db.execute(`UPDATE academy_schedules SET ${setCols.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
  }

  async setScheduleStatus(id: number, status: AcademyScheduleStatus, actorId: number, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    await db.execute(
      'UPDATE academy_schedules SET status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [status, actorId, id],
    );
  }

  private mapSchedule(row: any): AcademySchedule {
    return {
      ...row,
      weekdays: (row.weekdays || '').split(',').filter(Boolean),
      branch_id: row.branch_id == null ? null : Number(row.branch_id),
      preferred_court_id: row.preferred_court_id == null ? null : Number(row.preferred_court_id),
      pending_priority_minutes: Number(row.pending_priority_minutes),
    };
  }

  // ── Sessions ──

  async findRecurringSessionByDate(scheduleId: number, date: string, conn?: mysql.PoolConnection): Promise<AcademyGroupSession | null> {
    const db = this.resolve(conn);
    const [rows] = await db.query<RowData>(
      `SELECT * FROM academy_group_sessions
       WHERE schedule_id = ? AND source_type = 'recurring' AND session_date = ? LIMIT 1`,
      [scheduleId, date],
    );
    return rows.length ? this.mapSession(rows[0] as any) : null;
  }

  async listScheduleSessions(scheduleId: number, onlyFuture: boolean, conn?: mysql.PoolConnection): Promise<AcademyGroupSession[]> {
    const db = this.resolve(conn);
    const [rows] = await db.query<RowData>(
      `SELECT s.*, g.name AS group_name, r.name AS court_name, u.full_name AS coach_name, sch.name AS schedule_name
       FROM academy_group_sessions s
       JOIN academy_groups g ON g.id = s.group_id
       LEFT JOIN resources r ON r.id = s.court_id
       LEFT JOIN users u ON u.id = s.coach_id
       LEFT JOIN academy_schedules sch ON sch.id = s.schedule_id
       WHERE s.schedule_id = ?
       ${onlyFuture ? ' AND s.session_date >= CURDATE()' : ''}
       ORDER BY s.session_date ASC, s.start_time ASC`,
      [scheduleId],
    );
    return (rows as any[]).map((r) => this.mapSession(r));
  }

  async listFutureRecurringSessions(scheduleId: number, conn?: mysql.PoolConnection): Promise<AcademyGroupSession[]> {
    return this.listScheduleSessions(scheduleId, true, conn);
  }

  async getSessionById(id: number, conn?: mysql.PoolConnection): Promise<AcademyGroupSession | null> {
    const db = this.resolve(conn);
    const [rows] = await db.query<RowData>(
      `SELECT s.*, g.name AS group_name, r.name AS court_name, u.full_name AS coach_name
       FROM academy_group_sessions s
       JOIN academy_groups g ON g.id = s.group_id
       LEFT JOIN resources r ON r.id = s.court_id
       LEFT JOIN users u ON u.id = s.coach_id
       WHERE s.id = ?`,
      [id],
    );
    return rows.length ? this.mapSession(rows[0] as any) : null;
  }

  async getSessionGroupId(id: number, conn?: mysql.PoolConnection): Promise<number | null> {
    const db = this.resolve(conn);
    const [rows] = await db.query<RowData>('SELECT group_id FROM academy_group_sessions WHERE id = ?', [id]);
    return rows.length ? Number((rows[0] as any).group_id) : null;
  }

  async insertSession(input: SessionInsertInput, conn?: mysql.PoolConnection): Promise<number> {
    const db = this.resolve(conn);
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `INSERT INTO academy_group_sessions
        (group_id, schedule_id, source_type, session_date, start_time, end_time, court_id, coach_id, status,
         timezone, start_at_utc, end_at_utc, reservation_status, priority_seq, pending_expires_at,
         original_session_date, original_start_time, original_end_time, original_court_id,
         conflict_metadata, generation_ref)
       VALUES (?, ?, 'recurring', ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.group_id, input.schedule_id, input.session_date, input.start_time, input.end_time,
       input.court_id, input.coach_id ?? null,
       input.timezone, toMySqlDate(input.start_at_utc ?? null), toMySqlDate(input.end_at_utc ?? null),
       input.reservation_status, input.priority_seq, toMySqlDate(input.pending_expires_at ?? null),
       input.original_session_date, input.original_start_time, input.original_end_time, input.original_court_id,
       input.conflict_metadata ? JSON.stringify(input.conflict_metadata) : null,
       input.generation_ref],
    );
    return result.insertId;
  }

  /**
   * Update the G2 evaluation/hold columns of a recurring session. Values must
   * NEVER be silently moved — this only writes conflict-engine state, hold
   * expiry, and (on explicit admin resolution) the chosen alternative.
   */
  async updateSessionG2(id: number, patch: {
    reservation_status?: string | null;
    start_at_utc?: string | null;
    end_at_utc?: string | null;
    pending_expires_at?: string | null;
    conflict_metadata?: Record<string, any> | null;
    court_id?: number | null;
    session_date?: string;
    start_time?: string;
    end_time?: string;
    pending_resolved_at?: string | null;
    pending_resolved_by?: number | null;
    original_session_date?: string | null;
    original_start_time?: string | null;
    original_end_time?: string | null;
    original_court_id?: number | null;
  }, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    const setCols: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => {
      setCols.push(`${col} = ?`);
      params.push(val);
    };
    if (patch.reservation_status !== undefined) push('reservation_status', patch.reservation_status);
    if (patch.start_at_utc !== undefined) push('start_at_utc', toMySqlDate(patch.start_at_utc));
    if (patch.end_at_utc !== undefined) push('end_at_utc', toMySqlDate(patch.end_at_utc));
    if (patch.pending_expires_at !== undefined) push('pending_expires_at', toMySqlDate(patch.pending_expires_at ?? null));
    if (patch.conflict_metadata !== undefined) push('conflict_metadata', patch.conflict_metadata ? JSON.stringify(patch.conflict_metadata) : null);
    if (patch.court_id !== undefined) push('court_id', patch.court_id);
    if (patch.session_date !== undefined) push('session_date', patch.session_date);
    if (patch.start_time !== undefined) push('start_time', patch.start_time);
    if (patch.end_time !== undefined) push('end_time', patch.end_time);
    if (patch.pending_resolved_at !== undefined) push('pending_resolved_at', patch.pending_resolved_at);
    if (patch.pending_resolved_by !== undefined) push('pending_resolved_by', patch.pending_resolved_by);
    if (patch.original_session_date !== undefined) push('original_session_date', patch.original_session_date);
    if (patch.original_start_time !== undefined) push('original_start_time', patch.original_start_time);
    if (patch.original_end_time !== undefined) push('original_end_time', patch.original_end_time);
    if (patch.original_court_id !== undefined) push('original_court_id', patch.original_court_id);
    if (!setCols.length) return;
    params.push(id);
    await db.execute(`UPDATE academy_group_sessions SET ${setCols.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
  }

  /**
   * Competing Academy pending/resolved holds for a court+date window. Self is
   * excluded. Returns rows with id/priority_seq so the conflict engine can
   * apply the deterministic priority rule (earliest-created wins). Occupancy
   * for players is still enforced by bookingRepository.checkSlotAvailability.
   */
  async findCompetingHolds(
    courtId: number,
    date: string,
    start: string,
    end: string,
    excludeSessionId: number | null,
    conn?: mysql.PoolConnection,
  ): Promise<any[]> {
    const db = this.resolve(conn);
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const sMin = sh * 60 + sm;
    const eMin = eh * 60 + em;
    let sql = `SELECT s.id, s.priority_seq, s.session_date, s.start_time, s.end_time,
                      s.group_id, s.reservation_status
               FROM academy_group_sessions s
               WHERE s.court_id = ? AND s.session_date = ?
                 AND s.reservation_status IN ('pending_court','resolved')
                 AND (s.pending_expires_at IS NULL OR s.pending_expires_at > NOW())
                 AND s.status NOT IN ('cancelled')`;
    const params: any[] = [courtId, date];
    if (excludeSessionId) {
      sql += ' AND s.id != ?';
      params.push(excludeSessionId);
    }
    if (eMin > sMin) {
      sql += ' AND ((s.start_time < ? AND s.end_time > ?) OR (s.start_time < ? AND s.end_time > ?))';
      params.push(end, start, end, start);
    } else {
      sql += ' AND ((s.session_date = ? AND (s.end_time > ? OR s.end_time <= s.start_time)) OR (s.session_date = DATE_ADD(?, INTERVAL 1 DAY) AND s.start_time < ? AND s.end_time > \'00:00\'))';
      params.push(date, end, date, end);
    }
    const [rows] = await db.query<RowData>(sql, params);
    return rows;
  }

  /** Downgrade later-priority holders that this (earlier) hold replaces. */
  async downgradeLaterHolders(
    courtId: number,
    date: string,
    start: string,
    end: string,
    prioritySeq: number,
    excludingSessionId: number,
    metadata: Record<string, any>,
    conn?: mysql.PoolConnection,
  ): Promise<number> {
    const db = this.resolve(conn);
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const sMin = sh * 60 + sm;
    const eMin = eh * 60 + em;
    let sql = `UPDATE academy_group_sessions
               SET reservation_status = 'conflict',
                   conflict_metadata = ?,
                   pending_expires_at = NULL,
                   updated_at = NOW()
               WHERE court_id = ? AND session_date = ?
                 AND reservation_status IN ('pending_court','resolved')
                 AND (pending_expires_at IS NULL OR pending_expires_at > NOW())
                 AND status NOT IN ('cancelled')
                 AND (priority_seq > ? OR (priority_seq = ? AND id > ?))
                 AND id != ?`;
    const params: any[] = [JSON.stringify(metadata), courtId, date, prioritySeq, prioritySeq, prioritySeq, excludingSessionId];
    if (eMin > sMin) {
      sql += ' AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?))';
      params.push(end, start, end, start);
    } else {
      sql += ' AND ((session_date = ? AND (end_time > ? OR end_time <= start_time)) OR (session_date = DATE_ADD(?, INTERVAL 1 DAY) AND start_time < ? AND end_time > \'00:00\'))';
      params.push(date, end, date, end);
    }
    const [result] = await db.execute<mysql.ResultSetHeader>(sql, params);
    return result.affectedRows;
  }

  /** Holds whose deterministic pending window has passed (no auto-cancel/extend). */
  async findExpiredHolds(conn?: mysql.PoolConnection): Promise<any[]> {
    const db = this.resolve(conn);
    const [rows] = await db.query<RowData>(
      `SELECT id, group_id, schedule_id, session_date FROM academy_group_sessions
       WHERE reservation_status IN ('pending_court','resolved')
         AND pending_expires_at IS NOT NULL AND pending_expires_at < NOW()
         AND status NOT IN ('completed','cancelled')`,
    );
    return rows;
  }

  async markHoldExpired(id: number, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    await db.execute(
      `UPDATE academy_group_sessions
       SET reservation_status = 'pending_expired', pending_expires_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [id],
    );
  }

  async listSessions(scopeWhere: string, scopeParams: number[], pag: { offset: number; limit: number }): Promise<{ data: any[]; total: number }> {
    const base = `FROM academy_group_sessions s
                  JOIN academy_groups g ON g.id = s.group_id
                  JOIN academy_programs p ON p.id = g.program_id`;
    const where = scopeWhere ? `WHERE ${scopeWhere}` : '';
    const [countRows] = await this.pool.query<RowData>(
      `SELECT COUNT(*) AS total ${base} ${where}`, scopeParams,
    );
    const [rows] = await this.pool.query<RowData>(
      `SELECT s.*, g.name AS group_name, r.name AS court_name, u.full_name AS coach_name,
              sch.name AS schedule_name
       ${base}
       LEFT JOIN resources r ON r.id = s.court_id
       LEFT JOIN users u ON u.id = s.coach_id
       LEFT JOIN academy_schedules sch ON sch.id = s.schedule_id
       ${where} ORDER BY s.session_date DESC, s.start_time ASC LIMIT ? OFFSET ?`,
      [...scopeParams, pag.limit, pag.offset],
    );
    return { data: rows, total: (countRows[0] as any)?.total ?? 0 };
  }

  private mapSession(row: any): AcademyGroupSession {
    return {
      ...row,
      reservation_status: row.reservation_status ?? null,
      priority_seq: row.priority_seq == null ? null : Number(row.priority_seq),
      start_at_utc: row.start_at_utc ? new Date(row.start_at_utc).toISOString() : null,
      end_at_utc: row.end_at_utc ? new Date(row.end_at_utc).toISOString() : null,
      conflict_metadata: row.conflict_metadata ? JSON.parse(row.conflict_metadata) : null,
    };
  }
}

export const academyScheduleRepository = new AcademyScheduleRepository();