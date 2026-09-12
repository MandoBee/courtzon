// ============================================================================
// Academy G5 — session execution repository
//
// Manual (G1) session create/update/list plus the lifecycle state-machine
// mutations. Replaces the raw inline SQL that previously lived in the
// presentation controller, and adds conditional status transitions for
// concurrency-safe start/complete/cancel.
// ============================================================================
import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];
type ResultSet = mysql.ResultSetHeader;

export interface SessionCreateInput {
  group_id: number;
  session_date: string;
  start_time?: string | null;
  end_time?: string | null;
  court_id?: number | null;
  coach_id?: number | null;
}

export interface SessionUpdateInput {
  session_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  court_id?: number | null;
  coach_id?: number | null;
}

export interface SessionListFilters {
  page?: number;
  limit?: number;
  groupId?: number;
  status?: string;
  scopeWhere?: string;
  scopeParams?: number[];
}

class SessionRepository {
  async list(filters: SessionListFilters) {
    const pool = getPool();
    const whereSql: string[] = ['1 = 1'];
    const params: any[] = [];
    if (filters.groupId) { whereSql.push('s.group_id = ?'); params.push(filters.groupId); }
    if (filters.status) { whereSql.push('s.status = ?'); params.push(filters.status); }
    if (filters.scopeWhere) { whereSql.push(filters.scopeWhere); params.push(...(filters.scopeParams ?? [])); }

    const pag = buildPagination(filters.page, filters.limit);
    const clause = paginationClause(pag);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM academy_group_sessions s
       JOIN academy_groups g ON g.id = s.group_id
       JOIN academy_programs p ON p.id = g.program_id
       WHERE ${whereSql.join(' AND ')}`, params,
    );
    const [rows] = await pool.query<RowData>(
      `SELECT s.*, g.name AS group_name, r.name AS court_name, u.full_name AS coach_name
       FROM academy_group_sessions s
       JOIN academy_groups g ON g.id = s.group_id
       JOIN academy_programs p ON p.id = g.program_id
       LEFT JOIN resources r ON r.id = s.court_id
       LEFT JOIN users u ON u.id = s.coach_id
       WHERE ${whereSql.join(' AND ')}
       ORDER BY s.session_date DESC, s.start_time ASC${clause}`, params,
    );
    return { data: rows, total: countRows[0]?.total ?? 0, page: pag.page, limit: pag.limit };
  }

  /** G1 — manual session creation (always starts `scheduled`). */
  async createManual(input: SessionCreateInput): Promise<number> {
    const [result] = await getPool().execute<ResultSet>(
      `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, court_id, coach_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
      [input.group_id, input.session_date, input.start_time ?? null, input.end_time ?? null,
       input.court_id ?? null, input.coach_id ?? null],
    );
    return result.insertId;
  }

  /** G1 — bounded manual session update (never mutates `status`; lifecycle ops own it). */
  async update(id: number, fields: SessionUpdateInput): Promise<void> {
    const set: string[] = [];
    const params: any[] = [];
    const allowed: Record<string, unknown> = {
      session_date: fields.session_date,
      start_time: fields.start_time,
      end_time: fields.end_time,
      court_id: fields.court_id,
      coach_id: fields.coach_id,
    };
    for (const [col, val] of Object.entries(allowed)) {
      if (val !== undefined) { set.push(`${col} = ?`); params.push(val); }
    }
    if (!set.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE academy_group_sessions SET ${set.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  /** Session row with display joins (group/court/coach/program). */
  async getById(id: number): Promise<any | null> {
    const [rows] = await getPool().query<RowData>(
      `SELECT s.*, g.name AS group_name, g.program_id, r.name AS court_name, u.full_name AS coach_name
       FROM academy_group_sessions s
       JOIN academy_groups g ON g.id = s.group_id
       LEFT JOIN resources r ON r.id = s.court_id
       LEFT JOIN users u ON u.id = s.coach_id
       WHERE s.id = ? LIMIT 1`, [id],
    );
    return rows.length ? rows[0] : null;
  }

  /** Session row FOR UPDATE (lifecycle serialization point). */
  async getByIdForUpdate(id: number, conn: mysql.PoolConnection): Promise<any | null> {
    const [rows] = await conn.query<RowData>(
      `SELECT s.*, g.name AS group_name, g.program_id, r.name AS court_name, u.full_name AS coach_name
       FROM academy_group_sessions s
       JOIN academy_groups g ON g.id = s.group_id
       LEFT JOIN resources r ON r.id = s.court_id
       LEFT JOIN users u ON u.id = s.coach_id
       WHERE s.id = ? LIMIT 1 FOR UPDATE`, [id],
    );
    return rows.length ? rows[0] : null;
  }

  /**
   * G5 — conditional status transition. Only succeeds if the row is currently in
   * one of `fromStates`; concurrent lifecycle calls therefore yield exactly one
   * winner. Returns true on success.
   */
  async updateStatusConditional(
    id: number,
    fromStates: string[],
    to: string,
    conn?: mysql.PoolConnection,
  ): Promise<boolean> {
    const db = conn ?? getPool();
    const placeholders = fromStates.map(() => '?').join(',');
    const [result] = await db.query<ResultSet>(
      `UPDATE academy_group_sessions
       SET status = ?, updated_at = NOW()
       WHERE id = ? AND status IN (${placeholders})`,
      [to, id, ...fromStates],
    );
    return (result as any).affectedRows > 0;
  }
}

export const sessionRepository = new SessionRepository();