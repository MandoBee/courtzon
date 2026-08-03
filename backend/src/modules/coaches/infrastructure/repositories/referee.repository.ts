import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import {
  professionalProfileRepository,
  PROFESSIONAL_PROFILE_SELECT,
} from '../../../profiles/infrastructure/repositories/professional-profile.repository.js';
import type { ProfessionalProfileInput } from '../../../profiles/infrastructure/repositories/professional-profile.repository.js';
type RowData = RowDataPacket[];

export const refereeRepository = {
  async findById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM referees WHERE id = ?', [id]);
    return rows[0] || null;
  },

  /** Resolve the referee identity row for a user — the Referee module's only
   *  dependency. Returns null when the user is not an official referee. */
  async getRefereeIdByUserId(userId: number): Promise<number | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT id FROM referees WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
      [userId],
    );
    return rows.length ? (rows[0] as any).id : null;
  },

  async getRefereeProfile(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT r.id AS referee_id, r.status AS referee_status,
              u.id AS user_id, u.full_name, u.email, u.phone, u.avatar_url,
              ${PROFESSIONAL_PROFILE_SELECT}
       FROM referees r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN professional_profiles pp ON pp.user_id = r.user_id
       WHERE r.user_id = ? AND r.deleted_at IS NULL`,
      [userId],
    );
    return rows[0] || null;
  },

  async softDeleteByUserId(userId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(
      'UPDATE referees SET deleted_at = NOW(), status = \'inactive\' WHERE user_id = ? AND deleted_at IS NULL',
      [userId],
    );
  },

  async upsertProfile(userId: number, data: ProfessionalProfileInput): Promise<boolean> {
    return professionalProfileRepository.upsertByUserId(userId, data);
  },

  async listAvailability(refereeId: number) {
    const pool = getPool();
    const [rows] = await pool.query<RowData>(
      'SELECT * FROM referee_availability WHERE referee_id = ? ORDER BY day_of_week, start_time',
      [refereeId],
    );
    return rows;
  },

  async replaceAvailability(refereeId: number, slots: { dayOfWeek: number; startTime: string; endTime: string }[]) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM referee_availability WHERE referee_id = ?', [refereeId]);
      for (const slot of slots) {
        await conn.execute(
          'INSERT INTO referee_availability (referee_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
          [refereeId, slot.dayOfWeek, slot.startTime, slot.endTime],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async listBlackouts(refereeId: number) {
    const pool = getPool();
    const [rows] = await pool.query<RowData>(
      'SELECT * FROM referee_availability_blackouts WHERE referee_id = ? ORDER BY blackout_date',
      [refereeId],
    );
    return rows;
  },

  async addBlackout(refereeId: number, blackoutDate: string, reason?: string) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO referee_availability_blackouts (referee_id, blackout_date, reason) VALUES (?, ?, ?)',
      [refereeId, blackoutDate, reason || null],
    );
    return (result as any).insertId;
  },

  async removeBlackout(blackoutId: number, refereeId: number) {
    const pool = getPool();
    const [result] = await pool.execute(
      'DELETE FROM referee_availability_blackouts WHERE id = ? AND referee_id = ?',
      [blackoutId, refereeId],
    );
    return (result as any).affectedRows > 0;
  },

  async listAssignments(refereeId: number) {
    const pool = getPool();
    const [tournamentMatches] = await pool.query<RowData>(
      `SELECT tm.*, t.name AS tournament_name
       FROM tournament_matches tm
       JOIN tournaments t ON t.id = tm.tournament_id
       WHERE tm.referee_id = ? AND tm.status IN ('scheduled','in_progress')
       ORDER BY tm.start_time ASC`,
      [refereeId],
    );
    const [leagueMatches] = await pool.query<RowData>(
      `SELECT lm.*, l.name AS league_name
       FROM league_matches lm
       JOIN leagues l ON l.id = lm.division_id
       WHERE lm.referee_id = ? AND lm.status IN ('scheduled','in_progress')
       ORDER BY lm.match_date ASC, lm.start_time ASC`,
      [refereeId],
    );
    return { tournamentMatches, leagueMatches };
  },

  async listMatchHistory(refereeId: number) {
    const pool = getPool();
    const [tournamentMatches] = await pool.query<RowData>(
      `SELECT tm.*, t.name AS tournament_name
       FROM tournament_matches tm
       JOIN tournaments t ON t.id = tm.tournament_id
       WHERE tm.referee_id = ? AND tm.status = 'completed'
       ORDER BY tm.start_time DESC`,
      [refereeId],
    );
    const [leagueMatches] = await pool.query<RowData>(
      `SELECT lm.*, l.name AS league_name
       FROM league_matches lm
       JOIN leagues l ON l.id = lm.division_id
       WHERE lm.referee_id = ? AND lm.status = 'completed'
       ORDER BY lm.match_date DESC, lm.start_time DESC`,
      [refereeId],
    );
    return { tournamentMatches, leagueMatches };
  },

  async countMatches(refereeId: number) {
    const pool = getPool();
    const [[upcomingTournament]] = await pool.query<RowData>(
      `SELECT COUNT(*) AS count FROM tournament_matches WHERE referee_id = ? AND status IN ('scheduled','in_progress')`,
      [refereeId],
    );
    const [[upcomingLeague]] = await pool.query<RowData>(
      `SELECT COUNT(*) AS count FROM league_matches WHERE referee_id = ? AND status IN ('scheduled','in_progress')`,
      [refereeId],
    );
    const [[completedTournament]] = await pool.query<RowData>(
      `SELECT COUNT(*) AS count FROM tournament_matches WHERE referee_id = ? AND status = 'completed'`,
      [refereeId],
    );
    const [[completedLeague]] = await pool.query<RowData>(
      `SELECT COUNT(*) AS count FROM league_matches WHERE referee_id = ? AND status = 'completed'`,
      [refereeId],
    );
    const [[tournamentTotal]] = await pool.query<RowData>(
      `SELECT COUNT(*) AS count FROM tournament_matches WHERE referee_id = ?`,
      [refereeId],
    );
    const [[leagueTotal]] = await pool.query<RowData>(
      `SELECT COUNT(*) AS count FROM league_matches WHERE referee_id = ?`,
      [refereeId],
    );
    return {
      upcomingMatches: Number(upcomingTournament.count) + Number(upcomingLeague.count),
      completedMatches: Number(completedTournament.count) + Number(completedLeague.count),
      tournamentMatches: Number(tournamentTotal.count),
      leagueMatches: Number(leagueTotal.count),
      totalMatches: Number(tournamentTotal.count) + Number(leagueTotal.count),
    };
  },
};
