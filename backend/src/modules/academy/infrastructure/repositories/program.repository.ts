import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { AcademyProgramAttributes } from '../../domain/academy.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

class ProgramRepository {
  async list(filters: {
    page?: number; limit?: number; search?: string; category?: string; status?: string; is_public?: boolean;
    organisationId?: number; branchId?: number; organisationIds?: number[];
    scopeWhere?: string; scopeParams?: number[];
  }) {
    const pool = getPool();
    const where: string[] = [];
    const params: any[] = [];

    if (filters.search) {
      where.push('(p.name LIKE ? OR p.code LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.category) { where.push('p.category = ?'); params.push(filters.category); }
    if (filters.status) { where.push('p.status = ?'); params.push(filters.status); }
    if (filters.is_public !== undefined) { where.push('p.is_public = ?'); params.push(filters.is_public); }
    if (filters.organisationId) { where.push('p.organisation_id = ?'); params.push(filters.organisationId); }
    if (filters.branchId) { where.push('p.branch_id = ?'); params.push(filters.branchId); }
    if (filters.organisationIds?.length) {
      where.push(`p.organisation_id IN (${filters.organisationIds.map(() => '?').join(',')})`);
      params.push(...filters.organisationIds);
    }
    if (filters.scopeWhere) {
      where.push(filters.scopeWhere);
      params.push(...(filters.scopeParams ?? []));
    }
    if (where.length === 0) where.push('1 = 1');

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM academy_programs p WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT p.*, o.name AS organisation_name, b.name AS branch_name, s.name AS sport_name
       FROM academy_programs p
       LEFT JOIN organisations o ON o.id = p.organisation_id
       LEFT JOIN branches b ON b.id = p.branch_id
       LEFT JOIN sports s ON s.id = p.sport_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows as AcademyProgramAttributes[], total, page: pag.page, limit: pag.limit };
  }

  async getById(id: number): Promise<AcademyProgramAttributes | null> {
    const [rows] = await getPool().query<RowData>(
      `SELECT p.*, o.name AS organisation_name, b.name AS branch_name, s.name AS sport_name
       FROM academy_programs p
       LEFT JOIN organisations o ON o.id = p.organisation_id
       LEFT JOIN branches b ON b.id = p.branch_id
       LEFT JOIN sports s ON s.id = p.sport_id
       WHERE p.id = ?`, [id],
    );
    return rows.length ? (rows[0] as AcademyProgramAttributes) : null;
  }

  async getByCode(code: string): Promise<AcademyProgramAttributes | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM academy_programs WHERE code = ? LIMIT 1', [code],
    );
    return rows.length ? (rows[0] as AcademyProgramAttributes) : null;
  }

  async create(data: Partial<AcademyProgramAttributes>): Promise<number> {
    const sql = 'INSERT INTO academy_programs (code, name, description, category, level, season, capacity, original_capacity, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const [result] = await getPool().query<ResultSet>(sql,
      [data.code, data.name, data.description ?? null, data.category, data.level ?? null, data.season ?? null,
       data.capacity ?? 0, data.original_capacity ?? data.capacity ?? 0, data.price ?? 0, data.currency ?? 'USD',
       data.price_type ?? 'FIXED', data.status ?? 'draft', data.is_public ?? true,
       data.organisation_id ?? null, data.branch_id ?? null, data.sport_id ?? null],
    );
    return (result as any).insertId;
  }

  async update(id: number, data: Partial<AcademyProgramAttributes>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof AcademyProgramAttributes)[] = [
      'code', 'name', 'description', 'category', 'level', 'season',
      'capacity', 'original_capacity', 'price', 'currency', 'price_type', 'status', 'is_public',
      'organisation_id', 'branch_id', 'sport_id',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); params.push(data[f]); }
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE academy_programs SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  /**
   * G1 — foundational confirmation: SETUP → CONFIRMED. Records actor + timestamp.
   * (This is not the later financial/court confirmation workflow.)
   */
  async confirm(id: number, confirmedBy: number, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    await db.query<ResultSet>(
      `UPDATE academy_programs
       SET lifecycle_state = 'confirmed', confirmed_at = NOW(), confirmed_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [confirmedBy, id],
    );
  }

  /** G3 — program row FOR UPDATE inside the confirmation transaction. */
  async getByIdForUpdate(id: number, conn: import('mysql2/promise').PoolConnection): Promise<AcademyProgramAttributes | null> {
    const [rows] = await conn.query<RowData>(
      `SELECT p.*, o.name AS organisation_name, b.name AS branch_name, s.name AS sport_name
       FROM academy_programs p
       LEFT JOIN organisations o ON o.id = p.organisation_id
       LEFT JOIN branches b ON b.id = p.branch_id
       LEFT JOIN sports s ON s.id = p.sport_id
       WHERE p.id = ?
       LIMIT 1
       FOR UPDATE`, [id],
    );
    return rows.length ? (rows[0] as AcademyProgramAttributes) : null;
  }

  /**
   * G4 — program row FOR UPDATE WITHOUT ownership joins. The aggregate
   * serialization point for enrollment/promotion capacity decisions.
   */
  async getCapacityForUpdate(id: number, conn: import('mysql2/promise').PoolConnection): Promise<AcademyProgramAttributes | null> {
    const [rows] = await conn.query<RowData>(
      'SELECT * FROM academy_programs WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
    );
    return rows.length ? (rows[0] as AcademyProgramAttributes) : null;
  }

  /** G4 — create or extend the temporary capacity override. original_capacity is untouched. */
  async setCapacityOverride(id: number, data: {
    amount: number;
    until: string | null;
    by: number;
    reason: string;
  }, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    await db.query(
      `UPDATE academy_programs
       SET capacity_override_amount = ?, capacity_override_until = ?, capacity_override_by = ?, capacity_override_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      [data.amount, data.until, data.by, data.reason, id],
    );
  }

  /** G4 — remove the capacity override (non-retroactive). original_capacity is untouched. */
  async clearCapacityOverride(id: number, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    await db.query(
      `UPDATE academy_programs
       SET capacity_override_amount = NULL, capacity_override_until = NULL, capacity_override_by = NULL, capacity_override_reason = NULL, updated_at = NOW()
       WHERE id = ?`,
      [id],
    );
  }

  async updateStatus(id: number, status: string): Promise<void> {
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'archived') { extras.push('archived_at = NOW()'); }
    params.push(id);
    await getPool().query(
      `UPDATE academy_programs SET ${extras.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async getCategories(scope: { orgIds?: number[]; branchIds?: number[] } = {}): Promise<string[]> {
  const pool = getPool();
  const where: string[] = ["p.status != 'archived'"];
  const params: any[] = [];
  if (scope.orgIds?.length) { where.push(`p.organisation_id IN (${scope.orgIds.map(() => '?').join(',')})`); params.push(...scope.orgIds); }
  if (scope.branchIds?.length) { where.push(`p.branch_id IN (${scope.branchIds.map(() => '?').join(',')})`); params.push(...scope.branchIds); }
  const [rows] = await pool.execute<RowData>(
    `SELECT DISTINCT p.category FROM academy_programs p WHERE ${where.join(' AND ')} ORDER BY p.category`,
    params,
  );
  return rows.map((r: any) => r.category);
  }

  async getDashboard(scope: { orgIds?: number[]; branchIds?: number[] } = {}): Promise<{
    total_programs: number; published_programs: number; running_programs: number;
    total_groups: number; total_players: number; waiting_list_count: number;
    capacity_sum: number; enrolled_sum: number;
    attendance_summary: { present: number; absent: number; excused: number; late: number };
  }> {
    const pool = getPool();
    const pScope: string[] = [];
    const pParams: any[] = [];
    if (scope.orgIds?.length) { pScope.push(`p.organisation_id IN (${scope.orgIds.map(() => '?').join(',')})`); pParams.push(...scope.orgIds); }
    if (scope.branchIds?.length) { pScope.push(`p.branch_id IN (${scope.branchIds.map(() => '?').join(',')})`); pParams.push(...scope.branchIds); }
    const progWhere = pScope.length ? `WHERE ${pScope.join(' AND ')}` : '';

    const [[progCount]] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM academy_programs p ${progWhere ? progWhere + ' AND ' : 'WHERE '}p.status != 'archived'`,
      [...pParams],
    );
    const [[pubCount]] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM academy_programs p ${progWhere ? 'WHERE ' + pScope.join(' AND ') + ' AND ' : 'WHERE '}p.status IN ('published','open','running')`,
      [...pParams],
    );
    const [[runCount]] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM academy_programs p ${progWhere ? 'WHERE ' + pScope.join(' AND ') + ' AND ' : 'WHERE '}p.status = 'running'`,
      [...pParams],
    );
    const [[grpCount]] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM academy_groups g JOIN academy_programs p ON p.id = g.program_id ${progWhere ? 'WHERE ' + pScope.join(' AND ') + ' AND ' : 'WHERE '}g.status = 'active'`,
      [...pParams],
    );
    const [[plyrCount]] = await pool.execute<RowData>(
      `SELECT COUNT(DISTINCT e.player_id) AS c FROM academy_enrollments e JOIN academy_programs p ON p.id = e.program_id ${progWhere ? 'WHERE ' + pScope.join(' AND ') + ' AND ' : 'WHERE '}e.status IN ('confirmed','waiting')`,
      [...pParams],
    );
    const [[waitCount]] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM academy_enrollments e JOIN academy_programs p ON p.id = e.program_id ${progWhere ? 'WHERE ' + pScope.join(' AND ') + ' AND ' : 'WHERE '}e.status = 'waiting'`,
      [...pParams],
    );
    const [[capSum]] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(p.capacity), 0) AS c FROM academy_programs p ${progWhere ? 'WHERE ' + pScope.join(' AND ') + ' AND ' : 'WHERE '}p.status IN ('open','full','running')`,
      [...pParams],
    );
    const [[enrSum]] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM academy_enrollments e JOIN academy_programs p ON p.id = e.program_id ${progWhere ? 'WHERE ' + pScope.join(' AND ') + ' AND ' : 'WHERE '}e.status IN ('confirmed','waiting')`,
      [...pParams],
    );
    const [[attSum]] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(a.attendance_status = 'present'), 0) AS present,
              COALESCE(SUM(a.attendance_status = 'absent'), 0) AS absent,
              COALESCE(SUM(a.attendance_status = 'excused'), 0) AS excused,
              COALESCE(SUM(a.attendance_status = 'late'), 0) AS late
       FROM academy_attendance a
       JOIN academy_group_sessions gs ON gs.id = a.group_session_id
       JOIN academy_groups g ON g.id = gs.group_id
       JOIN academy_programs p ON p.id = g.program_id
       ${progWhere ? 'WHERE ' + pScope.join(' AND ') : ''}`,
      [...pParams],
    );

    return {
      total_programs: progCount.c, published_programs: pubCount.c, running_programs: runCount.c,
      total_groups: grpCount.c, total_players: plyrCount.c, waiting_list_count: waitCount.c,
      capacity_sum: capSum.c, enrolled_sum: enrSum.c,
      attendance_summary: { present: attSum.present, absent: attSum.absent, excused: attSum.excused, late: attSum.late },
    };
  }
}

export const programRepository = new ProgramRepository();
