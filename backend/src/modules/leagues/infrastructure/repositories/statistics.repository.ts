import { getPool } from '../../../../database/mysql.js';
import type { PlayerStatAttributes, TeamStatAttributes } from '../../domain/league.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

export class StatisticsRepository {
  async getPlayerStats(filters: {
    season_id?: number; player_id?: number; team_id?: number; division_id?: number;
  }): Promise<PlayerStatAttributes[]> {
    const where: string[] = ['1 = 1'];
    const params: any[] = [];
    if (filters.season_id) { where.push('ps.season_id = ?'); params.push(filters.season_id); }
    if (filters.player_id) { where.push('ps.player_id = ?'); params.push(filters.player_id); }
    if (filters.team_id) { where.push('ps.team_id = ?'); params.push(filters.team_id); }
    if (filters.division_id) { where.push('ps.division_id = ?'); params.push(filters.division_id); }

    const [rows] = await getPool().query<RowData>(
      `SELECT ps.* FROM player_statistics ps WHERE ${where.join(' AND ')} ORDER BY ps.appearances DESC`,
      params,
    );
    return rows as PlayerStatAttributes[];
  }

  async upsertPlayerStat(data: Partial<PlayerStatAttributes>): Promise<void> {
    await getPool().query(
      `INSERT INTO player_statistics (season_id, player_id, team_id, division_id, appearances, goals, assists, clean_sheets, yellow_cards, red_cards, minutes_played, rating, stats_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       appearances = VALUES(appearances), goals = VALUES(goals), assists = VALUES(assists),
       clean_sheets = VALUES(clean_sheets), yellow_cards = VALUES(yellow_cards), red_cards = VALUES(red_cards),
       minutes_played = VALUES(minutes_played), rating = VALUES(rating), stats_json = VALUES(stats_json)`,
      [
        data.season_id, data.player_id, data.team_id ?? null, data.division_id ?? null,
        data.appearances ?? 0, data.goals ?? 0, data.assists ?? 0,
        data.clean_sheets ?? 0, data.yellow_cards ?? 0, data.red_cards ?? 0,
        data.minutes_played ?? 0, data.rating ?? null,
        data.stats_json ? JSON.stringify(data.stats_json) : null,
      ],
    );
  }

  async recalculatePlayerStats(divisionId: number, seasonId: number): Promise<void> {
    const pool = getPool();
    await pool.query(
      'DELETE FROM player_statistics WHERE division_id = ?',
      [divisionId],
    );
  }

  async getTeamStats(filters: {
    season_id?: number; team_id?: number; division_id?: number;
  }): Promise<TeamStatAttributes[]> {
    const where: string[] = ['1 = 1'];
    const params: any[] = [];
    if (filters.season_id) { where.push('ts.season_id = ?'); params.push(filters.season_id); }
    if (filters.team_id) { where.push('ts.team_id = ?'); params.push(filters.team_id); }
    if (filters.division_id) { where.push('ts.division_id = ?'); params.push(filters.division_id); }

    const [rows] = await getPool().query<RowData>(
      `SELECT ts.* FROM team_statistics ts WHERE ${where.join(' AND ')} ORDER BY ts.played DESC`,
      params,
    );
    return rows as TeamStatAttributes[];
  }

  async upsertTeamStat(data: Partial<TeamStatAttributes>): Promise<void> {
    await getPool().query(
      `INSERT INTO team_statistics (season_id, team_id, division_id, played, wins, draws, losses, goals_for, goals_against, clean_sheets, home_record, away_record, stats_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       played = VALUES(played), wins = VALUES(wins), draws = VALUES(draws), losses = VALUES(losses),
       goals_for = VALUES(goals_for), goals_against = VALUES(goals_against),
       clean_sheets = VALUES(clean_sheets), home_record = VALUES(home_record),
       away_record = VALUES(away_record), stats_json = VALUES(stats_json)`,
      [
        data.season_id, data.team_id, data.division_id ?? null,
        data.played ?? 0, data.wins ?? 0, data.draws ?? 0, data.losses ?? 0,
        data.goals_for ?? 0, data.goals_against ?? 0, data.clean_sheets ?? 0,
        data.home_record ? JSON.stringify(data.home_record) : null,
        data.away_record ? JSON.stringify(data.away_record) : null,
        data.stats_json ? JSON.stringify(data.stats_json) : null,
      ],
    );
  }

  async recalculateTeamStats(divisionId: number, seasonId: number): Promise<void> {
    const pool = getPool();
    await pool.query(
      'DELETE FROM team_statistics WHERE division_id = ?',
      [divisionId],
    );
  }
}

export const statisticsRepository = new StatisticsRepository();
