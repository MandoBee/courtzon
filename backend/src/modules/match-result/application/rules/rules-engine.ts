import type {
  FinalResult,
  GoalsScore,
  ParticipantOutcome,
  ParticipantSide,
  RawMatchResultPayload,
  RawScore,
  SportScoringRules,
} from '../../domain/match-result.types.js';

/**
 * Dynamic Rules Engine (Part A). Validates a raw result payload against the
 * active Sport + Format + Rules Version and computes the authoritative final
 * result. No sport-specific logic is hardcoded anywhere — everything derives
 * from the provided rules object.
 */

export class RulesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesValidationError';
  }
}

function emph(v: unknown): string {
  return String(v);
}

function assertDone(condition: boolean, message: string): void {
  if (!condition) throw new RulesValidationError(message);
}

/**
 * Phase 1 — fail-closed configuration validation. Unsupported or incomplete
 * scoring configurations must never silently produce a confirmed result.
 * Legacy rule sets with genuinely optional fields missing keep their defaults
 * (first_to 6 / margin 1 / deuce standard / …); only structurally impossible
 * configurations are rejected (unknown deuce_rule values, a tiebreak threshold
 * that cannot be resolved, impossible set targets).
 */
export function assertScoringConfiguration(rules: SportScoringRules): void {
  const deuce = rules.deuce_rule;
  if (deuce != null && deuce !== 'standard' && deuce !== 'golden_point') {
    throw new RulesValidationError(`Unsupported deuce_rule "${emph(deuce)}" — expected 'standard' or 'golden_point'`);
  }

  if (rules.score_structure === 'sets') {
    if (rules.tiebreak_at != null && rules.tiebreak_first_to == null) {
      throw new RulesValidationError(
        `A tiebreak threshold (tiebreak_at=${emph(rules.tiebreak_at)}) requires tiebreak_first_to so the tiebreak score can be validated`,
      );
    }
    if (rules.tiebreak_at != null && rules.tiebreak_first_to != null && rules.tiebreak_first_to <= rules.tiebreak_at) {
      throw new RulesValidationError('tiebreak_first_to must be greater than tiebreak_at');
    }
    if (rules.best_of != null && rules.best_of < 1) {
      throw new RulesValidationError('best_of must be at least 1');
    }
    if (rules.first_to != null && rules.first_to < 1) {
      throw new RulesValidationError('first_to must be at least 1');
    }
    if (rules.margin != null && rules.margin < 1) {
      throw new RulesValidationError('margin must be a positive number of games');
    }
  }
}

/** Whether a set/point score {home, away} is already decisive under rules. */
function isDecisiveSet(home: number, away: number, rules: SportScoringRules): { side: ParticipantSide; isTiebreak: boolean } | null {
  const firstTo = rules.first_to ?? 6;
  const margin = rules.margin ?? 1;
  if (home < 0 || away < 0) return null;

  const winnerGames = Math.max(home, away);
  const loserGames = Math.min(home, away);
  const winnerSide: ParticipantSide = home > away ? 'home' : 'away';

  // Phase 1 — once a set reaches the configured tiebreak threshold it can ONLY
  // be decided by the configured tiebreak rule. The plain-margin path must
  // never confirm it (e.g. 6-6 counted as a "margin-1 win", or 8-6 when a
  // tiebreak is configured at 6-6): that would silently confirm an illegal
  // scoreline from an incomplete configuration.
  if (rules.tiebreak_at != null && loserGames >= rules.tiebreak_at) {
    if (rules.tiebreak_first_to == null) return null;
    if (loserGames === rules.tiebreak_at && winnerGames === rules.tiebreak_first_to) {
      return { side: winnerSide, isTiebreak: true };
    }
    return null;
  }

  // Regular decisive set (advantage sets may extend past first_to).
  if (winnerGames >= firstTo && winnerGames - loserGames >= margin) {
    return { side: winnerSide, isTiebreak: false };
  }

  return null;
}

