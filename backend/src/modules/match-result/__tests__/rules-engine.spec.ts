import { describe, it, expect } from 'vitest';
import {
  validateAndComputeFinal,
  winnerSideForTermination,
  outcomeCountsForRating,
  RulesValidationError,
} from '../application/rules/rules-engine.js';
import type { SportScoringRules, RawMatchResultPayload } from '../domain/match-result.types.js';

const setsRules = (overrides: Partial<SportScoringRules> = {}): SportScoringRules => ({
  score_structure: 'sets',
  best_of: 3,
  sets_to_win: 2,
  first_to: 6,
  margin: 2,
  draw_allowed: false,
  terminations: ['retired', 'walkover', 'forfeit', 'abandoned'],
  ...overrides,
});

const goalsRules = (overrides: Partial<SportScoringRules> = {}): SportScoringRules => ({
  score_structure: 'goals',
  draw_allowed: false,
  terminations: ['abandoned'],
  ...overrides,
});

describe('validateAndComputeFinal — sets structure', () => {
  it('accepts a valid best-of-3 result and derives the winner server-side', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { sets: [{ home: 6, away: 4 }, { home: 4, away: 6 }, { home: 6, away: 3 }] },
    };
    const res = validateAndComputeFinal(payload, setsRules());
    expect(res.winner).toBe('home');
    expect(res.scoreSummary).toBe('2-1 (6-4, 4-6, 6-3)');
    expect(res.finalResult.scoreSummary).toBe(res.scoreSummary);
    expect(res.finalResult.sideEvidence).toEqual({ home: 100, away: 0 });
    expect(res.finalResult.sideOutcomes).toEqual({ home: 'win', away: 'loss' });
  });

  it('rejects a set that does not reach first_to by margin', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { sets: [{ home: 6, away: 5 }] },
    };
    expect(() => validateAndComputeFinal(payload, setsRules())).toThrow(RulesValidationError);
  });

  it('accepts a tiebreak set when tiebreak is configured (7-6)', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { sets: [{ home: 7, away: 6 }, { home: 6, away: 3 }] },
    };
    const res = validateAndComputeFinal(payload, setsRules({ tiebreak_at: 6, tiebreak_first_to: 7 }));
    expect(res.winner).toBe('home');
  });

  it('rejects 7-6 without a tiebreak rule configured', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { sets: [{ home: 7, away: 6 }, { home: 6, away: 3 }] },
    };
    expect(() => validateAndComputeFinal(payload, setsRules())).toThrow(RulesValidationError);
  });

  it('rejects a scoreline that exceeds best_of', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { sets: [{ home: 6, away: 4 }, { home: 6, away: 3 }, { home: 3, away: 6 }, { home: 6, away: 4 }] },
    };
    expect(() => validateAndComputeFinal(payload, setsRules())).toThrow(/at most 3 sets/);
  });

  it('rejects extra sets after the winner is already determined', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { sets: [{ home: 6, away: 4 }, { home: 6, away: 4 }, { home: 3, away: 6 }] },
    };
    expect(() => validateAndComputeFinal(payload, setsRules())).toThrow(/No extra sets/);
  });

  it('rejects an incomplete best-of-3 where nobody reached 2 sets', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { sets: [{ home: 6, away: 4 }] },
    };
    expect(() => validateAndComputeFinal(payload, setsRules())).toThrow(/2 sets are required/);
  });
});

describe('validateAndComputeFinal — goals structure', () => {
  it('accepts a goals result and derives winner home', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { homeGoals: 3, awayGoals: 1 },
    };
    const res = validateAndComputeFinal(payload, goalsRules());
    expect(res.winner).toBe('home');
    expect(res.scoreSummary).toBe('3-1');
    expect(res.finalResult.sideEvidence).toEqual({ home: 100, away: 0 });
  });

  it('allows a draw when draw_allowed is true', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { homeGoals: 2, awayGoals: 2 },
    };
    const res = validateAndComputeFinal(payload, goalsRules({ draw_allowed: true }));
    expect(res.winner).toBe('draw');
    expect(res.finalResult.sideEvidence).toEqual({ home: 50, away: 50 });
    expect(res.finalResult.sideOutcomes).toEqual({ home: 'draw', away: 'draw' });
  });

  it('rejects a draw when draw_allowed is false', () => {
    const payload: RawMatchResultPayload = {
      outcome: 'completed',
      score: { homeGoals: 1, awayGoals: 1 },
    };
    expect(() => validateAndComputeFinal(payload, goalsRules())).toThrow(/does not allow drawn results/);
  });
});

describe('validateAndComputeFinal — terminations', () => {
  it('retired: winner is the side that did NOT retire', () => {
    const payload: RawMatchResultPayload = { outcome: 'retired', termination: { retired_side: 'home' } };
    const res = validateAndComputeFinal(payload, setsRules());
    expect(res.winner).toBe('away');
    expect(res.scoreSummary).toBe('retired');
  });

  it('retired without retired_side is rejected', () => {
    expect(() => winnerSideForTermination('retired', { outcome: 'retired' })).toThrow(/retired.*requires.*side/i);
  });

  it('walkover requires a winner side', () => {
    const payload: RawMatchResultPayload = { outcome: 'walkover', winner: 'home' };
    const res = validateAndComputeFinal(payload, setsRules());
    expect(res.winner).toBe('home');
    expect(() => validateAndComputeFinal({ outcome: 'walkover' }, setsRules())).toThrow(RulesValidationError);
  });

  it('abandoned results are neutral (no winner)', () => {
    const res = validateAndComputeFinal({ outcome: 'abandoned' }, setsRules());
    expect(res.winner).toBeNull();
    expect(res.finalResult.winner).toBe('draw');
    expect(res.finalResult.sideEvidence).toEqual({ home: 50, away: 50 });
  });

  it('rejects an outcome that the sport format does not support', () => {
    expect(() => validateAndComputeFinal({ outcome: 'forfeit', winner: 'home' }, goalsRules())).toThrow(/not supported/);
  });
});

describe('outcomeCountsForRating', () => {
  it('counts completed/retired/walkover/forfeit', () => {
    for (const outcome of ['completed', 'retired', 'walkover', 'forfeit']) {
      expect(outcomeCountsForRating(outcome)).toBe(true);
    }
  });

  it('does not count abandoned/no_result/disputed', () => {
    for (const outcome of ['abandoned', 'no_result', 'disputed']) {
      expect(outcomeCountsForRating(outcome)).toBe(false);
    }
  });
});