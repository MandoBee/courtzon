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

  /** Player profile + declared level for Self Declared evidence ingestion (C2). */
  async getProfileLevelInfo(userId: number): Promise<{ profileId: number; levelOrder: number; updatedAt: string } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pp.id, pp.updated_at, IFNULL(pl.level_order, 3) AS level_order
       FROM player_profiles pp
       LEFT JOIN player_levels pl ON pl.id = pp.main_level_id
       WHERE pp.user_id = ?
       LIMIT 1`,
      [userId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      profileId: Number(r.id),
      levelOrder: Number(r.level_order) || 3,
      updatedAt: r.updated_at,
    };
  }

  /** Existing Self Declared evidence row for a user+sport (idempotency check). */
  async getSelfDeclaredEvidence(userId: number, sportId: number): Promise<RatingEvidenceRow | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, user_id, sport_id, evidence_type, value_percent, source, source_ref_id,
              occurred_at, meta, created_at
       FROM rating_evidence
       WHERE user_id = ? AND sport_id = ? AND evidence_type = 'self_declared'
       LIMIT 1`,
      [userId, sportId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      id: r.id,
      userId: r.user_id,
      sportId: r.sport_id,
      evidenceType: r.evidence_type,
      valuePercent: Number(r.value_percent),
      source: r.source,
      sourceRefId: r.source_ref_id,
      occurredAt: r.occurred_at,
      meta: r.meta ? (typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta) : null,
    };
  }

  /** Apply a signed stat delta to a player_ratings row (correction path, C1). */
  async adjustStatDelta(
    userId: number,
    sportId: number,
    delta: { matches: number; wins: number; draws: number; losses: number },
  ): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `UPDATE player_ratings
       SET matches_count = GREATEST(CAST(matches_count AS SIGNED) + ?, 0),
           match_wins = GREATEST(CAST(match_wins AS SIGNED) + ?, 0),
           match_draws = GREATEST(CAST(match_draws AS SIGNED) + ?, 0),
           match_losses = GREATEST(CAST(match_losses AS SIGNED) + ?, 0)
       WHERE user_id = ? AND sport_id = ?`,
      [delta.matches, delta.wins, delta.draws, delta.losses, userId, sportId],
    );
  }

  /**
   * Round 2/3 — mark a source's evidence active/inactive WITHOUT deleting
   * historical rows. Inactive evidence remains stored but no longer contributes
   * to current Overall Rating. `asOf` records WHEN the state flipped so
   * Point-in-Time calculations can evaluate validity as of any timestamp.
   */
  async setEvidenceActive(source: string, sourceRefId: number, active: boolean, asOf: string): Promise<void> {
    const pool = getPool();
    if (active) {
      await pool.execute(
        `UPDATE rating_evidence
         SET meta = JSON_SET(COALESCE(meta, JSON_OBJECT()), '$.active', true, '$.reactivated_at', ?)
         WHERE source = ? AND source_ref_id = ?`,
        [asOf, source, sourceRefId],
      );
    } else {
      await pool.execute(
        `UPDATE rating_evidence
         SET meta = JSON_SET(COALESCE(meta, JSON_OBJECT()), '$.active', false, '$.invalidated_at', ?)
         WHERE source = ? AND source_ref_id = ?`,
        [asOf, source, sourceRefId],
      );
    }
  }

  /** Distinct sports where the user currently has Self Declared evidence. */
  async getSelfDeclaredSportIds(userId: number): Promise<number[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT sport_id FROM rating_evidence
       WHERE user_id = ? AND evidence_type = 'self_declared'`,
      [userId],
    );
    return rows.map((r: any) => Number(r.sport_id));
  }

  /** The player's declared main sport (player_profiles.main_sport_id). */
  async getMainSportId(userId: number): Promise<number | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT main_sport_id FROM player_profiles WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    if (!rows.length) return null;
    const v = (rows[0] as any).main_sport_id;
    return v == null ? null : Number(v);
  }
}

export const ratingRepository = new RatingRepository();