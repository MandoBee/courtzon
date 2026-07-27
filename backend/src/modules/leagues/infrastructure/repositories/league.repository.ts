import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { LeagueAttributes, LeagueDashboard } from '../../domain/league.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

export class LeagueRepository {
  async list(filters: {
    page?: number; limit?: number; search?: string; status?: string;
    sport_id?: number; season_id?: number; is_public?: boolean;
  }): Promise<{ data: LeagueAttributes[]; total: number; page: number; limit: number }> {
    const pool = getPool();
    const where: string[] = ['1 = 1'];
    const params: any[] = [];

    if (filters.search) {
      where.push('(l.name LIKE ? OR l.code LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.status) { where.push('l.status = ?'); params.push(filters.status); }
    if (filters.sport_id) { where.push('l.sport_id = ?'); params.push(filters.sport_id); }
    if (filters.season_id) { where.push('l.season_id = ?'); params.push(filters.season_id); }
    if (filters.is_public !== undefined) { where.push('l.is_public = ?'); params.push(filters.is_public ? 1 : 0); }

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM leagues l WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT l.* FROM leagues l WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows as LeagueAttributes[], total, page: pag.page, limit: pag.limit };
  }

  async findById(id: number): Promise<LeagueAttributes | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM leagues WHERE id = ?', [id]);
    return rows.length ? (rows[0] as LeagueAttributes) : null;
  }

  async findByCode(code: string): Promise<LeagueAttributes | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM leagues WHERE code = ? LIMIT 1', [code]);
    return rows.length ? (rows[0] as LeagueAttributes) : null;
  }

  async create(data: Partial<LeagueAttributes>): Promise<number> {
    const sql = `INSERT INTO leagues (season_id, code, name, description, sport_id, format, max_teams, registration_fee, price_type, currency, status, is_public, points_per_win, points_per_draw)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.season_id, data.code, data.name, data.description ?? null,
      data.sport_id ?? null, data.format ?? 'round_robin',
      data.max_teams ?? 0, data.registration_fee ?? 0, data.price_type ?? 'FIXED',
      data.currency ?? 'USD', data.status ?? 'draft', data.is_public ?? 1,
      data.points_per_win ?? 3, data.points_per_draw ?? 1,
    ]);
    return (result as any).insertId;
  }

  async update(id: number, data: Partial<LeagueAttributes>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof LeagueAttributes)[] = [
      'code', 'name', 'description', 'sport_id', 'season_id', 'format', 'max_teams',
      'registration_fee', 'price_type', 'currency', 'is_public',
      'points_per_win', 'points_per_draw',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) {
        fields.push(`${f} = ?`);
        params.push(data[f] === true ? 1 : data[f] === false ? 0 : data[f]);
      }
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE leagues SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async updateStatus(id: number, status: string): Promise<void> {
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'archived') { extras.push('archived_at = NOW()'); }
    params.push(id);
    await getPool().query(
      `UPDATE leagues SET ${extras.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async deleteArchive(id: number): Promise<void> {
    await this.updateStatus(id, 'archived');
  }

  async getDashboard(): Promise<LeagueDashboard> {
    const pool = getPool();
    const [[totalL]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM leagues WHERE status != 'archived'");
    const [[openReg]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM leagues WHERE status IN ('registration_open','registration_closed')");
    const [[runL]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM leagues WHERE status = 'running'");
    const [[compL]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM leagues WHERE status = 'completed'");
    const [[totalTeams]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM league_teams");
    const [[totalM]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM league_matches");
    const [[compM]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM league_matches WHERE status = 'completed'");

    return {
      total_leagues: totalL.c,
      open_registrations: openReg.c,
      running_leagues: runL.c,
      completed_leagues: compL.c,
      total_teams: totalTeams.c,
      total_matches: totalM.c,
      completed_matches: compM.c,
    };
  }
}

export const leagueRepository = new LeagueRepository();
