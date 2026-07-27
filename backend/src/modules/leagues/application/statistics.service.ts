import { statisticsRepository } from '../infrastructure/repositories/statistics.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { getPool } from '../../../database/mysql.js';
import { leagueRepository } from '../infrastructure/repositories/league.repository.js';

type RowData = import('mysql2').RowDataPacket[];

export class StatisticsService {
  async getPlayerStats(filters: {
    season_id?: number; player_id?: number; team_id?: number; division_id?: number;
  }) {
    return statisticsRepository.getPlayerStats(filters);
  }

  async getTeamStats(filters: {
    season_id?: number; team_id?: number; division_id?: number;
  }) {
    return statisticsRepository.getTeamStats(filters);
  }

  async recalculatePlayerStats(divisionId: number): Promise<void> {
    const pool = getPool();

    const [divRows] = await pool.query<RowData>(
      'SELECT league_id FROM league_divisions WHERE id = ?',
      [divisionId],
    );
    if (!divRows.length) throw new NotFoundError('Division', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);

    const [seasonRows] = await pool.query<RowData>(
      `SELECT l.season_id FROM league_divisions ld
       JOIN leagues l ON l.id = ld.league_id
       WHERE ld.id = ?`,
      [divisionId],
    );
    const seasonId = (seasonRows[0] as any)?.season_id;
    if (!seasonId) throw new NotFoundError('Season', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

    await statisticsRepository.recalculatePlayerStats(divisionId, seasonId);

    const [teams] = await pool.query<RowData>(
      "SELECT id, player_ids FROM league_teams WHERE division_id = ? AND status = 'confirmed'",
      [divisionId],
    );

    const [completedMatches] = await pool.query<RowData>(
      `SELECT lm.home_team_id, lm.away_team_id, lr.home_score, lr.away_score
       FROM league_matches lm
       JOIN league_results lr ON lr.match_id = lm.id
       WHERE lm.division_id = ? AND lm.status = 'completed'`,
      [divisionId],
    );

    for (const team of teams) {
      const playerIds: number[] = [];
      if (team.player_ids) {
        const parsed = typeof team.player_ids === 'string' ? JSON.parse(team.player_ids) : team.player_ids;
        if (Array.isArray(parsed)) playerIds.push(...parsed);
      }

      let appearances = 0;
      let goals = 0;
      let assists = 0;
      let cleanSheets = 0;
      let yellowCards = 0;
      let redCards = 0;
      let minutesPlayed = 0;

      for (const match of completedMatches) {
        if (match.home_team_id === team.id || match.away_team_id === team.id) {
          appearances++;
          const homeScore = Number(match.home_score) || 0;
          const awayScore = Number(match.away_score) || 0;
          if (match.home_team_id === team.id) {
            goals += homeScore;
          } else {
            goals += awayScore;
          }
          if ((match.home_team_id === team.id && awayScore === 0) ||
              (match.away_team_id === team.id && homeScore === 0)) {
            cleanSheets++;
          }
        }
      }

      for (const playerId of playerIds) {
        await statisticsRepository.upsertPlayerStat({
          season_id: seasonId,
          player_id: playerId,
          team_id: team.id,
          division_id: divisionId,
          appearances,
          goals,
          assists,
          clean_sheets: cleanSheets,
          yellow_cards: yellowCards,
          red_cards: redCards,
          minutes_played: minutesPlayed,
        });
      }
    }
  }

  async recalculateTeamStats(divisionId: number): Promise<void> {
    const pool = getPool();

    const [divRows] = await pool.query<RowData>(
      'SELECT league_id FROM league_divisions WHERE id = ?',
      [divisionId],
    );
    if (!divRows.length) throw new NotFoundError('Division', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);

    const [seasonRows] = await pool.query<RowData>(
      `SELECT l.season_id FROM league_divisions ld
       JOIN leagues l ON l.id = ld.league_id
       WHERE ld.id = ?`,
      [divisionId],
    );
    const seasonId = (seasonRows[0] as any)?.season_id;
    if (!seasonId) throw new NotFoundError('Season', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

    await statisticsRepository.recalculateTeamStats(divisionId, seasonId);

    const [teams] = await pool.query<RowData>(
      "SELECT id FROM league_teams WHERE division_id = ? AND status = 'confirmed'",
      [divisionId],
    );

    const [completedMatches] = await pool.query<RowData>(
      `SELECT lm.home_team_id, lm.away_team_id, lr.home_score, lr.away_score
       FROM league_matches lm
       JOIN league_results lr ON lr.match_id = lm.id
       WHERE lm.division_id = ? AND lm.status = 'completed'`,
      [divisionId],
    );

    for (const team of teams) {
      let played = 0;
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      let cleanSheets = 0;
      const homeRecord = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
      const awayRecord = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };

      for (const match of completedMatches) {
        if (match.home_team_id !== team.id && match.away_team_id !== team.id) continue;

        const homeScore = Number(match.home_score) || 0;
        const awayScore = Number(match.away_score) || 0;
        const isHome = match.home_team_id === team.id;

        played++;
        if (isHome) {
          goalsFor += homeScore;
          goalsAgainst += awayScore;
          homeRecord.gf += homeScore;
          homeRecord.ga += awayScore;
          if (homeScore > awayScore) { wins++; homeRecord.wins++; }
          else if (homeScore === awayScore) { draws++; homeRecord.draws++; }
          else { losses++; homeRecord.losses++; }
          if (awayScore === 0) cleanSheets++;
        } else {
          goalsFor += awayScore;
          goalsAgainst += homeScore;
          awayRecord.gf += awayScore;
          awayRecord.ga += homeScore;
          if (awayScore > homeScore) { wins++; awayRecord.wins++; }
          else if (awayScore === homeScore) { draws++; awayRecord.draws++; }
          else { losses++; awayRecord.losses++; }
          if (homeScore === 0) cleanSheets++;
        }
      }

      await statisticsRepository.upsertTeamStat({
        season_id: seasonId,
        team_id: team.id,
        division_id: divisionId,
        played,
        wins,
        draws,
        losses,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        clean_sheets: cleanSheets,
        home_record: homeRecord as any,
        away_record: awayRecord as any,
      });
    }
  }
}

export const statisticsService = new StatisticsService();
