import { getPool } from '../../../../database/mysql.js';
import type { LeagueDivisionAttributes, LeagueTeamAttributes, LeagueStandingAttributes } from '../../domain/league.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

export class DivisionRepository {
  async findByLeague(leagueId: number): Promise<LeagueDivisionAttributes[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM league_divisions WHERE league_id = ? ORDER BY tier ASC, name ASC',
      [leagueId],
    );
    return rows as LeagueDivisionAttributes[];
  }

  async findById(id: number): Promise<LeagueDivisionAttributes | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM league_divisions WHERE id = ?', [id]);
    return rows.length ? (rows[0] as LeagueDivisionAttributes) : null;
  }

  async create(data: Partial<LeagueDivisionAttributes>): Promise<number> {
    const sql = `INSERT INTO league_divisions (league_id, name, tier, capacity, advance_count, relegation_count, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.league_id, data.name, data.tier ?? 1, data.capacity ?? 0,
      data.advance_count ?? 0, data.relegation_count ?? 0, data.status ?? 'active',
    ]);
    return (result as any).insertId;
  }

  async update(id: number, data: Partial<LeagueDivisionAttributes>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof LeagueDivisionAttributes)[] = [
      'name', 'tier', 'capacity', 'advance_count', 'relegation_count', 'status',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); params.push(data[f]); }
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE league_divisions SET ${fields.join(', ')} WHERE id = ?`, params,
    );
  }

  async getTeamsWithStandings(divisionId: number): Promise<any[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT t.id AS team_id, t.team_name, s.position, s.points, s.played, s.wins, s.draws, s.losses,
              s.goals_for, s.goals_against, s.goal_difference
       FROM league_teams t
       LEFT JOIN league_standings s ON s.team_id = t.id AND s.division_id = ?
       WHERE t.division_id = ? AND t.status = 'confirmed'
       ORDER BY s.position ASC`,
      [divisionId, divisionId],
    );
    return rows;
  }
}

export const divisionRepository = new DivisionRepository();
