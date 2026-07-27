import { getPool } from '../../../../database/mysql.js';
import type { LeagueStandingAttributes } from '../../domain/league.types.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

export class StandingRepository {
  async getStandings(divisionId: number): Promise<LeagueStandingAttributes[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT s.*, t.team_name
       FROM league_standings s
       JOIN league_teams t ON t.id = s.team_id
       WHERE s.division_id = ?
       ORDER BY s.position ASC`,
      [divisionId],
    );
    return rows as LeagueStandingAttributes[];
  }

  async upsertStanding(data: Partial<LeagueStandingAttributes>): Promise<void> {
    await getPool().query(
      `INSERT INTO league_standings (division_id, team_id, played, wins, draws, losses, goals_for, goals_against, goal_difference, points, position, form)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       played = VALUES(played), wins = VALUES(wins), draws = VALUES(draws), losses = VALUES(losses),
       goals_for = VALUES(goals_for), goals_against = VALUES(goals_against),
       goal_difference = VALUES(goal_difference), points = VALUES(points),
       position = VALUES(position), form = VALUES(form)`,
      [
        data.division_id, data.team_id, data.played, data.wins, data.draws, data.losses,
        data.goals_for, data.goals_against, data.goal_difference, data.points,
        data.position ?? null, data.form ? JSON.stringify(data.form) : null,
      ],
    );
  }

  async recalculateStandings(
    divisionId: number,
    completedMatches: { home_team_id: number; away_team_id: number; home_score: number; away_score: number; winner_team_id: number | null }[],
    teams: { id: number }[],
    pointsPerWin: number,
    pointsPerDraw: number,
  ): Promise<void> {
    const pool = getPool();
    await pool.query('DELETE FROM league_standings WHERE division_id = ?', [divisionId]);

    const stats = new Map<number, {
      played: number; wins: number; draws: number; losses: number;
      goals_for: number; goals_against: number; points: number; form: string[];
    }>();

    for (const t of teams) {
      stats.set(t.id, { played: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0, form: [] });
    }

    for (const m of completedMatches) {
      const home = stats.get(m.home_team_id);
      const away = stats.get(m.away_team_id);
      if (!home || !away) continue;

      const homeScore = Number(m.home_score) || 0;
      const awayScore = Number(m.away_score) || 0;

      home.goals_for += homeScore;
      home.goals_against += awayScore;
      away.goals_for += awayScore;
      away.goals_against += homeScore;

      home.played++;
      away.played++;

      if (m.winner_team_id === m.home_team_id) {
        home.wins++; home.points += pointsPerWin; away.losses++;
        home.form.push('W'); away.form.push('L');
      } else if (m.winner_team_id === m.away_team_id) {
        away.wins++; away.points += pointsPerWin; home.losses++;
        home.form.push('L'); away.form.push('W');
      } else {
        home.draws++; away.draws++;
        home.points += pointsPerDraw; away.points += pointsPerDraw;
        home.form.push('D'); away.form.push('D');
      }
    }

    let position = 1;
    const sorted = [...stats.entries()].sort((a, b) => {
      if (b[1].points !== a[1].points) return b[1].points - a[1].points;
      const gdA = a[1].goals_for - a[1].goals_against;
      const gdB = b[1].goals_for - b[1].goals_against;
      if (gdB !== gdA) return gdB - gdA;
      return b[1].goals_for - a[1].goals_for;
    });

    for (const [teamId, s] of sorted) {
      await pool.query<ResultSet>(
        `INSERT INTO league_standings (division_id, team_id, played, wins, draws, losses, goals_for, goals_against, goal_difference, points, position, form)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          divisionId, teamId, s.played, s.wins, s.draws, s.losses,
          s.goals_for, s.goals_against, s.goals_for - s.goals_against,
          s.points, position, JSON.stringify(s.form.slice(-5)),
        ],
      );
      position++;
    }
  }

  async deleteByDivision(divisionId: number): Promise<void> {
    await getPool().query('DELETE FROM league_standings WHERE division_id = ?', [divisionId]);
  }
}

export const standingRepository = new StandingRepository();
