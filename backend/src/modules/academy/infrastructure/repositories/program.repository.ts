import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { AcademyProgramAttributes } from '../../domain/academy.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

class ProgramRepository {
  async list(filters: {
    page?: number; limit?: number; search?: string; category?: string; status?: string; is_public?: boolean;
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
    if (where.length === 0) where.push('1 = 1');

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM academy_programs p WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT p.* FROM academy_programs p WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows as AcademyProgramAttributes[], total, page: pag.page, limit: pag.limit };
  }

  async getById(id: number): Promise<AcademyProgramAttributes | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM academy_programs WHERE id = ?', [id],
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
    const sql = 'INSERT INTO academy_programs (code, name, description, category, level, season, capacity, price, currency, price_type, status, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const [result] = await getPool().query<ResultSet>(sql,
      [data.code, data.name, data.description ?? null, data.category, data.level ?? null, data.season ?? null,
       data.capacity ?? 0, data.price ?? 0, data.currency ?? 'USD', data.price_type ?? 'FIXED',
       data.status ?? 'draft', data.is_public ?? true],
    );
    return (result as any).insertId;
  }

  async update(id: number, data: Partial<AcademyProgramAttributes>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof AcademyProgramAttributes)[] = [
      'code', 'name', 'description', 'category', 'level', 'season',
      'capacity', 'price', 'currency', 'price_type', 'status', 'is_public',
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

  async updateStatus(id: number, status: string): Promise<void> {
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'archived') { extras.push('archived_at = NOW()'); }
    params.push(id);
    await getPool().query(
      `UPDATE academy_programs SET ${extras.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async getCategories(): Promise<string[]> {
    const [rows] = await getPool().execute<RowData>(
      'SELECT DISTINCT category FROM academy_programs WHERE status != \'archived\' ORDER BY category',
    );
    return rows.map((r: any) => r.category);
  }

  async getDashboard(): Promise<{
    total_programs: number; published_programs: number; running_programs: number;
    total_groups: number; total_players: number; waiting_list_count: number;
    capacity_sum: number; enrolled_sum: number;
    attendance_summary: { present: number; absent: number; excused: number; late: number };
  }> {
    const pool = getPool();
    const [[progCount]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM academy_programs WHERE status != 'archived'");
    const [[pubCount]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM academy_programs WHERE status IN ('published','open','running')");
    const [[runCount]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM academy_programs WHERE status = 'running'");
    const [[grpCount]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM academy_groups WHERE status = 'active'");
    const [[plyrCount]] = await pool.execute<RowData>("SELECT COUNT(DISTINCT player_id) AS c FROM academy_enrollments WHERE status IN ('confirmed','waiting')");
    const [[waitCount]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM academy_enrollments WHERE status = 'waiting'");
    const [[capSum]] = await pool.execute<RowData>("SELECT COALESCE(SUM(capacity), 0) AS c FROM academy_programs WHERE status IN ('open','full','running')");
    const [[enrSum]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM academy_enrollments WHERE status IN ('confirmed','waiting')");
    const [[attSum]] = await pool.execute<RowData>(
      "SELECT COALESCE(SUM(attendance_status = 'present'), 0) AS present, COALESCE(SUM(attendance_status = 'absent'), 0) AS absent, COALESCE(SUM(attendance_status = 'excused'), 0) AS excused, COALESCE(SUM(attendance_status = 'late'), 0) AS late FROM academy_attendance",
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
