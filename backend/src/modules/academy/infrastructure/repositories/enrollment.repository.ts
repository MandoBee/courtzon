import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { AcademyEnrollmentAttributes } from '../../domain/academy.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

class EnrollmentRepository {
  async list(filters: {
    page?: number; limit?: number; programId?: number; groupId?: number;
    playerId?: number; status?: string;
  }) {
    const pool = getPool();
    const where: string[] = ['1 = 1'];
    const params: any[] = [];

    if (filters.programId) { where.push('e.program_id = ?'); params.push(filters.programId); }
    if (filters.groupId) { where.push('e.group_id = ?'); params.push(filters.groupId); }
    if (filters.playerId) { where.push('e.player_id = ?'); params.push(filters.playerId); }
    if (filters.status) { where.push('e.status = ?'); params.push(filters.status); }

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM academy_enrollments e WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT e.*, u.full_name AS player_name, p.name AS program_name, g.name AS group_name
       FROM academy_enrollments e
       LEFT JOIN users u ON u.id = e.player_id
       LEFT JOIN academy_programs p ON p.id = e.program_id
       LEFT JOIN academy_groups g ON g.id = e.group_id
       WHERE ${where.join(' AND ')}
       ORDER BY e.created_at DESC${paginationClause(pag)}`, params,
    );

    return { data: rows, total, page: pag.page, limit: pag.limit };
  }

  async getById(id: number): Promise<AcademyEnrollmentAttributes | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM academy_enrollments WHERE id = ?', [id]);
    return rows.length ? (rows[0] as AcademyEnrollmentAttributes) : null;
  }

  async getByPlayerAndProgram(playerId: number, programId: number): Promise<AcademyEnrollmentAttributes | null> {
    const [rows] = await getPool().query<RowData>(
      "SELECT * FROM academy_enrollments WHERE player_id = ? AND program_id = ? AND status IN ('pending','confirmed','waiting') LIMIT 1",
      [playerId, programId],
    );
    return rows.length ? (rows[0] as AcademyEnrollmentAttributes) : null;
  }

  async create(data: Partial<AcademyEnrollmentAttributes>): Promise<number> {
    const sql = 'INSERT INTO academy_enrollments (player_id, program_id, group_id, membership_id, status, waiting_order) VALUES (?, ?, ?, ?, ?, ?)';
    const [result] = await getPool().query<ResultSet>(sql,
      [data.player_id, data.program_id, data.group_id ?? null, data.membership_id ?? null,
       data.status ?? 'pending', data.waiting_order ?? null],
    );
    return (result as any).insertId;
  }

  async update(id: number, data: Partial<AcademyEnrollmentAttributes>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof AcademyEnrollmentAttributes)[] = ['group_id', 'status', 'waiting_order', 'cancelled_at', 'completed_at'];
    for (const f of updatable) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); params.push(data[f]); }
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE academy_enrollments SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async updateStatus(id: number, status: string): Promise<void> {
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'cancelled') { extras.push('cancelled_at = NOW()'); }
    if (status === 'completed') { extras.push('completed_at = NOW()'); }
    params.push(id);
    await getPool().query(
      `UPDATE academy_enrollments SET ${extras.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async moveToGroup(id: number, groupId: number): Promise<void> {
    await getPool().execute(
      'UPDATE academy_enrollments SET group_id = ?, updated_at = NOW() WHERE id = ?', [groupId, id],
    );
  }

  async getNextWaitingOrder(programId: number): Promise<number> {
    const [[row]] = await getPool().query<RowData>(
      'SELECT COALESCE(MAX(waiting_order), 0) + 1 AS next FROM academy_enrollments WHERE program_id = ? AND status = \'waiting\'',
      [programId],
    );
    return row.next;
  }

  async getConfirmedCount(programId: number): Promise<number> {
    const [[row]] = await getPool().query<RowData>(
      "SELECT COUNT(*) AS c FROM academy_enrollments WHERE program_id = ? AND status = 'confirmed'", [programId],
    );
    return row.c;
  }

  async getGroupConfirmedCount(groupId: number): Promise<number> {
    const [[row]] = await getPool().query<RowData>(
      "SELECT COUNT(*) AS c FROM academy_enrollments WHERE group_id = ? AND status = 'confirmed'", [groupId],
    );
    return row.c;
  }

  async getHistory(enrollmentId: number): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.query<RowData>(
      `SELECT al.* FROM audit_log al
       WHERE al.entity_type = 'academy_enrollment' AND al.entity_id = ?
       ORDER BY al.created_at DESC`, [enrollmentId],
    );
    return rows;
  }
}

export const enrollmentRepository = new EnrollmentRepository();
