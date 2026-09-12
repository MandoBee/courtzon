import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { AcademyEnrollmentAttributes } from '../../domain/academy.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

class EnrollmentRepository {
  async list(filters: {
    page?: number; limit?: number; programId?: number; groupId?: number;
    playerId?: number; status?: string; scopeWhere?: string; scopeParams?: number[];
  }) {
    const pool = getPool();
    const where: string[] = ['1 = 1'];
    const params: any[] = [];

    if (filters.programId) { where.push('e.program_id = ?'); params.push(filters.programId); }
    if (filters.groupId) { where.push('e.group_id = ?'); params.push(filters.groupId); }
    if (filters.playerId) { where.push('e.player_id = ?'); params.push(filters.playerId); }
    if (filters.status) { where.push('e.status = ?'); params.push(filters.status); }
    if (filters.scopeWhere) { where.push(filters.scopeWhere); params.push(...(filters.scopeParams ?? [])); }

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM academy_enrollments e JOIN academy_programs p ON p.id = e.program_id WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT e.*, u.full_name AS player_name, p.name AS program_name, g.name AS group_name
       FROM academy_enrollments e
       JOIN academy_programs p ON p.id = e.program_id
       LEFT JOIN users u ON u.id = e.player_id
       LEFT JOIN academy_groups g ON g.id = e.group_id
       WHERE ${where.join(' AND ')}
       ORDER BY e.created_at DESC${paginationClause(pag)}`, params,
    );

    return { data: rows, total, page: pag.page, limit: pag.limit };
  }

  async getById(id: number, conn?: import('mysql2/promise').PoolConnection): Promise<AcademyEnrollmentAttributes | null> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>('SELECT * FROM academy_enrollments WHERE id = ?', [id]);
    return rows.length ? (rows[0] as AcademyEnrollmentAttributes) : null;
  }

  /** G4 — enrollment row FOR UPDATE (serialization point for promotion/replacement). */
  async getByIdForUpdate(id: number, conn: import('mysql2/promise').PoolConnection): Promise<AcademyEnrollmentAttributes | null> {
    const [rows] = await conn.query<RowData>(
      'SELECT * FROM academy_enrollments WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
    );
    return rows.length ? (rows[0] as AcademyEnrollmentAttributes) : null;
  }

  async getByPlayerAndProgram(playerId: number, programId: number, conn?: import('mysql2/promise').PoolConnection): Promise<AcademyEnrollmentAttributes | null> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      "SELECT * FROM academy_enrollments WHERE player_id = ? AND program_id = ? AND status IN ('pending','confirmed','waiting') LIMIT 1",
      [playerId, programId],
    );
    return rows.length ? (rows[0] as AcademyEnrollmentAttributes) : null;
  }

  async create(data: Partial<AcademyEnrollmentAttributes>, conn?: import('mysql2/promise').PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const sql = 'INSERT INTO academy_enrollments (player_id, program_id, group_id, membership_id, status, waiting_order) VALUES (?, ?, ?, ?, ?, ?)';
    const [result] = await db.query<ResultSet>(sql,
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

  async updateStatus(id: number, status: string, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'cancelled') { extras.push('cancelled_at = NOW()'); }
    if (status === 'completed') { extras.push('completed_at = NOW()'); }
    if (status === 'confirmed') { extras.push('waiting_order = NULL'); }
    params.push(id);
    await db.query(
      `UPDATE academy_enrollments SET ${extras.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async moveToGroup(id: number, groupId: number): Promise<void> {
    await getPool().execute(
      'UPDATE academy_enrollments SET group_id = ?, updated_at = NOW() WHERE id = ?', [groupId, id],
    );
  }

  async getNextWaitingOrder(programId: number, conn?: import('mysql2/promise').PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const [[row]] = await db.query<RowData>(
      'SELECT COALESCE(MAX(waiting_order), 0) + 1 AS next FROM academy_enrollments WHERE program_id = ? AND status = \'waiting\'',
      [programId],
    );
    return row.next;
  }

  async getConfirmedCount(programId: number, conn?: import('mysql2/promise').PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const [[row]] = await db.query<RowData>(
      "SELECT COUNT(*) AS c FROM academy_enrollments WHERE program_id = ? AND status = 'confirmed'", [programId],
    );
    return row.c;
  }

  /**
   * G3 — manual/offline payment acknowledgment. Records actor + timestamp; does
   * NOT create any wallet/ledger/settlement transactions (business decision).
   */
  async markPaymentConfirmed(id: number, confirmedBy: number, conn?: import('mysql2/promise').PoolConnection): Promise<boolean> {
    const db = conn ?? getPool();
    const [result] = await db.execute<ResultSet>(
      'UPDATE academy_enrollments SET payment_confirmed_at = NOW(), payment_confirmed_by = ?, updated_at = NOW() WHERE id = ?',
      [confirmedBy, id],
    );
    return (result as any).affectedRows > 0;
  }

  async getGroupConfirmedCount(groupId: number, conn?: import('mysql2/promise').PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const [[row]] = await db.query<RowData>(
      "SELECT COUNT(*) AS c FROM academy_enrollments WHERE group_id = ? AND status = 'confirmed'", [groupId],
    );
    return row.c;
  }

  /**
   * G4 — head of the waitlist for FIFO promotion (deterministic order, ties
   * broken by id). Returns null when there is no eligible waiting enrollment.
   */
  async getWaitlistHead(programId: number, conn?: import('mysql2/promise').PoolConnection): Promise<{ id: number; waiting_order: number | null } | null> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      `SELECT id, waiting_order FROM academy_enrollments
       WHERE program_id = ? AND status = 'waiting' AND waiting_order IS NOT NULL
       ORDER BY waiting_order ASC, id ASC
       LIMIT 1`,
      [programId],
    );
    return rows.length ? { id: Number((rows[0] as any).id), waiting_order: (rows[0] as any).waiting_order } : null;
  }

  /**
   * G5 — confirmed (accepted) player user-ids of a group. Used for session
   * roster notifications/reminders. Only `confirmed` enrollment is a roster
   * member per the Academy lifecycle.
   */
  async getConfirmedUserIdsByGroup(groupId: number, conn?: import('mysql2/promise').PoolConnection): Promise<number[]> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      "SELECT player_id FROM academy_enrollments WHERE group_id = ? AND status = 'confirmed'",
      [groupId],
    );
    return (rows as any[]).map((r) => Number(r.player_id));
  }

  /**
   * G4 — promote a waiting enrollment to confirmed, clearing its waitlist
   * position. Only affects the target row (no renumbering of remaining rows).
   */
  async promoteToConfirmed(id: number, conn?: import('mysql2/promise').PoolConnection): Promise<boolean> {
    const db = conn ?? getPool();
    const [result] = await db.query<ResultSet>(
      `UPDATE academy_enrollments
       SET status = 'confirmed', waiting_order = NULL, updated_at = NOW()
       WHERE id = ? AND status = 'waiting'`,
      [id],
    );
    return (result as any).affectedRows > 0;
  }

  async getHistory(enrollmentId: number): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.query<RowData>(
      `SELECT al.* FROM audit_logs al
       WHERE al.entity_type = 'academy_enrollment' AND al.entity_id = ?
       ORDER BY al.created_at DESC`, [enrollmentId],
    );
    return rows;
  }
}

export const enrollmentRepository = new EnrollmentRepository();
