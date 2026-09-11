import api from './api';
import type { PaginatedResult } from '../types/api';

interface AcademyProgram {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category: string;
  level: string | null;
  season: string | null;
  capacity: number;
  price: number;
  currency: string;
  price_type: 'FREE' | 'FIXED' | 'MEMBERS_ONLY';
  status: string;
  is_public: boolean;
  // G1 — ownership + confirmation foundation
  organisation_id: number | null;
  branch_id: number | null;
  sport_id: number | null;
  organisation_name?: string | null;
  branch_name?: string | null;
  sport_name?: string | null;
  lifecycle_state: 'setup' | 'confirmed';
  confirmed_at: string | null;
  confirmed_by: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AcademyGroup {
  id: number;
  program_id: number;
  name: string;
  coach_id: number | null;
  coach_name: string | null;
  coach_relation?: 'contracted' | 'external' | null;
  comp_type: 'fixed_total' | 'fixed_per_session' | 'percent_gross' | null;
  comp_value: number | null;
  comp_currency: string | null;
  coach_locked_at: string | null;
  capacity: number;
  status: string;
  created_at: string;
  program_name?: string;
  organisation_id?: number | null;
  branch_id?: number | null;
}

interface AcademyEnrollment {
  id: number;
  player_id: number;
  program_id: number;
  group_id: number | null;
  membership_id: number | null;
  status: string;
  waiting_order: number | null;
  enrolled_at: string;
  player_name?: string;
  program_name?: string;
  group_name?: string;
  // G3 — manual/offline payment acknowledgment
  payment_confirmed_at: string | null;
  payment_confirmed_by?: number | null;
}

interface GroupSession {
  id: number;
  group_id: number;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  court_id: number | null;
  coach_id: number | null;
  status: string;
  group_name?: string;
  court_name?: string;
  coach_name?: string;
}

interface AttendanceRecord {
  id: number;
  group_session_id: number;
  enrollment_id: number;
  attendance_status: string;
  notes: string | null;
  player_name?: string;
  session_date?: string;
}

interface AcademyDashboard {
  total_programs: number;
  published_programs: number;
  running_programs: number;
  total_groups: number;
  total_players: number;
  waiting_list_count: number;
  capacity_utilization: number;
  attendance_summary: {
    present: number;
    absent: number;
    excused: number;
    late: number;
  };
}

// ── G2 — Recurring Schedules ──

export type AcademyScheduleWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

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
  status: 'active' | 'paused' | 'archived';
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  // list joins
  group_name?: string | null;
  program_name?: string | null;
  organisation_id?: number | null;
  program_branch_id?: number | null;
  preferred_court_name?: string | null;
  branch_name?: string | null;
}

export type AcademySessionHoldStatus = 'pending_court' | 'conflict' | 'pending_expired' | 'deferred' | 'resolved' | 'confirmed' | null;

export interface AcademyGroupSessionRow {
  id: number;
  group_id: number;
  schedule_id: number | null;
  source_type: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  court_id: number | null;
  coach_id: number | null;
  status: string;
  timezone: string | null;
  start_at_utc: string | null;
  end_at_utc: string | null;
  reservation_status: AcademySessionHoldStatus;
  priority_seq: number | null;
  pending_expires_at: string | null;
  pending_resolved_at: string | null;
  original_session_date: string | null;
  original_start_time: string | null;
  original_end_time: string | null;
  original_court_id: number | null;
  conflict_metadata: any | null;
  group_name?: string | null;
  court_name?: string | null;
  coach_name?: string | null;
  schedule_name?: string | null;
}

export interface AcademyConflictAlternative {
  court_id: number;
  court_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  state: string;
}

export interface AcademyConflictEvaluation {
  sessionId?: number | null;
  court_id: number;
  session_date: string;
  start_time: string;
  end_time: string;
  state: 'AVAILABLE' | 'PENDING_COURT' | 'CONFLICT' | 'DEFERRED' | 'ADMIN_TIME_RESOLUTION_REQUIRED' | 'EXPIRED_PENDING_DECISION';
  reason: string | null;
  startAtUtc: string | null;
  endAtUtc: string | null;
  prioritySeq: number;
  conflict: { type: 'booking' | 'academy_session' | null; id: number | null; prioritySeq: number | null; detail?: string | null } | null;
  alternatives: AcademyConflictAlternative[] | null;
}

