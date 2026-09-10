import type {
  FinalResult,
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

/** Whether a set/point score {home, away} is already decisive under rules. */
function isDecisiveSet(home: number, away: number, rules: SportScoringRules): { side: ParticipantSide; isTiebreak: boolean } | null {
  const firstTo = rules.first_to ?? 6;
  const margin = rules.margin ?? 1;
  if (home < 0 || away < 0) return null;

  const winnerGames = Math.max(home, away);
  const loserGames = Math.min(home, away);
  const winnerSide: ParticipantSide = home > away ? 'home' : 'away';

  // Tiebreak set (e.g. 7-6 in tennis / padel when a tiebreak is configured).
  if (rules.tiebreak_at != null && rules.tiebreak_first_to != null) {
    if (loserGames === rules.tiebreak_at && winnerGames === rules.tiebreak_first_to) {
      return { side: winnerSide, isTiebreak: true };
    }
  }

  // Regular decisive set.
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

function validateGoalsPayload(score: RawScore, rules: SportScoringRules): { winner: ParticipantSide | 'draw'; goals: { home: number; away: number } } {
  if (!('homeGoals' in score) || !('awayGoals' in score)) {
    throw new RulesValidationError('A goal-based format requires home and away goals');
  }
  const { homeGoals, awayGoals } = score as { homeGoals: number; awayGoals: number };
  if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0) {
    throw new RulesValidationError('Goals must be non-negative whole numbers');
  }

  if (homeGoals === awayGoals) {
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
    const g = score as { homeGoals: number; awayGoals: number };
    return `${g.homeGoals}-${g.awayGoals}`;
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