function validateSetsPayload(score: RawScore, rules: SportScoringRules): { winner: ParticipantSide; setsWon: Record<ParticipantSide, number> } {
  if (!('sets' in score) || !Array.isArray(score.sets) || score.sets.length === 0) {
    throw new RulesValidationError('A scored outcome requires at least one set for this format');
  }

  const bestOf = rules.best_of ?? 1;
  const setsToWin = rules.sets_to_win ?? Math.floor(bestOf / 2) + 1;
  const setsWon: Record<ParticipantSide, number> = { home: 0, away: 0 };
  let finished = false;

  assertDone(score.sets.length <= bestOf, `This format allows at most ${bestOf} sets`);

  for (const set of score.sets) {
    if (!Number.isInteger(set.home) || !Number.isInteger(set.away) || set.home < 0 || set.away < 0) {
      throw new RulesValidationError('Set scores must be non-negative whole numbers');
    }
    assertDone(!finished, 'No extra sets are allowed once the winner is determined');

    const decisive = isDecisiveSet(set.home, set.away, rules);
    if (!decisive) {
      throw new RulesValidationError(
        `Invalid set score ${emph(set.home)}-${emph(set.away)}` +
        (rules.tiebreak_at != null && rules.tiebreak_first_to != null
          ? ` — a set must reach ${rules.first_to} by ${rules.margin} (or a tiebreak ${rules.tiebreak_first_to}-${rules.tiebreak_at})`
          : ` — a set must reach ${rules.first_to} by ${rules.margin}`),
      );
    }
    setsWon[decisive.side] += 1;
    if (setsWon[decisive.side] >= setsToWin) finished = true;
  }

  assertDone(finished, `Result is incomplete — ${setsToWin} sets are required to win this format`);

  const winner: ParticipantSide = setsWon.home > setsWon.away ? 'home' : 'away';
  assertDone(setsWon.home !== setsWon.away, 'This format does not allow a draw');
  return { winner, setsWon };
}

function validateGoalsPayload(score: RawScore, rules: SportScoringRules): { winner: ParticipantSide | 'draw'; goals: { home: number; away: number }; resolvedBy?: 'penalties' } {
  if (!('homeGoals' in score) || !('awayGoals' in score)) {
    throw new RulesValidationError('A goal-based format requires home and away goals');
  }
  const g = score as GoalsScore;
  const { homeGoals, awayGoals } = g;
  if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0) {
    throw new RulesValidationError('Goals must be non-negative whole numbers');
  }

  // Phase 1 — a penalty shootout may ONLY break a level goals score. A
  // scoreline that already differs cannot also carry penalties (contradictory
  // evidence must never produce a confirmed outcome).
  if (g.penalties != null && homeGoals !== awayGoals) {
    throw new RulesValidationError('Penalties can only be used to break a draw — the goals differ');
  }

  if (homeGoals === awayGoals) {
    // Phase 1 — drawn-result resolution order:
    //   1. penalties provided → shootout breaks the tie (shootout must be
    //      configured; a level shootout cannot be confirmed);
    //   2. format allows draws → legitimate draw (extra time doesn't change it);
    //   3. otherwise extra time alone cannot decide a level knockout score.
    if (g.penalties != null) {
      assertDone(rules.penalty_shootout === true, 'This format does not allow a penalty shootout');
      const ph = g.penalties.home;
      const pa = g.penalties.away;
      if (!Number.isInteger(ph) || !Number.isInteger(pa) || ph < 0 || pa < 0) {
        throw new RulesValidationError('Penalty shootout scores must be non-negative whole numbers');
      }
      if (ph === pa) {
        throw new RulesValidationError('A penalty shootout cannot end level — the result cannot be confirmed');
      }
      return { winner: ph > pa ? 'home' : 'away', goals: { home: homeGoals, away: awayGoals }, resolvedBy: 'penalties' };
    }
    if (rules.draw_allowed) {
      return { winner: 'draw', goals: { home: homeGoals, away: awayGoals } };
    }
    if (g.extraTime === true) {
      assertDone(rules.extra_time === true, 'Extra time is not configured for this format');
      // Extra time was played but the score is still level with no shootout
      // data — the contract provides no way to determine a winner.
      throw new RulesValidationError('Extra time ended level with no penalty shootout — the result cannot be confirmed');
    }
    assertDone(rules.draw_allowed, 'This format does not allow drawn results');
    return { winner: 'draw', goals: { home: homeGoals, away: awayGoals } };
  }
  return { winner: homeGoals > awayGoals ? 'home' : 'away', goals: { home: homeGoals, away: awayGoals } };
}

