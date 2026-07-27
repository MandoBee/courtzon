import { getPool } from '../../../database/mysql.js';
import type { PlayerRanking } from '../domain/sports-engine.types.js';

type RowData = import('mysql2').RowDataPacket[];

const DEFAULT_RATING = 1200;
const K_FACTOR = 32;

class RankingService {
  async getRankings(filters: { type?: string; sportId?: number; orgId?: number; limit?: number }): Promise<PlayerRanking[]> {
    const pool = getPool();
    const where: string[] = ['1 = 1'];
    const params: any[] = [];

    if (filters.sportId) { where.push('er.sport_id = ?'); params.push(filters.sportId); }
    if (filters.limit) params.push(filters.limit);
    else params.push(100);

    const [rows] = await pool.query<RowData>(
      `SELECT er.user_id, u.full_name, u.avatar_url, er.rating, er.matches_played,
              COALESCE(er.matches_played, 0) AS wins, 0 AS losses, 0 AS win_rate,
              ROW_NUMBER() OVER (ORDER BY er.rating DESC) AS rank_position,
              s.name AS sport_name, er.last_match_at
       FROM elo_ratings er
       JOIN users u ON u.id = er.user_id
       LEFT JOIN sports s ON s.id = er.sport_id
       WHERE ${where.join(' AND ')}
       ORDER BY er.rating DESC
       LIMIT ?`, params,
    );

    return rows.map((r: any) => ({
      ...r, wins: r.matches_played, losses: 0,
      win_rate: r.matches_played > 0 ? 100 : 0,
    }));
  }

  async calculateElo(matchId: number, winnerId: number, loserId: number, sportId: number): Promise<{ winnerNewRating: number; loserNewRating: number }> {
    const pool = getPool();
    const getRating = async (userId: number): Promise<number> => {
      const [rows] = await pool.query<RowData>('SELECT rating FROM elo_ratings WHERE user_id = ? AND sport_id = ?', [userId, sportId]);
      if (rows.length) return rows[0].rating;
      await pool.execute('INSERT INTO elo_ratings (user_id, sport_id, rating, matches_played, k_factor) VALUES (?, ?, ?, 0, ?)', [userId, sportId, DEFAULT_RATING, K_FACTOR]);
      return DEFAULT_RATING;
    };

    const rA = await getRating(winnerId);
    const rB = await getRating(loserId);
    const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
    const expectedB = 1 - expectedA;
    const newA = Math.round(rA + K_FACTOR * (1 - expectedA));
    const newB = Math.round(rB + K_FACTOR * (0 - expectedB));

    await pool.execute('UPDATE elo_ratings SET rating = ?, matches_played = matches_played + 1, last_match_at = NOW() WHERE user_id = ? AND sport_id = ?', [newA, winnerId, sportId]);
    await pool.execute('UPDATE elo_ratings SET rating = ?, matches_played = matches_played + 1, last_match_at = NOW() WHERE user_id = ? AND sport_id = ?', [newB, loserId, sportId]);
    return { winnerNewRating: newA, loserNewRating: newB };
  }
}

export const rankingService = new RankingService();
