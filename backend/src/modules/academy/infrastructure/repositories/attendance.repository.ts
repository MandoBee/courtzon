import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { AcademyAttendanceAttributes } from '../../domain/academy.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

class AttendanceRepository {
  /** Resolve a group session's owning group (used for object-level scope checks). */
  async getSessionGroupId(sessionId: number): Promise<number | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT group_id FROM academy_group_sessions WHERE id = ? LIMIT 1', [sessionId],
    );
    return rows.length ? Number((rows[0] as any).group_id) : null;
  }

  /** G5 — session row needed for the attendance window + group-membership checks. */
  async getSession(sessionId: number): Promise<{ id: number; group_id: number; status: string } | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT id, group_id, status FROM academy_group_sessions WHERE id = ? LIMIT 1', [sessionId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return { id: Number(r.id), group_id: Number(r.group_id), status: r.status };
  }

  /** Resolve an attendance record's group session id (used for object-level scope checks). */
  async getAttendanceSessionId(attendanceId: number): Promise<number | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT group_session_id FROM academy_attendance WHERE id = ? LIMIT 1', [attendanceId],
    );
    return rows.length ? Number((rows[0] as any).group_session_id) : null;
  }

  async list(filters: {
    page?: number; limit?: number; groupSessionId?: number; enrollmentId?: number;
    scopeWhere?: string; scopeParams?: number[];
  }) {
    const pool = getPool();
    const where: string[] = ['1 = 1'];
    const params: any[] = [];

    if (filters.groupSessionId) { where.push('a.group_session_id = ?'); params.push(filters.groupSessionId); }
    if (filters.enrollmentId) { where.push('a.enrollment_id = ?'); params.push(filters.enrollmentId); }
    if (filters.scopeWhere) { where.push(filters.scopeWhere); params.push(...(filters.scopeParams ?? [])); }

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM academy_attendance a
       JOIN academy_group_sessions gs ON gs.id = a.group_session_id
       JOIN academy_groups g ON g.id = gs.group_id
       JOIN academy_programs p ON p.id = g.program_id
       WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT a.*, u.full_name AS player_name, gs.session_date
       FROM academy_attendance a
       JOIN academy_group_sessions gs ON gs.id = a.group_session_id
       JOIN academy_groups g ON g.id = gs.group_id
       JOIN academy_programs p ON p.id = g.program_id
       JOIN academy_enrollments e ON e.id = a.enrollment_id
       JOIN users u ON u.id = e.player_id
       WHERE ${where.join(' AND ')}
       ORDER BY gs.session_date DESC, a.created_at DESC${paginationClause(pag)}`, params,
    );

    return { data: rows, total, page: pag.page, limit: pag.limit };
  }

  async getBySessionAndEnrollment(sessionId: number, enrollmentId: number): Promise<AcademyAttendanceAttributes | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM academy_attendance WHERE group_session_id = ? AND enrollment_id = ?',
      [sessionId, enrollmentId],
    );
    return rows.length ? (rows[0] as AcademyAttendanceAttributes) : null;
  }

  async create(data: Partial<AcademyAttendanceAttributes>): Promise<number> {
    const [result] = await getPool().query<ResultSet>(
      'INSERT INTO academy_attendance (group_session_id, enrollment_id, attendance_status, notes) VALUES (?, ?, ?, ?)',
      [data.group_session_id, data.enrollment_id, data.attendance_status ?? 'present', data.notes ?? null],
    );
    return (result as any).insertId;
  }

  async update(id: number, data: Partial<AcademyAttendanceAttributes>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    if (data.attendance_status !== undefined) { fields.push('attendance_status = ?'); params.push(data.attendance_status); }
    if (data.notes !== undefined) { fields.push('notes = ?'); params.push(data.notes); }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE academy_attendance SET ${fields.join(', ')} WHERE id = ?`, params,
    );
  }

  async getBySession(sessionId: number): Promise<any[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT a.*, u.full_name AS player_name, e.player_id
       FROM academy_attendance a
       JOIN academy_enrollments e ON e.id = a.enrollment_id
       JOIN users u ON u.id = e.player_id
       WHERE a.group_session_id = ?
       ORDER BY u.full_name ASC`, [sessionId],
    );
    return rows;
  }

  async getAttendanceSummary(groupSessionId: number): Promise<{ present: number; absent: number; excused: number; late: number }> {
    const [[row]] = await getPool().query<RowData>(
      `SELECT
        COALESCE(SUM(attendance_status = 'present'), 0) AS present,
        COALESCE(SUM(attendance_status = 'absent'), 0) AS absent,
        COALESCE(SUM(attendance_status = 'excused'), 0) AS excused,
        COALESCE(SUM(attendance_status = 'late'), 0) AS late
       FROM academy_attendance WHERE group_session_id = ?`, [groupSessionId],
    );
    return {
      present: Number(row.present),
      absent: Number(row.absent),
      excused: Number(row.excused),
      late: Number(row.late),
    };
  }

  /**
   * G5 — per-session roster: confirmed enrollments of the session's group with
   * their attendance state for this session (if marked). Cross-group enrollments
   * are excluded by construction (join on the session's group).
   */
  async getSessionRoster(sessionId: number): Promise<any[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT
         e.id AS enrollment_id,
         e.player_id,
         e.status AS enrollment_status,
         e.waiting_order,
         u.full_name AS player_name,
         a.id AS attendance_id,
         a.attendance_status,
         a.notes,
         a.created_at AS attendance_at
       FROM academy_group_sessions gs
       JOIN academy_enrollments e ON e.group_id = gs.group_id
       JOIN users u ON u.id = e.player_id
       LEFT JOIN academy_attendance a ON a.group_session_id = gs.id AND a.enrollment_id = e.id
       WHERE gs.id = ? AND e.status = 'confirmed'
       ORDER BY u.full_name ASC`, [sessionId],
    );
    return rows;
  }

  /** G5 — count of confirmed roster members for a session's group (unmarked basis). */
  async getSessionRosterCount(sessionId: number): Promise<number> {
    const [[row]] = await getPool().query<RowData>(
      `SELECT COUNT(*) AS c
       FROM academy_group_sessions gs
       JOIN academy_enrollments e ON e.group_id = gs.group_id
       WHERE gs.id = ? AND e.status = 'confirmed'`, [sessionId],
    );
    return Number(row.c);
  }

  /** G5 — load an attendance record with its owning session (status + group). */
  async getByIdWithSession(attendanceId: number): Promise<{ attendance: any; session: any } | null> {
    const [rows] = await getPool().query<RowData>(
      `SELECT a.*, s.status AS session_status, s.group_id AS session_group_id
       FROM academy_attendance a
       JOIN academy_group_sessions s ON s.id = a.group_session_id
       WHERE a.id = ? LIMIT 1`, [attendanceId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      attendance: r,
      session: { status: r.session_status, group_id: Number(r.session_group_id) },
    };
  }
}

export const attendanceRepository = new AttendanceRepository();
