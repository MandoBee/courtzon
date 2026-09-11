// ============================================================================
// Academy G2 — Recurring Scheduling + Pending Court Holds (domain types)
// ============================================================================

export type AcademyScheduleWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const ACADEMY_SCHEDULE_WEEKDAYS: AcademyScheduleWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export type AcademyScheduleStatus = 'active' | 'paused' | 'archived';

/** A single recurring schedule definition belonging to an Academy group. */
export interface AcademySchedule {
  id: number;
  group_id: number;
  name: string | null;
  weekdays: AcademyScheduleWeekday[];
  start_date: string;
  end_date: string;
  local_start_time: string;
  local_end_time: string;
  timezone: string;
  branch_id: number | null;
  preferred_court_id: number | null;
  pending_priority_minutes: number;
  status: AcademyScheduleStatus;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export type AcademyReservationStatus = 'pending_court' | 'conflict' | 'pending_expired' | 'deferred' | 'resolved';

export type AcademySessionSourceType = 'manual' | 'recurring';

/** Additive G2 fields carried on academy_group_sessions rows. */
export interface AcademyGroupSession {
  id: number;
  group_id: number;
  schedule_id: number | null;
  source_type: AcademySessionSourceType;
  session_date: string;
  start_time: string;
  end_time: string;
  court_id: number | null;
  coach_id: number | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  timezone: string | null;
  start_at_utc: string | null;
  end_at_utc: string | null;
  reservation_status: AcademyReservationStatus | null;
  priority_seq: number | null;
  pending_expires_at: string | null;
  pending_resolved_at: string | null;
  pending_resolved_by: number | null;
  original_session_date: string | null;
  original_start_time: string | null;
  original_end_time: string | null;
  original_court_id: number | null;
  conflict_metadata: Record<string, any> | null;
  generation_ref: string | null;
  group_name?: string | null;
  court_name?: string | null;
  coach_name?: string | null;
  schedule_name?: string | null;
}

/** A concrete occurrence slot for a schedule. */
export interface AcademyScheduleOccurrence {
  date: string;
  start_time: string;
  end_time: string;
}

/** Conflict engine evaluation result for a candidate slot. */
export type AcademyConflictState =
  | 'AVAILABLE'
  | 'PENDING_COURT'
  | 'CONFLICT'
  | 'DEFERRED'
  | 'ADMIN_TIME_RESOLUTION_REQUIRED'
  | 'EXPIRED_PENDING_DECISION';

export type AcademyConflictReason =
  | 'player_booking_conflict'
  | 'academy_conflict'
  | 'lower_priority'
  | 'resource_unavailable'
  | 'resource_not_in_branch'
  | 'outside_operating_hours'
  | 'dst_gap'
  | 'dst_ambiguous'
  | 'within_player_horizon'
  | 'schedule_changed'
  | 'no_longer_in_schedule'
  | 'expired_pending_decision';

export interface AcademyConflictAlternative {
  court_id: number;
  court_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  state: AcademyConflictState;
}

export interface AcademyConflictEvaluation {
  sessionId?: number;
  court_id: number;
  session_date: string;
  start_time: string;
  end_time: string;
  state: AcademyConflictState;
  reason: AcademyConflictReason | null;
  startAtUtc: string | null;
  endAtUtc: string | null;
  /** Deterministic server-side priority (schedule.id) of this candidate. */
  prioritySeq: number;
  conflict: {
    type: 'booking' | 'academy_session' | null;
    id: number | null;
    prioritySeq: number | null;
    detail?: string | null;
  } | null;
  alternatives: AcademyConflictAlternative[] | null;
}

/** Result of running a whole schedule evaluation (idempotent generation + re-evaluation). */
export interface AcademyScheduleReview {
  scheduleId: number;
  generated: number;
  reEvaluated: number;
  untouched: number;
  held: number;
  deferred: number;
  conflicts: number;
  adminTimeResolutionRequired: number;
  expandedPendingDecision: number;
  sessions: AcademyGroupSession[];
}