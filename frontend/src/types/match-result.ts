export type MatchResultOutcome = 'completed' | 'retired' | 'walkover' | 'forfeit' | 'abandoned' | 'no_result' | 'disputed';

export type MatchResultSubmissionStatus = 'pending_confirmation' | 'approved' | 'disputed' | 'withdrawn' | 'no_result';

export type ParticipantSide = 'home' | 'away';

export type ParticipantOutcome = 'win' | 'draw' | 'loss';

export type MatchEvidenceValue = 100 | 50 | 0;

export type ScoreStructure = 'sets' | 'goals';

export interface SportScoringRules {
  score_structure: ScoreStructure;
  best_of?: number;
  sets_to_win?: number;
  first_to?: number;
  margin?: number;
  tiebreak_at?: number | null;
  tiebreak_first_to?: number | null;
  tiebreak_win_by?: number | null;
  deuce_rule?: 'standard' | 'golden_point' | null;
  match_duration_minutes?: number;
  halves?: number[];
  extra_time?: boolean;
  penalty_shootout?: boolean;
  draw_allowed: boolean;
  terminations: Array<'retired' | 'walkover' | 'forfeit' | 'abandoned'>;
}

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

export interface SportFormatsGroup {
  format: SportFormat;
  ruleSets: SportRuleSet[];
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
  matchType: 'public' | 'tournament' | 'league';
  playedAt: string;
  branchId: number | null;
  resourceId: number | null;
  tournamentId: number | null;
  academyId: number | null;
  timezone: string | null;
  participantPayload: Array<{ userId: number; side: ParticipantSide; teamIndex: number }>;
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

export interface MatchResultWithParticipants {
  record: MatchResultRecord | null;
  participants: MatchResultParticipant[];
}

export interface ResultListResult {
  records: MatchResultRecord[];
  total: number;
}