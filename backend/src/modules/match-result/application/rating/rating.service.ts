import { ratingRepository } from '../../infrastructure/rating.repository.js';
import type { PlayerRating, RatingEvidenceType } from '../../domain/match-result.types.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';
import {
  EVIDENCE_WEIGHTS,
  HALF_LIFE_DAYS,
  decayFactor,
  clampRating,
  computeOverallPercent,
  computeOverallPercentAt,
  selfDeclaredValueForLevel,
  type RankedEvidence,
} from './rating-math.js';

const log = createModuleLogger('match-result-rating');

export { EVIDENCE_WEIGHTS, HALF_LIFE_DAYS, decayFactor, clampRating, computeOverallPercent, computeOverallPercentAt, selfDeclaredValueForLevel };
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
    await this.syncSelfDeclaredEvidence(userId, sportId);
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
    await this.syncSelfDeclaredEvidence(userId, sportId);
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

  /**
   * Part C2 — Self Declared must participate as real evidence (5%) in the
   * weighted model, not just act as a fallback baseline. Idempotently syncs the
   * evidence row from the player's declared level (per sport).
   */
  async syncSelfDeclaredEvidence(userId: number, sportId: number): Promise<void> {
    const profile = await ratingRepository.getProfileLevelInfo(userId);
    if (!profile) return;
    const valuePercent = selfDeclaredValueForLevel(profile.levelOrder);
    const existing = await ratingRepository.getSelfDeclaredEvidence(userId, sportId);
    if (existing && Number(existing.valuePercent) === valuePercent && existing.occurredAt === profile.updatedAt) {
      return;
    }
    await ratingRepository.upsertEvidence({
      userId,
      sportId,
      evidenceType: 'self_declared',
      valuePercent,
      source: 'self_declared',
      sourceRefId: profile.profileId,
      occurredAt: profile.updatedAt,
    });
  }

  /**
   * Part C7 — rating context as it existed at `asOf` (e.g. match played_at).
   * Only evidence that occurred at/before `asOf` is eligible, decayed to `asOf`.
   */
  async resolveOverallPercentAt(userId: number, sportId: number, asOf: Date | string): Promise<number> {
    const evidence = await ratingRepository.getEvidence(userId, sportId);
    const fallback = await ratingRepository.getSelfDeclaredPercent(userId, sportId);
    const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
    const ranked = evidence.map((e) => ({
      value: e.valuePercent,
      weight: EVIDENCE_WEIGHTS[(e.evidenceType as RatingEvidenceType) ?? 'match'] * decayFactor(e.occurredAt, asOfDate),
      occurredAt: e.occurredAt,
    }));
    return computeOverallPercentAt(ranked, fallback, asOfDate);
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

  /**
   * Part C1 — adjust stored match stats after a correction changes an outcome,
   * without double-counting (matches count stays, W/D/L shifts).
   */
  async adjustMatchStat(userId: number, sportId: number, oldOutcome: 'win' | 'draw' | 'loss' | null, newOutcome: 'win' | 'draw' | 'loss'): Promise<void> {
    const win = (o: 'win' | 'draw' | 'loss' | null) => (o === 'win' ? 1 : 0);
    const draw = (o: 'win' | 'draw' | 'loss' | null) => (o === 'draw' ? 1 : 0);
    const loss = (o: 'win' | 'draw' | 'loss' | null) => (o === 'loss' ? 1 : 0);
    await ratingRepository.adjustStatDelta(userId, sportId, {
      matches: 0,
      wins: win(newOutcome) - win(oldOutcome),
      draws: draw(newOutcome) - draw(oldOutcome),
      losses: loss(newOutcome) - loss(oldOutcome),
    });
  }

  async getOverallPercent(userId: number, sportId: number): Promise<number> {
    return this.resolveOverallPercent(userId, sportId);
  }
}

export const ratingService = new RatingService();

export function logRatingError(err: unknown, context: string): void {
  log.error({ err }, `rating.${context} failed`);
}