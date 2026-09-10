import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { PlayerRating, RatingEvidenceRow } from '../domain/match-result.types.js';

type RowData = mysql.RowDataPacket[];

export interface UpsertEvidenceInput {
  userId: number;
  sportId: number;
  evidenceType: RatingEvidenceRow['evidenceType'];
  valuePercent: number;
  source: string;
  sourceRefId: number | null;
  occurredAt: string;
  meta?: Record<string, unknown> | null;
}

export class RatingRepository {
  async getEvidence(userId: number, sportId: number): Promise<RatingEvidenceRow[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, user_id, sport_id, evidence_type, value_percent, source, source_ref_id,
              occurred_at, meta, created_at
       FROM rating_evidence
       WHERE user_id = ? AND sport_id = ?
       ORDER BY occurred_at ASC, id ASC`,
      [userId, sportId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      sportId: r.sport_id,
      evidenceType: r.evidence_type,
      valuePercent: Number(r.value_percent),
      source: r.source,
      sourceRefId: r.source_ref_id,
      occurredAt: r.occurred_at,
      meta: r.meta ? (typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta) : null,
    }));
  }

  async upsertEvidence(input: UpsertEvidenceInput): Promise<void> {
    const pool = getPool();
    const meta = input.meta ? JSON.stringify(input.meta) : null;
    await pool.execute(
      `INSERT INTO rating_evidence
         (user_id, sport_id, evidence_type, value_percent, source, source_ref_id, occurred_at, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         value_percent = VALUES(value_percent),
         occurred_at = VALUES(occurred_at),
         meta = VALUES(meta),
         evidence_type = VALUES(evidence_type)`,
      [input.userId, input.sportId, input.evidenceType, input.valuePercent, input.source, input.sourceRefId, input.occurredAt, meta],
    );
  }

  async getRating(userId: number, sportId: number): Promise<PlayerRating | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT user_id, sport_id, overall_percent, matches_count, match_wins, match_draws, match_losses
       FROM player_ratings WHERE user_id = ? AND sport_id = ?`,
      [userId, sportId],
    );
    if (!rows.length) return null;
    const r: any = rows[0];
    return {
      userId: r.user_id,
      sportId: r.sport_id,
      overallPercent: Number(r.overall_percent),
      matchesCount: r.matches_count,
      matchWins: r.match_wins,
      matchDraws: r.match_draws,
      matchLosses: r.match_losses,
    };
  }

  async upsertRating(rating: PlayerRating): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO player_ratings
         (user_id, sport_id, overall_percent, matches_count, match_wins, match_draws, match_losses)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         overall_percent = VALUES(overall_percent),
         matches_count = VALUES(matches_count),
         match_wins = VALUES(match_wins),
         match_draws = VALUES(match_draws),
         match_losses = VALUES(match_losses)`,
      [rating.userId, rating.sportId, rating.overallPercent, rating.matchesCount, rating.matchWins, rating.matchDraws, rating.matchLosses],
    );
  }

  async insertHistory(input: {
    userId: number;
    sportId: number;
    ratingBefore: number | null;
    ratingAfter: number;
    changedBy: number | null;
    sourceRef?: string;
    reason?: string;
  }): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO player_rating_history
         (user_id, sport_id, rating_before, rating_after, changed_by, source_ref, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.sportId,
        input.ratingBefore,
        input.ratingAfter,
        input.changedBy,
        input.sourceRef ?? null,
        input.reason ?? null,
      ],
    );
  }

  async getSelfDeclaredPercent(userId: number, sportId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT IFNULL(pl.level_order, 3) AS level_order
       FROM player_profiles pp
       LEFT JOIN player_levels pl ON pl.id = pp.main_level_id
       WHERE pp.user_id = ?
       LIMIT 1`,
      [userId],
    );
    if (!rows.length) return 60;
    const levelOrder = Math.max(1, Math.min(5, Number((rows[0] as any).level_order) || 3));
    return 20 * levelOrder;
  }
}

export const ratingRepository = new RatingRepository();