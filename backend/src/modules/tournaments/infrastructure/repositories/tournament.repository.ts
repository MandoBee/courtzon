import { getPool } from '../../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { Tournament, TournamentParticipant, TournamentMatch } from '../../domain/tournament-aggregate.js';

type RowData = RowDataPacket[];

export class TournamentRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async create(data: Tournament): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO tournaments (name, format, sport_id, organisation_id, branch_id, start_date, end_date, registration_deadline, max_participants, current_participants, registration_type, status, match_duration_minutes, description, rules, prize_description, aggregate_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [data.name, data.format, data.sportId, data.organisationId || null, data.branchId || null,
       data.startDate, data.endDate, data.registrationDeadline, data.maxParticipants, data.currentParticipants || 0,
       data.registrationType, data.status || 'draft', data.matchDurationMinutes || 60,
       data.description || null, data.rules || null, data.prizeDescription || null],
    );
    return result.insertId;
  }

  async findById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>('SELECT * FROM tournaments WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findOpen(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      "SELECT * FROM tournaments WHERE status IN ('draft', 'open') AND registration_deadline > NOW() ORDER BY start_date",
    );
    return rows;
  }

  async addParticipant(data: TournamentParticipant): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO tournament_participants (tournament_id, user_id, team_name, seed, status, registered_at) VALUES (?, ?, ?, ?, 'registered', NOW())",
      [data.tournamentId, data.userId || null, data.teamName || null, data.seed || 0],
    );
    return result.insertId;
  }

  async findParticipants(tournamentId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY seed',
      [tournamentId],
    );
    return rows;
  }

  async createMatch(data: TournamentMatch): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO tournament_matches (tournament_id, round, group_id, bracket_position, player1_id, player2_id, winner_id, score, status, court_id, referee_id, scheduled_at, aggregate_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [data.tournamentId, data.round, data.groupId || null, data.bracketPosition || 0,
       data.player1Id || null, data.player2Id || null, data.winnerId || null,
       data.score || null, data.status || 'scheduled', data.courtId || null,
       data.refereeId || null, data.scheduledAt || null],
    );
    return result.insertId;
  }

  async findMatches(tournamentId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, bracket_position',
      [tournamentId],
    );
    return rows;
  }

  async updateMatchStatus(id: number, status: string, winnerId?: number, score?: string): Promise<void> {
    await this.pool.execute(
      `UPDATE tournament_matches SET status = ?, winner_id = COALESCE(?, winner_id), score = COALESCE(?, score),
       completed_at = IF(? IN ('completed','walkover','forfeit'), NOW(), completed_at),
       aggregate_version = aggregate_version + 1 WHERE id = ?`,
      [status, winnerId || null, score || null, status, id],
    );
  }

  async getEloRating(userId: number, sportId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM elo_ratings WHERE user_id = ? AND sport_id = ?', [userId, sportId],
    );
    return rows[0] || null;
  }

  async upsertEloRating(rating: any): Promise<void> {
    await this.pool.execute(
      `INSERT INTO elo_ratings (user_id, sport_id, rating, matches_played, k_factor, last_match_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), matches_played = VALUES(matches_played),
       k_factor = VALUES(k_factor), last_match_at = NOW()`,
      [rating.userId, rating.sportId, rating.rating, rating.matchesPlayed, rating.kFactor],
    );
  }

  async updateTournamentParticipants(id: number, count: number): Promise<void> {
    await this.pool.execute('UPDATE tournaments SET current_participants = ? WHERE id = ?', [count, id]);
  }

  async updateTournamentStatus(id: number, status: string): Promise<void> {
    await this.pool.execute('UPDATE tournaments SET status = ? WHERE id = ?', [status, id]);
  }
}

export const tournamentRepository = new TournamentRepository();
