/**
 * GSK (Group Stage + Knockout) — CONTRACT-ONLY types.
 *
 * Step 3B-1 introduces the persistent data contract for the future GSK engine.
 * These types describe the CONFIGURATION only. Nothing here executes groups,
 * qualification, matches or knockout seeding — those belong to Step 3B-2+.
 *
 * The same structure is validated at the API boundary by `GskConfigurationSchema`
 * in `presentation/tournament.dto.ts` (zod). `TournamentStage.config` persists
 * this object as JSON on `tournament_stages.config` (nullable; NULL = unconfigured).
 */

export type GskKnockoutStart =
  | 'round_of_16'
  | 'quarterfinals'
  | 'semifinals'
  | 'final'
  | 'first_valid_round';

export interface GskQualificationRule {
  /** How many qualify directly from every group (1 ≤ N ≤ participantsPerGroup). */
  topPerGroup: number;
  /** Best third-placed participants that qualify across all groups (0 = none; ≤ groupCount). */
  bestThirdPlaces?: number;
  /** Ordering of the qualified participant list fed into the knockout stage. */
  ordering: 'seed' | 'points' | 'rank';
}

export interface GskGroupStageConfig {
  groupCount: number;
  participantsPerGroup: number;
  format: 'round_robin';
  qualification: GskQualificationRule;
}

export interface GskKnockoutConfig {
  startingRound: GskKnockoutStart;
  seeding: 'manual' | 'automatic';
  /** Group winners are kept apart in the early knockout rounds where possible. */
  separateGroupWinners: boolean;
  /** Members of the same group cannot meet again before a configurable point. */
  preventSameGroupRematch: boolean;
  /** Explicit byes are allowed when the qualified count is not a power of two. */
  allowByes: boolean;
  /** Explicit play-in layer count when the qualified count needs one (0 = none). */
  playInRounds?: number;
}

export interface GskConfiguration {
  format: 'group_stage_knockout';
  groupStage: GskGroupStageConfig;
  knockout: GskKnockoutConfig;
}