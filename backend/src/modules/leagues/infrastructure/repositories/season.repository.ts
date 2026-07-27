import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { SeasonAttributes } from '../../domain/league.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

export class SeasonRepository {
  async list(filters: {
    page?: number; limit?: number; search?: string; status?: string; sport_id?: number;
  }): Promise<{ data: SeasonAttributes[]; total: number; page: number; limit: number }> {
    const pool = getPool();
    const where: string[] = ['1 = 1'];
    const params: any[] = [];

    if (filters.search) {
      where.push('(s.name LIKE ? OR s.code LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.status) { where.push('s.status = ?'); params.push(filters.status); }
    if (filters.sport_id) { where.push('s.sport_id = ?'); params.push(filters.sport_id); }

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM seasons s WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT s.* FROM seasons s WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows as SeasonAttributes[], total, page: pag.page, limit: pag.limit };
  }

  async findById(id: number): Promise<SeasonAttributes | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM seasons WHERE id = ?', [id]);
    return rows.length ? (rows[0] as SeasonAttributes) : null;
  }

  async findByCode(code: string): Promise<SeasonAttributes | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM seasons WHERE code = ? LIMIT 1', [code]);
    return rows.length ? (rows[0] as SeasonAttributes) : null;
  }

  async create(data: Partial<SeasonAttributes>): Promise<number> {
    const sql = `INSERT INTO seasons (code, name, description, sport_id, start_date, end_date, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.code, data.name, data.description ?? null, data.sport_id ?? null,
      data.start_date, data.end_date ?? null, data.status ?? 'draft',
    ]);
    return (result as any).insertId;
  }

  async update(id: number, data: Partial<SeasonAttributes>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof SeasonAttributes)[] = [
      'code', 'name', 'description', 'sport_id', 'start_date', 'end_date',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); params.push(data[f]); }
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE seasons SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async updateStatus(id: number, status: string): Promise<void> {
    const params: any[] = [status, id];
    await getPool().query(
      'UPDATE seasons SET status = ?, updated_at = NOW() WHERE id = ?', params,
    );
  }
}

export const seasonRepository = new SeasonRepository();
