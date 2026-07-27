import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { AcademyAttendanceAttributes } from '../../domain/academy.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

class AttendanceRepository {
  async list(filters: {
    page?: number; limit?: number; groupSessionId?: number; enrollmentId?: number;
  }) {
    const pool = getPool();
    const where: string[] = ['1 = 1'];
    const params: any[] = [];

    if (filters.groupSessionId) { where.push('a.group_session_id = ?'); params.push(filters.groupSessionId); }
    if (filters.enrollmentId) { where.push('a.enrollment_id = ?'); params.push(filters.enrollmentId); }

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM academy_attendance a WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT a.*, u.full_name AS player_name, gs.session_date
       FROM academy_attendance a
       JOIN academy_group_sessions gs ON gs.id = a.group_session_id
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
    return { present: row.present, absent: row.absent, excused: row.excused, late: row.late };
  }
}

export const attendanceRepository = new AttendanceRepository();