export const academyApi = {
  // Dashboard
  getDashboard: () => api.get<AcademyDashboard>('/admin/academy/dashboard').then(r => r.data),

  // Programs
  getPrograms: (params?: Record<string, any>) =>
    api.get<PaginatedResult<AcademyProgram>>('/admin/academy/programs', { params }).then(r => r.data),
  getProgram: (id: number) =>
    api.get<AcademyProgram>(`/admin/academy/programs/${id}`).then(r => r.data),
  getProgramDetail: (id: number) =>
    api.get<{ program: AcademyProgram; groups: AcademyGroup[] }>(`/admin/academy/programs/${id}/detail`).then(r => r.data),
  createProgram: (data: any) =>
    api.post<AcademyProgram>('/admin/academy/programs', data).then(r => r.data),
  updateProgram: (id: number, data: any) =>
    api.put<AcademyProgram>(`/admin/academy/programs/${id}`, data).then(r => r.data),
  confirmProgram: (id: number) =>
    api.post<AcademyProgram>(`/admin/academy/programs/${id}/confirm`, {}).then(r => r.data),
  publishProgram: (id: number) =>
    api.post<AcademyProgram>(`/admin/academy/programs/${id}/publish`).then(r => r.data),
  archiveProgram: (id: number) =>
    api.post<AcademyProgram>(`/admin/academy/programs/${id}/archive`).then(r => r.data),
  transitionProgram: (id: number, status: string) =>
    api.post<AcademyProgram>(`/admin/academy/programs/${id}/transition`, { status }).then(r => r.data),
  getProgramOptions: () =>
    api.get<{ categories: string[] }>('/admin/academy/programs/options').then(r => r.data),

  // Groups
  getGroups: (params?: Record<string, any>) =>
    api.get<PaginatedResult<AcademyGroup>>('/admin/academy/groups', { params }).then(r => r.data),
  getProgramGroups: (programId: number, params?: Record<string, any>) =>
    api.get<PaginatedResult<AcademyGroup>>(`/admin/academy/programs/${programId}/groups`, { params }).then(r => r.data),
  getGroup: (id: number) =>
    api.get<AcademyGroup>(`/admin/academy/groups/${id}`).then(r => r.data),
  createGroup: (data: any) =>
    api.post<AcademyGroup>('/admin/academy/groups', data).then(r => r.data),
  updateGroup: (id: number, data: any) =>
    api.put<AcademyGroup>(`/admin/academy/groups/${id}`, data).then(r => r.data),
  assignCoach: (id: number, coachId: number | null) =>
    api.post<AcademyGroup>(`/admin/academy/groups/${id}/assign-coach`, { coach_id: coachId }).then(r => r.data),
  setCompensation: (id: number, data: { comp_type: string; comp_value: number; comp_currency?: string | null }) =>
    api.post<AcademyGroup>(`/admin/academy/groups/${id}/compensation`, data).then(r => r.data),
  archiveGroup: (id: number) =>
    api.post(`/admin/academy/groups/${id}/archive`).then(r => r.data),

  // Enrollments
  getEnrollments: (params?: Record<string, any>) =>
    api.get<PaginatedResult<AcademyEnrollment>>('/admin/academy/enrollments', { params }).then(r => r.data),
  getProgramEnrollments: (programId: number, params?: Record<string, any>) =>
    api.get<PaginatedResult<AcademyEnrollment>>(`/admin/academy/programs/${programId}/enrollments`, { params }).then(r => r.data),
  getEnrollment: (id: number) =>
    api.get<AcademyEnrollment>(`/admin/academy/enrollments/${id}`).then(r => r.data),
  createEnrollment: (data: any) =>
    api.post<AcademyEnrollment>('/admin/academy/enrollments', data).then(r => r.data),
  cancelEnrollment: (id: number) =>
    api.post(`/admin/academy/enrollments/${id}/cancel`).then(r => r.data),
  completeEnrollment: (id: number) =>
    api.post(`/admin/academy/enrollments/${id}/complete`).then(r => r.data),
  confirmEnrollment: (id: number) =>
    api.post(`/admin/academy/enrollments/${id}/confirm`).then(r => r.data),
  moveEnrollment: (id: number, groupId: number) =>
    api.post<AcademyEnrollment>(`/admin/academy/enrollments/${id}/move`, { group_id: groupId }).then(r => r.data),
  getEnrollmentHistory: (id: number) =>
    api.get(`/admin/academy/enrollments/${id}/history`).then(r => r.data),

  // Sessions
  getSessions: (params?: Record<string, any>) =>
    api.get<PaginatedResult<GroupSession>>('/admin/academy/sessions', { params }).then(r => r.data),
  createSession: (data: any) =>
    api.post('/admin/academy/sessions', data).then(r => r.data),
  updateSession: (id: number, data: any) =>
    api.put(`/admin/academy/sessions/${id}`, data).then(r => r.data),

  // Attendance
  getSessionAttendance: (sessionId: number) =>
    api.get<{ data: AttendanceRecord[]; summary: any }>(`/admin/academy/sessions/${sessionId}/attendance`).then(r => r.data),
  getAttendanceList: (params?: Record<string, any>) =>
    api.get<PaginatedResult<AttendanceRecord>>('/admin/academy/attendance', { params }).then(r => r.data),
  recordAttendance: (data: any) =>
    api.post('/admin/academy/attendance', data).then(r => r.data),
  recordBulkAttendance: (sessionId: number, records: any[]) =>
    api.post(`/admin/academy/sessions/${sessionId}/attendance/bulk`, { records }).then(r => r.data),
  updateAttendance: (id: number, data: any) =>
    api.put(`/admin/academy/attendance/${id}`, data).then(r => r.data),

  // ── G2 — Recurring Schedules ──
  getSchedules: (params?: Record<string, any>) =>
    api.get<PaginatedResult<AcademySchedule>>('/admin/academy/schedules', { params }).then(r => r.data),
  getSchedule: (id: number) =>
    api.get<AcademySchedule & { sessions: AcademyGroupSessionRow[] }>(`/admin/academy/schedules/${id}`).then(r => r.data),
  createSchedule: (data: any) =>
    api.post<AcademySchedule>(`/admin/academy/schedules`, data).then(r => r.data),
  updateSchedule: (id: number, data: any) =>
    api.put<{ evaluations: AcademyConflictEvaluation[]; affected: number; schedule: AcademySchedule }>(`/admin/academy/schedules/${id}`, data).then(r => r.data),
  previewScheduleChange: (id: number, data: any) =>
    api.post<{ evaluations: AcademyConflictEvaluation[]; affected: number }>(`/admin/academy/schedules/${id}/preview`, data).then(r => r.data),
  regenerateSchedule: (id: number) =>
    api.post<{ schedule: AcademySchedule; generated: number; evaluations: AcademyConflictEvaluation[] }>(`/admin/academy/schedules/${id}/regenerate`, {}).then(r => r.data),
  resyncSchedule: (id: number) =>
    api.post<{ schedule: AcademySchedule; evaluations: AcademyConflictEvaluation[]; resynced: number }>(`/admin/academy/schedules/${id}/resync`, {}).then(r => r.data),
  setScheduleStatus: (id: number, status: string) =>
    api.post<AcademySchedule>(`/admin/academy/schedules/${id}/status`, { status }).then(r => r.data),
  getScheduleSessions: (scheduleId: number, params?: Record<string, any>) =>
    api.get<PaginatedResult<AcademyGroupSessionRow>>(`/admin/academy/schedules/${scheduleId}/sessions`, { params }).then(r => r.data),
  resolveSession: (sessionId: number, decision: { type: 'release' | 'keep' | 'apply_alternative'; alternative?: { court_id: number; session_date: string; start_time: string; end_time: string } }) =>
    api.post<AcademyGroupSessionRow>(`/admin/academy/sessions/${sessionId}/resolve`, decision).then(r => r.data),
};

