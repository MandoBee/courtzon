export type MatchResultOutcome = 'completed' | 'retired' | 'walkover' | 'forfeit' | 'abandoned' | 'no_result' | 'disputed';

export type MatchResultSubmissionStatus = 'pending_confirmation' | 'approved' | 'disputed' | 'withdrawn' | 'no_result';

export type ParticipantSide = 'home' | 'away';

export type ParticipantOutcome = 'win' | 'draw' | 'loss';

export type MatchEvidenceValue = 100 | 50 | 0;

export type MatchResultMatchType = 'public' | 'tournament' | 'league';

/** Supported scoring structures. Both are dynamic (configurable per sport/format). */
export type ScoreStructure = 'sets' | 'goals';

/**
 * Canonical scoring / winner / tie-break configuration (Part A.6).
 * The backend validator and the frontend dynamic form are both generated
 * from an instance of this object — no hardcoded sport logic.
 */
export interface SportScoringRules {
  score_structure: ScoreStructure;
  /** sets structure */
  best_of?: number;
  sets_to_win?: number;
  /** games or points target per set */
  first_to?: number;
  margin?: number;
  tiebreak_at?: number | null;
  tiebreak_first_to?: number | null;
  tiebreak_win_by?: number | null;
  deuce_rule?: 'standard' | 'golden_point' | null;
  /** goals structure */
  match_duration_minutes?: number;
  halves?: number[];
  extra_time?: boolean;
  penalty_shootout?: boolean;
  /** common */
  draw_allowed: boolean;
  terminations: Array<'retired' | 'walkover' | 'forfeit' | 'abandoned'>;
}

/** Standings / tie-break criteria per Sport + Format (Part A.8). */
export interface StandingsRules {
  points: { win: number; draw: number; loss: number };
  tiebreakers: Array<{ field: string; direction: 'asc' | 'desc' }>;
}

export interface SportFormat {
  id: number;
  sportId: number;
  slug: string;
  name: string;
  formatType: 'singles' | 'doubles' | 'team';
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface SportRuleSet {
  id: number;
  formatId: number;
  version: number;
  name: string | null;
  rules: SportScoringRules;
  standingsRules: StandingsRules | null;
  isActive: boolean;
  isDefault: boolean;
}

export interface ParticipantSlot {
  userId: number;
  side: ParticipantSide;
  teamIndex: number;
}

export interface SetsScore {
  sets: Array<{ home: number; away: number }>;
}

export interface GoalsScore {
  homeGoals: number;
  awayGoals: number;
  extraTime?: boolean;
  penalties?: { home: number; away: number } | null;
}

export type RawScore = SetsScore | GoalsScore;

/** Payload sent by the UI/player. Winner for 'completed' is derived server-side. */
export interface RawMatchResultPayload {
  outcome: 'completed' | 'retired' | 'walkover' | 'forfeit' | 'abandoned';
  winner?: ParticipantSide | null;
  score?: RawScore | null;
  termination?: { retired_side?: ParticipantSide | null; reason?: string } | null;
}

export interface FinalResult {
  winner: ParticipantSide | 'draw';
  scoreSummary: string;
  sideOutcomes: Record<ParticipantSide, ParticipantOutcome>;
  sideEvidence: Record<ParticipantSide, MatchEvidenceValue>;
}

export interface MatchResultParticipant {
  id: number;
  resultId: number;
  matchId: number;
  userId: number;
  teamIndex: number;
  side: ParticipantSide;
  outcome: ParticipantOutcome;
  matchEvidence: MatchEvidenceValue | null;
  evidenceCounted: boolean;
  ratingSnapshotPercent: number | null;
  ratingBefore: number | null;
  ratingAfter: number | null;
}

export interface MatchResultRecord {
  id: number;
  matchId: number;
  sportId: number;
  formatId: number;
  ruleSetId: number;
  rulesSnapshot: SportScoringRules;
  matchType: MatchResultMatchType;
  playedAt: string;
  branchId: number | null;
  resourceId: number | null;
  tournamentId: number | null;
  academyId: number | null;
  timezone: string | null;
  participantPayload: ParticipantSlot[];
  rawResult: RawMatchResultPayload;
  finalResult: FinalResult | null;
  outcome: MatchResultOutcome;
  submissionStatus: MatchResultSubmissionStatus;
  submittedBy: number | null;
  submittedAt: string | null;
  acceptedBy: number | null;
  acceptedAt: string | null;
  autoApproved: boolean;
  disputedBy: number | null;
  disputedAt: string | null;
  disputeReason: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  submissionDeadlineAt: string | null;
  autoApprovalDeadlineAt: string | null;
  evidenceCounted: boolean;
  ratingAppliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RatingEvidenceType = 'self_declared' | 'coach_evaluation' | 'match_evidence' | 'tournament_evidence';

export interface RatingEvidenceRow {
  id: number;
  userId: number;
  sportId: number;
  evidenceType: RatingEvidenceType;
  valuePercent: number;
  source: string;
  sourceRefId: number | null;
  occurredAt: string;
  meta: Record<string, unknown> | null;
}

export interface PlayerRating {
  userId: number;
  sportId: number;
  overallPercent: number;
  matchesCount: number;
  matchWins: number;
  matchDraws: number;
  matchLosses: number;
}