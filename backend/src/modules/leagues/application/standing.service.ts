import { standingRepository } from '../infrastructure/repositories/standing.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { getPool } from '../../../database/mysql.js';
import { leagueRepository } from '../infrastructure/repositories/league.repository.js';

type RowData = import('mysql2').RowDataPacket[];

export class StandingService {
  async getStandings(divisionId: number) {
    return standingRepository.getStandings(divisionId);
  }

  async recalculate(divisionId: number): Promise<void> {
    const pool = getPool();

    const [divRows] = await pool.query<RowData>(
      'SELECT league_id FROM league_divisions WHERE id = ?',
      [divisionId],
    );
    if (!divRows.length) throw new NotFoundError('Division', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    const leagueId = (divRows[0] as any).league_id;

    const league = await leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundError('League', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

    const [completedMatches] = await pool.query<RowData>(
      `SELECT lm.home_team_id, lm.away_team_id, lr.home_score, lr.away_score, lr.winner_team_id
       FROM league_matches lm
       JOIN league_results lr ON lr.match_id = lm.id
       WHERE lm.division_id = ? AND lm.status = 'completed'`,
      [divisionId],
    );

    const [teams] = await pool.query<RowData>(
      "SELECT id FROM league_teams WHERE division_id = ? AND status = 'confirmed'",
      [divisionId],
    );

    await standingRepository.recalculateStandings(
      divisionId,
      completedMatches as any[],
      teams as any[],
      league.points_per_win,
      league.points_per_draw,
    );
  }
}

export const standingService = new StandingService();
