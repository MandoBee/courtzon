import { getPool } from '../../../../database/mysql.js';
import type { LeagueMatchAttributes, LeagueResultAttributes } from '../../domain/league.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

export class FixtureRepository {
  async createMatch(data: Partial<LeagueMatchAttributes>): Promise<number> {
    const sql = `INSERT INTO league_matches (division_id, home_team_id, away_team_id, round, match_date, start_time, end_time, court_id, referee_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.division_id, data.home_team_id, data.away_team_id, data.round,
      data.match_date ?? null, data.start_time ?? null, data.end_time ?? null,
      data.court_id ?? null, data.referee_id ?? null, data.status ?? 'scheduled',
    ]);
    return (result as any).insertId;
  }

  async findMatchesByDivision(divisionId: number): Promise<LeagueMatchAttributes[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM league_matches WHERE division_id = ? ORDER BY round, id',
      [divisionId],
    );
    return rows as LeagueMatchAttributes[];
  }

  async findMatchById(id: number): Promise<LeagueMatchAttributes | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM league_matches WHERE id = ?', [id]);
    return rows.length ? (rows[0] as LeagueMatchAttributes) : null;
  }

  async updateMatch(id: number, data: Partial<LeagueMatchAttributes>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof LeagueMatchAttributes)[] = [
      'home_team_id', 'away_team_id', 'round', 'match_date',
      'start_time', 'end_time', 'court_id', 'referee_id', 'status',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); params.push(data[f]); }
    }
    if (!fields.length) return;
    fields.push('updated_at = NOW()');
    params.push(id);
    await getPool().query(
      `UPDATE league_matches SET ${fields.join(', ')} WHERE id = ?`, params,
    );
  }

  async updateMatchStatus(id: number, status: string): Promise<void> {
    await getPool().query(
      `UPDATE league_matches SET status = ?,
       updated_at = NOW()
       WHERE id = ?`,
      [status, id],
    );
  }

  async assignCourt(matchId: number, courtId: number): Promise<void> {
    await getPool().query(
      'UPDATE league_matches SET court_id = ?, updated_at = NOW() WHERE id = ?',
      [courtId, matchId],
    );
  }

  async assignReferee(matchId: number, refereeId: number): Promise<void> {
    await getPool().query(
      'UPDATE league_matches SET referee_id = ?, updated_at = NOW() WHERE id = ?',
      [refereeId, matchId],
    );
  }

  async createResult(data: Partial<LeagueResultAttributes>): Promise<number> {
    const sql = `INSERT INTO league_results (match_id, home_score, away_score, winner_team_id, result_status, entered_by)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 home_score = VALUES(home_score), away_score = VALUES(away_score),
                 winner_team_id = VALUES(winner_team_id), result_status = VALUES(result_status),
                 entered_by = VALUES(entered_by)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.match_id, data.home_score ?? null, data.away_score ?? null,
      data.winner_team_id ?? null, data.result_status ?? 'submitted', data.entered_by,
    ]);
    return (result as any).insertId;
  }

  async getResult(matchId: number): Promise<LeagueResultAttributes | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM league_results WHERE match_id = ? ORDER BY created_at DESC LIMIT 1',
      [matchId],
    );
    return rows.length ? (rows[0] as LeagueResultAttributes) : null;
  }

  async findMatchesByRound(divisionId: number, round: number): Promise<LeagueMatchAttributes[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM league_matches WHERE division_id = ? AND round = ? ORDER BY id',
      [divisionId, round],
    );
    return rows as LeagueMatchAttributes[];
  }
}

export const fixtureRepository = new FixtureRepository();
