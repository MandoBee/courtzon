import type { RatingEvidenceType } from '../../domain/match-result.types.js';

/** Part B.22 — fixed global evidence-type weights. */
export const EVIDENCE_WEIGHTS: Record<RatingEvidenceType, number> = {
  self_declared: 0.05,
  coach_evaluation: 0.2,
  match_evidence: 0.3,
  tournament_evidence: 0.45,
};

/** Part B.25-26 — one fixed decay formula; half-life 3 months (~90 days). */
export const HALF_LIFE_DAYS = 90;

export function decayFactor(occurredAt: Date | string, now: Date = new Date()): number {
  const occurred = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  const days = Math.max(0, (now.getTime() - occurred.getTime()) / 86_400_000);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

export function clampRating(value: number): number {
  return Math.max(20, Math.min(100, Math.round(value * 100) / 100));
}

/**
 * Part B — Self Declared level mapping (مبتدئ 20 / متوسط 40 / جيد 60 /
 * جيد جدًا 80 / ممتاز 100). Level order is 1..5.
 */
export function selfDeclaredValueForLevel(levelOrder: number): number {
  const order = Math.max(1, Math.min(5, Math.round(levelOrder || 3)));
  return clampRating(20 * order);
}

export interface RankedEvidence {
  value: number;
  weight: number;
  occurredAt: string;
}

/**
 * Part B.29 — Overall Rating = weighted average of all applicable evidence
 * after decay using the fixed evidence-type weights.
 */
export function computeOverallPercent(evidence: RankedEvidence[], fallback: number): number {
  if (!evidence.length) return clampRating(fallback);
  let numerator = 0;
  let denominator = 0;
  for (const e of evidence) {
    numerator += e.value * e.weight;
    denominator += e.weight;
  }
  if (denominator <= 0) return clampRating(fallback);
  return clampRating(numerator / denominator);
}

/**
 * Part C7 — point-in-time rating. Only evidence that occurred at or before
 * `asOf` is eligible (weights passed in must already be decayed to `asOf`).
 */
export function computeOverallPercentAt(evidence: RankedEvidence[], fallback: number, asOf: Date): number {
  const asOfMs = asOf.getTime();
  const eligible = evidence.filter((e) => new Date(e.occurredAt).getTime() <= asOfMs);
  return computeOverallPercent(eligible, fallback);
}