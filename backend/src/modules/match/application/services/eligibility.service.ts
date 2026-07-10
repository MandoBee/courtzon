import { getPool } from '../../../../database/mysql.js';
import type { MatchCriteria } from '../../domain/match-criteria.vo.js';

type RowData = import('mysql2').RowDataPacket[];

export class EligibilityService {
  async isEligible(userId: number, criteria: MatchCriteria, sportId: number, branchId: number): Promise<boolean> {
    const pool = getPool();

    const [rows] = await pool.execute<RowData>(
      `SELECT u.id
       FROM users u
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       WHERE u.id = ?
         AND u.account_status = 'active'
         AND (
           ? IS NULL
           OR (u.birth_date IS NOT NULL AND TIMESTAMPDIFF(YEAR, u.birth_date, CURDATE()) >= ?)
         )
         AND (
           ? IS NULL
           OR (u.birth_date IS NOT NULL AND TIMESTAMPDIFF(YEAR, u.birth_date, CURDATE()) <= ?)
         )
         AND (
           ? = 'any'
           OR u.gender = ?
         )
         AND (
           ? IS NULL
           OR pp.main_level_id = ?
         )
         AND (
           ? = pp.main_sport_id
           OR EXISTS (SELECT 1 FROM player_sport_interests psi WHERE psi.user_id = u.id AND psi.sport_id = ?)
           OR (pp.main_sport_id IS NULL AND NOT EXISTS (SELECT 1 FROM player_sport_interests psi2 WHERE psi2.user_id = u.id))
         )`,
      [
        userId,
        criteria.minAge, criteria.minAge,
        criteria.maxAge, criteria.maxAge,
        criteria.targetGender, criteria.targetGender,
        criteria.targetLevelId, criteria.targetLevelId,
        sportId, sportId,
      ]
    );

    return rows.length > 0;
  }

  async findEligiblePlayerIds(
    criteria: MatchCriteria,
    sportId: number,
    excludeUserId: number
  ): Promise<number[]> {
    const pool = getPool();

    const conditions: string[] = ['u.id != ?', "u.account_status = 'active'"];
    const params: any[] = [excludeUserId];

    if (criteria.minAge) {
      conditions.push('u.birth_date IS NOT NULL', 'TIMESTAMPDIFF(YEAR, u.birth_date, CURDATE()) >= ?');
      params.push(criteria.minAge);
    }
    if (criteria.maxAge) {
      conditions.push('u.birth_date IS NOT NULL', 'TIMESTAMPDIFF(YEAR, u.birth_date, CURDATE()) <= ?');
      params.push(criteria.maxAge);
    }
    if (criteria.targetGender && criteria.targetGender !== 'any') {
      conditions.push('u.gender = ?');
      params.push(criteria.targetGender);
    }
    if (criteria.targetLevelId) {
      conditions.push('pp.main_level_id = ?');
      params.push(criteria.targetLevelId);
    }

    const sportFilter = `(
      pp.main_sport_id = ?
      OR EXISTS (SELECT 1 FROM player_sport_interests psi WHERE psi.user_id = u.id AND psi.sport_id = ?)
      OR (pp.main_sport_id IS NULL AND NOT EXISTS (SELECT 1 FROM player_sport_interests psi2 WHERE psi2.user_id = u.id))
    )`;
    params.push(sportId, sportId);

    const [rows] = await pool.execute<RowData>(
      `SELECT u.id FROM users u
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       AND ${sportFilter}
       ORDER BY u.full_name ASC`,
      params
    );

    return (rows as any[]).map((r: any) => r.id);
  }
}

export const eligibilityService = new EligibilityService();
