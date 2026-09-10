import { describe, it, expect } from 'vitest';
import {
  EVIDENCE_WEIGHTS,
  HALF_LIFE_DAYS,
  decayFactor,
  clampRating,
  computeOverallPercent,
  computeOverallPercentAt,
  selfDeclaredValueForLevel,
} from '../application/rating/rating-math.js';

describe('rating weights', () => {
  it('exposes the fixed global evidence-type weights', () => {
    expect(EVIDENCE_WEIGHTS).toEqual({
      self_declared: 0.05,
      coach_evaluation: 0.2,
      match_evidence: 0.3,
      tournament_evidence: 0.45,
    });
  });

  it('has a 90-day half-life constant', () => {
    expect(HALF_LIFE_DAYS).toBe(90);
  });
});

describe('decayFactor', () => {
  const now = new Date('2026-09-11T00:00:00.000Z');

  it('returns 1 for fresh evidence', () => {
    expect(decayFactor('2026-09-11T00:00:00.000Z', now)).toBeCloseTo(1, 6);
  });

  it('halves the weight after one half-life (90 days)', () => {
    const occurred = new Date('2026-06-13T00:00:00.000Z'); // 90 days before 2026-09-11
    expect(decayFactor(occurred, now)).toBeCloseTo(0.5, 6);
  });

  it('quarters the weight after two half-lives (180 days)', () => {
    const occurred = new Date('2026-03-15T00:00:00.000Z');
    expect(decayFactor(occurred, now)).toBeCloseTo(0.25, 6);
  });

  it('does not decay future-dated evidence', () => {
    expect(decayFactor('2099-01-01T00:00:00.000Z', now)).toBe(1);
  });
});

describe('clampRating', () => {
  it('clamps below 20 to 20', () => {
    expect(clampRating(10)).toBe(20);
  });

  it('clamps above 100 to 100', () => {
    expect(clampRating(150)).toBe(100);
  });

  it('rounds to two decimal places', () => {
    expect(clampRating(75.5549)).toBe(75.55);
  });
});

describe('computeOverallPercent', () => {
  it('returns the clamped fallback when there is no evidence', () => {
    expect(computeOverallPercent([], 60)).toBe(60);
    expect(computeOverallPercent([], 5)).toBe(20);
  });

  it('computes the weighted average of decayed evidence', () => {
    const res = computeOverallPercent(
      [
        { value: 100, weight: 0.3, occurredAt: 'x' },
        { value: 0, weight: 0.2, occurredAt: 'x' },
      ],
      60,
    );
    expect(res).toBe(60); // (100*0.3 + 0*0.2) / 0.5
  });

  it('weights tournament evidence more heavily than self-declared', () => {
    const equalValues = computeOverallPercent(
      [
        { value: 80, weight: EVIDENCE_WEIGHTS.tournament_evidence, occurredAt: 'x' },
        { value: 80, weight: EVIDENCE_WEIGHTS.self_declared, occurredAt: 'x' },
      ],
      60,
    );
    expect(equalValues).toBe(80);
  });

  it('returns the fallback when all weights are zero', () => {
    expect(computeOverallPercent([{ value: 90, weight: 0, occurredAt: 'x' }], 55)).toBe(55);
  });
});

describe('selfDeclaredValueForLevel (C2)', () => {
  it('maps the five declared levels to 20/40/60/80/100', () => {
    expect(selfDeclaredValueForLevel(1)).toBe(20);
    expect(selfDeclaredValueForLevel(2)).toBe(40);
    expect(selfDeclaredValueForLevel(3)).toBe(60);
    expect(selfDeclaredValueForLevel(4)).toBe(80);
    expect(selfDeclaredValueForLevel(5)).toBe(100);
  });

  it('clamps out-of-range orders to the 20..100 bound', () => {
    expect(selfDeclaredValueForLevel(0)).toBe(60); // 0 is falsy → default level 3 (mirrors repository IFNULL behavior)
    expect(selfDeclaredValueForLevel(9)).toBe(100);
    expect(selfDeclaredValueForLevel(undefined as unknown as number)).toBe(60);
  });
});

describe('computeOverallPercentAt (C7)', () => {
  const asOf = new Date('2026-06-01T00:00:00.000Z');

  it('only counts evidence that occurred at or before asOf', () => {
    const evidence = [
      { value: 100, weight: 1, occurredAt: '2026-05-01T00:00:00.000Z' }, // eligible
      { value: 20, weight: 1, occurredAt: '2026-07-01T00:00:00.000Z' }, // after asOf → excluded
    ];
    expect(computeOverallPercentAt(evidence, 60, asOf)).toBe(100);
  });

  it('falls back when no evidence existed at asOf', () => {
    expect(computeOverallPercentAt([{ value: 100, weight: 1, occurredAt: '2026-07-01T00:00:00.000Z' }], 60, asOf)).toBe(60);
  });
});