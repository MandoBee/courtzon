import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { AcademyGroupAttributes } from '../../domain/academy.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

class GroupRepository {
  async listByProgram(programId: number, filters?: { page?: number; limit?: number; status?: string; scopeWhere?: string; scopeParams?: number[] }) {
    const pool = getPool();
    const where: string[] = ['g.program_id = ?'];
    const params: any[] = [programId];

    if (filters?.status) { where.push('g.status = ?'); params.push(filters.status); }
    if (filters?.scopeWhere) { where.push(filters.scopeWhere); params.push(...(filters.scopeParams ?? [])); }

    const pag = buildPagination(filters?.page, filters?.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM academy_groups g JOIN academy_programs p ON p.id = g.program_id WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT g.*, u.full_name AS coach_name
       FROM academy_groups g
       JOIN academy_programs p ON p.id = g.program_id
       LEFT JOIN users u ON u.id = g.coach_id
       WHERE ${where.join(' AND ')}
       ORDER BY g.name ASC${paginationClause(pag)}`, params,
    );

    return { data: rows as (AcademyGroupAttributes & { coach_name?: string })[], total, page: pag.page, limit: pag.limit };
  }

  async listAll(filters?: { page?: number; limit?: number; status?: string; programId?: number; scopeWhere?: string; scopeParams?: number[] }) {
    const pool = getPool();
    const where: string[] = ['1 = 1'];
    const params: any[] = [];

    if (filters?.status) { where.push('g.status = ?'); params.push(filters.status); }
    if (filters?.programId) { where.push('g.program_id = ?'); params.push(filters.programId); }
    if (filters?.scopeWhere) { where.push(filters.scopeWhere); params.push(...(filters.scopeParams ?? [])); }

    const pag = buildPagination(filters?.page, filters?.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM academy_groups g JOIN academy_programs p ON p.id = g.program_id WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT g.*, u.full_name AS coach_name, p.name AS program_name
       FROM academy_groups g
       JOIN academy_programs p ON p.id = g.program_id
       LEFT JOIN users u ON u.id = g.coach_id
       WHERE ${where.join(' AND ')}
       ORDER BY g.name ASC${paginationClause(pag)}`, params,
    );

    return { data: rows, total, page: pag.page, limit: pag.limit };
  }

  async getById(id: number): Promise<any> {
    const [rows] = await getPool().query<RowData>(
      `SELECT g.*, p.name AS program_name
       FROM academy_groups g
       LEFT JOIN academy_programs p ON p.id = g.program_id
       WHERE g.id = ?`, [id],
    );
    return rows.length ? rows[0] : null;
  }

  async create(data: Partial<AcademyGroupAttributes>): Promise<number> {
    const [result] = await getPool().query<ResultSet>(
      `INSERT INTO academy_groups (program_id, name, coach_id, comp_type, comp_value, comp_currency, capacity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.program_id, data.name, data.coach_id ?? null, data.comp_type ?? null, data.comp_value ?? null,
       data.comp_currency ?? null, data.capacity ?? 0, data.status ?? 'active'],
    );
    return (result as any).insertId;
  }

  async update(id: number, data: Partial<AcademyGroupAttributes>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof AcademyGroupAttributes)[] = [
      'name', 'coach_id', 'capacity', 'status', 'comp_type', 'comp_value', 'comp_currency',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); params.push(data[f]); }
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE academy_groups SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async updateCoach(id: number, coachId: number | null): Promise<void> {
    await getPool().execute(
      'UPDATE academy_groups SET coach_id = ?, updated_at = NOW() WHERE id = ?', [coachId, id],
    );
  }

  /**
   * G1 — lock coach + compensation after Academy confirmation. Records actor +
   * timestamp; subsequent coach/compensation mutations are rejected.
   */
  async confirmLock(id: number, lockedBy: number): Promise<void> {
    await getPool().execute(
      'UPDATE academy_groups SET coach_locked_at = NOW(), coach_locked_by = ?, updated_at = NOW() WHERE id = ?',
      [lockedBy, id],
    );
  }

  async getEnrolledCount(groupId: number): Promise<number> {
    const [[row]] = await getPool().query<RowData>(
      "SELECT COUNT(*) AS c FROM academy_enrollments WHERE group_id = ? AND status IN ('confirmed','waiting')", [groupId],
    );
    return row.c;
  }

  async getMemberCount(groupId: number): Promise<number> {
    const [[row]] = await getPool().query<RowData>(
      "SELECT COUNT(*) AS c FROM academy_enrollments WHERE group_id = ? AND status = 'confirmed'", [groupId],
    );
    return row.c;
  }
}

export const groupRepository = new GroupRepository();