function buildScoreSummary(score: RawScore, rules: SportScoringRules, setsWon?: Record<ParticipantSide, number>): string {
  if ('sets' in score && Array.isArray(score.sets)) {
    const setSummary = score.sets.map((s) => `${s.home}-${s.away}`).join(', ');
    if (setsWon) {
      return `${setsWon.home}-${setsWon.away} (${setSummary})`;
    }
    return setSummary;
  }
  if ('homeGoals' in score) {
    const g = score as GoalsScore;
    let summary = `${g.homeGoals}-${g.awayGoals}`;
    if (g.penalties != null) {
      summary += ` (${g.penalties.home}-${g.penalties.away} pens)`;
    }
    return summary;
  }
  return '';
}

/** Winner side for non-completed outcomes (retired/walkover/forfeit). */
export function winnerSideForTermination(outcome: 'retired' | 'walkover' | 'forfeit', payload: RawMatchResultPayload): ParticipantSide {
  if (outcome === 'retired') {
    const retiredSide = payload.termination?.retired_side;
    assertDone(retiredSide === 'home' || retiredSide === 'away', 'A retired result requires selecting the side that retired');
    return retiredSide === 'home' ? 'away' : 'home';
  }
  assertDone(payload.winner === 'home' || payload.winner === 'away', `${outcome} requires a winner side`);
  return payload.winner as ParticipantSide;
}

export interface ValidatedResult {
  outcome: 'completed' | 'retired' | 'walkover' | 'forfeit' | 'abandoned';
  winner: ParticipantSide | 'draw' | null;
  scoreSummary: string;
  finalResult: FinalResult;
}

/**
 * Validate a raw result payload against the active rules and compute the
 * authoritative final result (participant outcomes + match evidence).
 */
export function validateAndComputeFinal(
  payload: RawMatchResultPayload,
  rules: SportScoringRules,
): ValidatedResult {
  // Phase 1 — reject unsupported/incomplete scoring configurations up front so
  // no payload can be confirmed against them.
  assertScoringConfiguration(rules);

  const allowedTerminations = (rules.terminations ?? []) as string[];
  assertDone(
    allowedTerminations.includes(payload.outcome) || payload.outcome === 'completed',
    `Outcome "${payload.outcome}" is not supported by this sport format`,
  );

  let winner: ParticipantSide | 'draw' | null = null;
  let scoreSummary = '';

  if (payload.outcome === 'completed') {
    assertDone(payload.score != null, 'A completed result requires a score');
    const score = payload.score as RawScore;
    if (rules.score_structure === 'goals') {
      const { winner: w, goals } = validateGoalsPayload(score, rules);
      winner = w;
      scoreSummary = buildScoreSummary(score, rules);
      if (w === 'draw' && payload.winner == null) {
        // draw is the only valid "winner" for a draw-allowed goals match
      }
    } else {
      const { winner: w, setsWon } = validateSetsPayload(score, rules);
      winner = w;
      scoreSummary = buildScoreSummary(score, rules, setsWon);
    }
  } else if (payload.outcome === 'abandoned') {
    winner = null;
    scoreSummary = 'abandoned';
  } else {
    winner = winnerSideForTermination(payload.outcome as 'retired' | 'walkover' | 'forfeit', payload);
    scoreSummary = payload.outcome;
  }

  const sideOutcomes: Record<ParticipantSide, ParticipantOutcome> =
    winner === 'draw'
      ? { home: 'draw', away: 'draw' }
      : winner === 'home'
        ? { home: 'win', away: 'loss' }
        : winner === 'away'
          ? { home: 'loss', away: 'win' }
          : { home: 'draw', away: 'draw' };

  const sideEvidence: Record<ParticipantSide, 100 | 50 | 0> = {
    home: sideOutcomes.home === 'win' ? 100 : sideOutcomes.home === 'draw' ? 50 : 0,
    away: sideOutcomes.away === 'win' ? 100 : sideOutcomes.away === 'draw' ? 50 : 0,
  };

  return {
    outcome: payload.outcome,
    winner,
    scoreSummary,
    finalResult: {
      winner: winner ?? 'draw',
      scoreSummary,
      sideOutcomes,
      sideEvidence,
    },
  };
}

/** Whether a match evidence payload is eligible to count for rating under a given outcome. */
export function outcomeCountsForRating(outcome: string): boolean {
  return outcome === 'completed' || outcome === 'retired' || outcome === 'walkover' || outcome === 'forfeit';
}