import { ratingRepository } from '../../infrastructure/rating.repository.js';
import type { PlayerRating, RatingEvidenceType } from '../../domain/match-result.types.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';
import {
  EVIDENCE_WEIGHTS,
  HALF_LIFE_DAYS,
  decayFactor,
  clampRating,
  computeOverallPercent,
  type RankedEvidence,
} from './rating-math.js';

const log = createModuleLogger('match-result-rating');

export { EVIDENCE_WEIGHTS, HALF_LIFE_DAYS, decayFactor, clampRating, computeOverallPercent };
export type { RankedEvidence };

export interface ApplyEvidenceInput {
  userId: number;
  sportId: number;
  evidenceType: RatingEvidenceType;
  valuePercent: number;
  source: string;
  sourceRefId: number | null;
  occurredAt: string;
  changedBy: number | null;
  reason?: string;
  meta?: Record<string, unknown> | null;
}

export class RatingService {
  /** True when evidence is new or actually changes the stored value for a source reference. */
  async applyEvidence(input: ApplyEvidenceInput): Promise<{ before: number; after: number }> {
    const before = await this.resolveOverallPercent(input.userId, input.sportId);

    await ratingRepository.upsertEvidence({
      userId: input.userId,
      sportId: input.sportId,
      evidenceType: input.evidenceType,
      valuePercent: input.valuePercent,
      source: input.source,
      sourceRefId: input.sourceRefId,
      occurredAt: input.occurredAt,
      meta: input.meta,
    });

    const after = await this.recalculate(input.userId, input.sportId, input.changedBy, input.reason, input.sourceRefId ? `${input.source}:${input.sourceRefId}` : input.source);
    return { before, after };
  }

  /** Recompute Overall Rating from all (decayed) evidence; upsert + history. */
  async recalculate(userId: number, sportId: number, changedBy: number | null, reason?: string, sourceRef?: string): Promise<number> {
    const evidence = await ratingRepository.getEvidence(userId, sportId);
    const fallback = await ratingRepository.getSelfDeclaredPercent(userId, sportId);

    const ranked = evidence.map((e) => ({
      value: e.valuePercent,
      weight: EVIDENCE_WEIGHTS[(e.evidenceType as RatingEvidenceType) ?? 'match'] * decayFactor(e.occurredAt),
      occurredAt: e.occurredAt,
    }));
    const overall = computeOverallPercent(ranked, fallback);

    const previous = await ratingRepository.getRating(userId, sportId);
    if (!previous || Math.abs(previous.overallPercent - overall) >= 0.005) {
      const before = previous?.overallPercent ?? null;
      await ratingRepository.upsertRating({ ...(previous ?? { userId, sportId }), overallPercent: overall } as PlayerRating);
      await ratingRepository.insertHistory({ userId, sportId, ratingBefore: before, ratingAfter: overall, changedBy, sourceRef, reason: reason ?? 'recalculate' });
    }
    return overall;
  }

  async resolveOverallPercent(userId: number, sportId: number): Promise<number> {
    const existing = await ratingRepository.getRating(userId, sportId);
    if (existing) return existing.overallPercent;
    const fallback = await ratingRepository.getSelfDeclaredPercent(userId, sportId);
    const evidence = await ratingRepository.getEvidence(userId, sportId);
    const ranked = evidence.map((e) => ({
      value: e.valuePercent,
      weight: EVIDENCE_WEIGHTS[(e.evidenceType as RatingEvidenceType) ?? 'match'] * decayFactor(e.occurredAt),
      occurredAt: e.occurredAt,
    }));
    const overall = computeOverallPercent(ranked, fallback);
    await ratingRepository.upsertRating({ userId, sportId, overallPercent: overall, matchesCount: 0, matchWins: 0, matchDraws: 0, matchLosses: 0 });
    await ratingRepository.insertHistory({ userId, sportId, ratingBefore: null, ratingAfter: overall, changedBy: null, reason: 'initial' });
    return overall;
  }

  /** Count tracked match stats on the player_ratings row (evidence counts). */
  async recordMatchStat(userId: number, sportId: number, outcome: 'win' | 'draw' | 'loss'): Promise<void> {
    const current = await ratingRepository.getRating(userId, sportId) ?? {
      userId,
      sportId,
      overallPercent: await ratingRepository.getSelfDeclaredPercent(userId, sportId),
      matchesCount: 0,
      matchWins: 0,
      matchDraws: 0,
      matchLosses: 0,
    };
    const next: PlayerRating = {
      ...current,
      matchesCount: current.matchesCount + 1,
      matchWins: current.matchWins + (outcome === 'win' ? 1 : 0),
      matchDraws: current.matchDraws + (outcome === 'draw' ? 1 : 0),
      matchLosses: current.matchLosses + (outcome === 'loss' ? 1 : 0),
    };
    await ratingRepository.upsertRating(next);
  }

  async getOverallPercent(userId: number, sportId: number): Promise<number> {
    return this.resolveOverallPercent(userId, sportId);
  }
}

export const ratingService = new RatingService();

export function logRatingError(err: unknown, context: string): void {
  log.error({ err }, `rating.${context} failed`);
}