// ── G3 — Confirmation lifecycle ──

export type AcademyConfirmationBlockerCode =
  | 'ALREADY_CONFIRMED'
  | 'MISSING_SCHEDULE'
  | 'MISSING_COACH'
  | 'INVALID_COACH'
  | 'MISSING_COMPENSATION'
  | 'MISSING_COURT'
  | 'UNRESOLVED_COURT_CONFLICT'
  | 'UNRESOLVED_DST'
  | 'UNRESOLVED_PENDING_HOLD'
  | 'UNPAID_ENROLLMENT'
  | 'BELOW_MINIMUM'
  | 'ABOVE_MAXIMUM'
  | 'CONCURRENT_MODIFICATION';

export interface AcademyConfirmationBlocker {
  code: AcademyConfirmationBlockerCode;
  entity?: string;
  entityId?: number;
  entityName?: string | null;
  detail?: string;
  overridable?: boolean;
}

export interface AcademyConfirmationStats {
  activeGroups: number;
  schedules: number;
  futureSessions: number;
  finalizableSessions: number;
  confirmedEnrollments: number;
  unpaidEnrollments: number;
  capacity: number;
  minEnrollments: number;
  price: number;
  currency: string;
}

export interface AcademyConfirmationReadiness {
  programId: number;
  programName: string;
  lifecycleState: string;
  ready: boolean;
  blockers: AcademyConfirmationBlocker[];
  snapshotToken: string;
  stats: AcademyConfirmationStats;
}

export interface ConfirmAcademyProgramResult {
  confirmed: boolean;
  programId: number;
  lifecycleState: 'confirmed';
  finalizedSessions: number;
  lockedSchedules: number;
  lockedGroups: number;
}

export const academyConfirmationApi = {
  getReadiness: (programId: number) =>
    api.get<AcademyConfirmationReadiness>(`/admin/academy/programs/${programId}/confirmation-readiness`).then(r => r.data),
  confirm: (programId: number, payload: {
    expected_snapshot_token?: string | null;
    override_below_min?: boolean;
    override_above_max?: boolean;
    reason?: string | null;
  }) =>
    api.post<ConfirmAcademyProgramResult>(`/admin/academy/programs/${programId}/confirmation`, payload).then(r => r.data),
  markEnrollmentPaid: (enrollmentId: number) =>
    api.post<{ id: number; payment_confirmed_at: string }>(`/admin/academy/enrollments/${enrollmentId}/payment`, {}).then(r => r.data),
};
