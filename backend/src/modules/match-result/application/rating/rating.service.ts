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
    const evidence = (await ratingRepository.getEvidence(userId, sportId)).filter((e) => !isInactiveEvidence(e));
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
    const evidence = (await ratingRepository.getEvidence(userId, sportId)).filter((e) => !isInactiveEvidence(e));
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
    const asOfMs = asOfDate.getTime();
    const valid = evidence.filter((e) => isEvidenceActiveAt(e, asOfMs));
    const ranked = valid.map((e) => ({
      value: e.valuePercent,
      weight: EVIDENCE_WEIGHTS[(e.evidenceType as RatingEvidenceType) ?? 'match'] * decayFactor(e.occurredAt, asOfDate),
      occurredAt: e.occurredAt,
    }));
    return computeOverallPercentAt(ranked, fallback, asOfDate);
  }

  /**
   * Round 2/3 — flip the active/counting state of a source's evidence
   * (e.g. all Match Evidence rows for a result) without deleting history.
   * `asOf` records when the flip happened for Point-in-Time correctness.
   */
  async setMatchEvidenceActive(source: string, sourceRefId: number, active: boolean, asOf?: string): Promise<void> {
    await ratingRepository.setEvidenceActive(source, sourceRefId, active, asOf ?? new Date().toISOString());
  }

  /**
   * Round 2 (Item 2) / Round 3 — immediate Overall Rating recalculation after a
   * self-declared level/sport change. Only touches sports where the player has
   * Self Declared evidence or their declared main sport. Idempotent: identical
   * declarations produce no evidence/history churn. Per-sport failures are logged
   * (never silently swallowed) and do not block other sports; self-declared
   * evidence is reconciled from the profile on every rating computation, so a
   * failed sport self-heals on the next recalculation while the independent
   * profile update always succeeds.
   */
  async recalculateSelfDeclaredForUser(userId: number): Promise<void> {
    const sportIds = await ratingRepository.getSelfDeclaredSportIds(userId);
    const mainSport = await ratingRepository.getMainSportId(userId);
    const targets = new Set(sportIds);
    if (mainSport != null) targets.add(mainSport);
    for (const sportId of targets) {
      try {
        await this.syncSelfDeclaredEvidence(userId, sportId);
        await this.recalculate(userId, sportId, null, 'self-declared level/sport updated');
      } catch (err) {
        log.error({ err, userId, sportId }, 'self-declared rating recalculation failed');
      }
    }
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

/** Round 2 (Item 1) — evidence flagged inactive (meta.active === false) is stored
 *  but never contributes to current Overall Rating. */
function isInactiveEvidence(e: { meta?: Record<string, unknown> | null }): boolean {
  return e.meta != null && e.meta.active === false;
}

/**
 * Round 3/4 — evidence validity evaluated AS OF a timestamp.
 *
 * Resolution order:
 *  1. `meta.validity_history` (array of {active, at}) when present — the latest
 *     transition at or before asOf decides; before the first transition the
 *     evidence is treated as ACTIVE (evidence is born active).
 *  2. Round-3 `invalidated_at`/`reactivated_at` semantics for existing rows
 *     that only carry a single invalidation cycle.
 *  3. Legacy fallback: a row is active unless explicitly flagged
 *     `active === false`.
 *
 * The CURRENT active state never rewrites historical state.
 */
function isEvidenceActiveAt(e: { meta?: Record<string, unknown> | null }, asOfMs: number): boolean {
  const meta = e.meta ?? {};
  const history = Array.isArray(meta.validity_history) ? meta.validity_history : null;
  if (history && history.length) {
    let state = true;
    for (const t of history) {
      const tMs = new Date(String(t.at)).getTime();
      if (tMs <= asOfMs) state = Boolean(t.active);
      else break;
    }
    return state;
  }
  const invalidatedAt = meta.invalidated_at;
  if (invalidatedAt == null) {
    return meta.active !== false;
  }
  const invMs = new Date(String(invalidatedAt)).getTime();
  if (asOfMs < invMs) return true;
  const reactivatedAt = meta.reactivated_at;
  if (reactivatedAt != null) {
    const reMs = new Date(String(reactivatedAt)).getTime();
    if (asOfMs >= reMs) return true;
  }
  return false;
}

export function logRatingError(err: unknown, context: string): void {
  log.error({ err }, `rating.${context} failed`);
}