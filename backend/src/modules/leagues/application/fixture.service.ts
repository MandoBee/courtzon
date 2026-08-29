import { fixtureRepository } from '../infrastructure/repositories/fixture.repository.js';
import { standingRepository } from '../infrastructure/repositories/standing.repository.js';
import { leagueRepository } from '../infrastructure/repositories/league.repository.js';
import { generateRoundRobinFixtures } from '../domain/league-aggregate.js';
import type { LeagueMatchAttributes, LeagueResultAttributes } from '../domain/league.types.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { getPool } from '../../../database/mysql.js';

type RowData = import('mysql2').RowDataPacket[];

export class FixtureService {
  async generateFixtures(leagueId: number): Promise<void> {
    const league = await leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundError('League', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

    const pool = getPool();
    const [divisions] = await pool.query<RowData>(
      "SELECT * FROM league_divisions WHERE league_id = ? AND status = 'active' ORDER BY tier",
      [leagueId],
    );

    if (!divisions.length) throw new ConflictError('No active divisions found', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);

    for (const div of divisions) {
      const [teams] = await pool.query<RowData>(
        "SELECT id FROM league_teams WHERE division_id = ? AND status = 'confirmed' ORDER BY seed",
        [div.id],
      );
      const teamIds = teams.map((t: any) => t.id);
      if (teamIds.length < 2) continue;

      const doubleRoundRobin = league.format === 'double_round_robin';
      const fixtures = generateRoundRobinFixtures(teamIds, doubleRoundRobin);

      for (const f of fixtures) {
        await fixtureRepository.createMatch({
          division_id: div.id,
          home_team_id: f.home_team_id,
          away_team_id: f.away_team_id,
          round: f.round,
          status: 'scheduled',
        });
      }
    }

    eventBusV2.emit('fixtures.generated', { leagueId } as Record<string, unknown>, {
      aggregateType: 'league', aggregateId: String(leagueId), aggregateVersion: 1,
    });
  }

  async assignCourt(matchId: number, courtId: number): Promise<void> {
    const match = await fixtureRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Match', ErrorCodes.MATCH_NOT_FOUND);
    await fixtureRepository.assignCourt(matchId, courtId);
  }

  async assignReferee(matchId: number, refereeId: number): Promise<void> {
    const match = await fixtureRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Match', ErrorCodes.MATCH_NOT_FOUND);
    await fixtureRepository.assignReferee(matchId, refereeId);
    await this.emitRefereeAssigned(match, refereeId, 'league');
  }

  /** Emit referee:assigned with the referee's user_id (non-fatal). */
  private async emitRefereeAssigned(match: any, refereeId: number, matchType: 'league' | 'tournament'): Promise<void> {
    try {
      const [rows] = await getPool().execute<RowData>(
        'SELECT user_id FROM referees WHERE id = ? AND deleted_at IS NULL LIMIT 1', [refereeId],
      );
      const userId = (rows as any[])[0]?.user_id;
      if (!userId) return;
      eventBusV2.emit('referee:assigned', {
        matchId: Number(match.id),
        refereeId,
        userId,
        matchType,
      } as any);
    } catch (err) {
      // Notification emission is non-fatal; assignment already persisted.
      console.error('emitRefereeAssigned failed', err);
    }
  }

  async recordResult(
    matchId: number,
    homeScore: number,
    awayScore: number,
    enteredBy: number,
  ): Promise<void> {
    const match = await fixtureRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Match', ErrorCodes.MATCH_NOT_FOUND);

    let winnerTeamId: number | null = null;
    let resultStatus: string = 'submitted';
    if (homeScore > awayScore) {
      winnerTeamId = match.home_team_id;
    } else if (awayScore > homeScore) {
      winnerTeamId = match.away_team_id;
    }

    await fixtureRepository.createResult({
      match_id: matchId,
      home_score: String(homeScore),
      away_score: String(awayScore),
      winner_team_id: winnerTeamId,
      result_status: resultStatus as any,
      entered_by: enteredBy,
    });

    await fixtureRepository.updateMatchStatus(matchId, 'completed');

    const pool = getPool();
    const [divRows] = await pool.query<RowData>(
      'SELECT league_id FROM league_divisions WHERE id = ?',
      [match.division_id],
    );
    const leagueId = (divRows[0] as any)?.league_id;

    if (leagueId) {
      const league = await leagueRepository.findById(leagueId);
      if (league) {
        const [completedMatches] = await pool.query<RowData>(
          `SELECT lm.home_team_id, lm.away_team_id, lr.home_score, lr.away_score, lr.winner_team_id
           FROM league_matches lm
           JOIN league_results lr ON lr.match_id = lm.id
           WHERE lm.division_id = ? AND lm.status = 'completed'`,
          [match.division_id],
        );

        const [teams] = await pool.query<RowData>(
          "SELECT id FROM league_teams WHERE division_id = ? AND status = 'confirmed'",
          [match.division_id],
        );

        await standingRepository.recalculateStandings(
          match.division_id,
          completedMatches as any[],
          teams as any[],
          league.points_per_win,
          league.points_per_draw,
        );
      }
    }

    eventBusV2.emit('match.result.recorded', { matchId, winnerTeamId } as Record<string, unknown>, {
      aggregateType: 'league', aggregateId: String(match.division_id), aggregateVersion: 1,
    });
  }
}

export const fixtureService = new FixtureService();
