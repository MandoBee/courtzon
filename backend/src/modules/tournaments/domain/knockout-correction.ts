import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { MatchStatus } from '../../match/domain/match.types.js';
import type { MatchResultSubmissionStatus } from '../../match-result/domain/match-result.types.js';

/**
 * G8-D-KO-CORRECTION — pre-start knockout result-correction contract.
 *
 * A knockout result may be corrected ONLY while every affected downstream
 * bracket match is still SAFELY REPAIRABLE. `closed -> in_progress` on the
 * downstream shared Match is the irreversible live-play boundary: past it the
 * match has been played (or produced a result) and CourtZon will not rewrite
 * history, roll back, or replay.
 *
 * This file is deliberately PURE: it holds the plan shape, the block-reason
 * taxonomy, the deterministic guard predicate and the single shared thrower.
 * No repository, no database, no service. Every caller (the read-only planner
 * and the transactional reconciler) therefore evaluates EXACTLY the same rule
 * from EXACTLY the same place — there is no second, divergent guard.
 */

/** Reconciliation shape of a permitted correction. */
export type KnockoutCorrectionCase =
  /** No downstream bracket target exists (final round / non-bracket) — result + mirror only. */
  | 'A'
  /** The target `tournament_matches` row exists but has NO shared Match — reseat only. */
  | 'B'
  /** The target has a shared Match that has NOT started — remediate, reseat, re-materialise. */
  | 'C';

/** Why a correction is hard-blocked (internal taxonomy — never sent to a client). */
export type KnockoutCorrectionBlockReason =
  | 'tournament_completed'
  | 'downstream_match_in_progress'
  | 'downstream_match_completed'
  | 'downstream_match_void'
  | 'downstream_result_in_flight';

/**
 * Downstream shared-Match statuses that are past the live-play boundary and can
 * therefore never be repaired. `open` / `full` / `closed` / `cancelled` are all
 * pre-start and remain repairable (CASE C).
 */
export const KNOCKOUT_CORRECTION_BLOCKED_MATCH_STATUSES: readonly MatchStatus[] = [
  'in_progress',
  'completed',
  'void',
];

/**
 * Result submission statuses that mean the downstream match already carries a
 * result in flight or settled: a submitted result awaiting confirmation
 * (`pending_confirmation`), a submitted result under dispute (`disputed`), or an
 * already-approved result. A `no_result` / `withdrawn` row carries no score and
 * no outcome, so it is not treated as a result in flight.
 */
export const KNOCKOUT_CORRECTION_BLOCKED_RESULT_STATUSES: readonly MatchResultSubmissionStatus[] = [
  'pending_confirmation',
  'disputed',
  'approved',
];

/** The minimum downstream observation the guard needs. */
export interface KnockoutCorrectionDownstreamState {
  matchStatus: MatchStatus | null;
  resultSubmissionStatus: MatchResultSubmissionStatus | null;
}

/**
 * G8-D-KO-CORRECTION — the single, deterministic correction guard.
 * Returns the block reason, or `null` when the correction is permitted.
 * Pure: same inputs always produce the same verdict, no I/O, no clock, no randomness.
 */
export function evaluateKnockoutCorrectionBlockReason(input: {
  tournamentStatus: string | null | undefined;
  downstream: KnockoutCorrectionDownstreamState | null;
}): KnockoutCorrectionBlockReason | null {
  if (input.tournamentStatus === 'completed') return 'tournament_completed';
  const downstream = input.downstream;
  if (downstream == null) return null;
  if (downstream.matchStatus != null && KNOCKOUT_CORRECTION_BLOCKED_MATCH_STATUSES.includes(downstream.matchStatus)) {
    if (downstream.matchStatus === 'in_progress') return 'downstream_match_in_progress';
    if (downstream.matchStatus === 'completed') return 'downstream_match_completed';
    return 'downstream_match_void';
  }
  if (
    downstream.resultSubmissionStatus != null
    && KNOCKOUT_CORRECTION_BLOCKED_RESULT_STATUSES.includes(downstream.resultSubmissionStatus)
  ) {
    return 'downstream_result_in_flight';
  }
  return null;
}

/**
 * Client-safe message. Deliberately generic: it names the business boundary but
 * exposes NO internal state (statuses, ids, participant identities, records).
 * The precise reason is logged server-side only.
 */
export const KNOCKOUT_CORRECTION_BLOCKED_MESSAGE =
  'This knockout result can no longer be corrected: a downstream bracket match has already entered live play or already holds a result. Correct the downstream match first, or void it, and then correct this result.';

/**
 * The ONE place a blocked correction is turned into a domain error.
 *
 * `ConflictError` (409) with the dedicated `TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED`
 * code — no internal details are attached, so the API layer returns
 * `{ error: 'CONFLICT', code: 'TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED', message }`
 * and never a generic 500.
 */
export function throwKnockoutCorrectionBlocked(reason: KnockoutCorrectionBlockReason): never {
  void reason;
  throw new ConflictError(KNOCKOUT_CORRECTION_BLOCKED_MESSAGE, ErrorCodes.TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED);
}

/**
 * The read-only, deterministic output of the correction planner. Produced BEFORE
 * any write, re-verified inside the correcting transaction, then executed.
 */
export interface KnockoutCorrectionPlan {
  /** The approved result being corrected. */
  resultId: number;
  /** The shared Match the result belongs to (the corrected source). */
  sourceSharedMatchId: number;
  tournamentId: number;
  /** The `tournament_matches` slot that owns the corrected source Match. */
  sourceSlotId: number;
  /** Which reconciliation shape applies. */
  case: KnockoutCorrectionCase;
  /** The bracket target derived from the source slot's `progression_meta` (null → CASE A). */
  targetSlotId: number | null;
  /** The target's existing shared Match (CASE C only). */
  targetSharedMatchId: number | null;
  /** Which side of the target the corrected winner fills. */
  targetSide: 'player1' | 'player2' | null;
  /**
   * The CORRECTED winning tournament participant, resolved participant-aware
   * (singles / doubles / team, side + team_index aware). `null` when the
   * corrected result resolves without a winner (draw / no_result / abandoned),
   * in which case the stale downstream seat is CLEARED rather than replaced.
   */
  winnerParticipantId: number | null;
  /** The legacy primary-member user id of the corrected winner (display mirror). */
  winnerPrimaryUserId: number | null;
  /** The participant currently occupying `targetSide` (audit/diagnostics). */
  previousTargetParticipantId: number | null;
}

/** What the reconciler actually did — surfaced for logging/tests, never for clients. */
export interface KnockoutCorrectionOutcome {
  case: KnockoutCorrectionCase;
  /** The target slot that was reseated (or had its stale seat cleared). */
  reseatedTargetSlotId: number | null;
  /** The shared Match cancelled + court-released because it was stale (CASE C). */
  cancelledSharedMatchId: number | null;
  courtReleased: boolean;
  /** The freshly materialised shared Match for the corrected target (CASE C). */
  rematerialisedSharedMatchId: number | null;
}
