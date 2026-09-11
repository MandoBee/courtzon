import { z } from 'zod';

// ── Programs ──

export const CreateProgramSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().min(1),
  level: z.string().optional(),
  season: z.string().optional(),
  capacity: z.number().int().min(0).optional().default(0),
  price: z.number().min(0).optional().default(0),
  currency: z.string().length(3).optional().default('USD'),
  price_type: z.enum(['FREE', 'FIXED', 'MEMBERS_ONLY']).optional().default('FIXED'),
  status: z.enum(['draft', 'published', 'open', 'full', 'running', 'completed', 'cancelled', 'archived']).optional().default('draft'),
  is_public: z.boolean().optional().default(true),
  // G1 — ownership
  organisation_id: z.number().int().positive(),
  branch_id: z.number().int().positive().optional().nullable(),
  sport_id: z.number().int().positive().optional().nullable(),
});

export const UpdateProgramSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  category: z.string().min(1).optional(),
  level: z.string().optional(),
  season: z.string().optional(),
  capacity: z.number().int().min(0).optional(),
  price: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  price_type: z.enum(['FREE', 'FIXED', 'MEMBERS_ONLY']).optional(),
  status: z.enum(['draft', 'published', 'open', 'full', 'running', 'completed', 'cancelled', 'archived']).optional(),
  is_public: z.boolean().optional(),
  organisation_id: z.number().int().positive().optional(),
  branch_id: z.number().int().positive().optional().nullable(),
  sport_id: z.number().int().positive().optional().nullable(),
});

export const ListProgramsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  is_public: z.coerce.boolean().optional(),
});

export const TransitionStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'open', 'full', 'running', 'completed', 'cancelled', 'archived']),
});

// ── Groups ──

export const CreateGroupSchema = z.object({
  program_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  coach_id: z.number().int().positive().optional(),
  capacity: z.number().int().min(0).optional().default(0),
  status: z.enum(['active', 'inactive', 'archived']).optional().default('active'),
});

export const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  coach_id: z.number().int().positive().optional(),
  capacity: z.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

export const AssignCoachSchema = z.object({
  coach_id: z.number().int().positive().nullable(),
});

/** G1 — coach compensation configuration (institution expense; CourtZon takes no share). */
export const SetCompensationSchema = z.object({
  comp_type: z.enum(['fixed_total', 'fixed_per_session', 'percent_gross']),
  comp_value: z.number().min(0),
  comp_currency: z.string().length(3).optional().nullable(),
});

export const ConfirmAcademySchema = z.object({}).optional();

/**
 * G3 — confirmation request. The client returns the readiness `snapshotToken`
 * unchanged; capacity overrides are allowed only WITH an audit `reason`.
 */
export const ConfirmationRequestSchema = z.object({
  expected_snapshot_token: z.string().min(1).optional().nullable(),
  override_below_min: z.boolean().optional().default(false),
  override_above_max: z.boolean().optional().default(false),
  reason: z.string().min(1).max(500).optional().nullable(),
}).refine((v) => !(v.override_below_min || v.override_above_max) || (v.reason?.trim()?.length ?? 0) > 0, {
  message: 'reason is required when overriding capacity blockers',
  path: ['reason'],
});

/** G3 — manual / offline payment acknowledgment for a confirmed enrollment. */
export const MarkEnrollmentPaymentSchema = z.object({}).optional();

export const ListGroupsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.string().optional(),
  program_id: z.coerce.number().int().positive().optional(),
});

// ── Enrollments ──

export const CreateEnrollmentSchema = z.object({
  player_id: z.number().int().positive(),
  program_id: z.number().int().positive(),
  group_id: z.number().int().positive().optional(),
  membership_id: z.number().int().positive().optional(),
});

export const MoveEnrollmentSchema = z.object({
  group_id: z.number().int().positive(),
});

export const ListEnrollmentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  program_id: z.coerce.number().int().positive().optional(),
  group_id: z.coerce.number().int().positive().optional(),
  player_id: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
});

// ── Group Sessions ──

export const CreateGroupSessionSchema = z.object({
  group_id: z.number().int().positive(),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  court_id: z.number().int().positive().optional(),
  coach_id: z.number().int().positive().optional(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional().default('scheduled'),
});

export const UpdateGroupSessionSchema = z.object({
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  court_id: z.number().int().positive().optional(),
  coach_id: z.number().int().positive().optional(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
});

export const ListSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  group_id: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
});

// ── Attendance ──

export const RecordAttendanceSchema = z.object({
  group_session_id: z.number().int().positive(),
  enrollment_id: z.number().int().positive(),
  attendance_status: z.enum(['present', 'absent', 'excused', 'late']).optional().default('present'),
  notes: z.string().optional(),
});

export const RecordBulkAttendanceSchema = z.object({
  records: z.array(z.object({
    enrollment_id: z.number().int().positive(),
    attendance_status: z.enum(['present', 'absent', 'excused', 'late']).optional().default('present'),
    notes: z.string().optional(),
  })),
});

export const UpdateAttendanceSchema = z.object({
  attendance_status: z.enum(['present', 'absent', 'excused', 'late']).optional(),
  notes: z.string().optional(),
});

export const ListAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  group_session_id: z.coerce.number().int().positive().optional(),
  enrollment_id: z.coerce.number().int().positive().optional(),
});

// ── G2 — Recurring Schedules ──

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CreateScheduleSchema = z.object({
  group_id: z.number().int().positive(),
  name: z.string().min(1).max(200).optional().nullable(),
  weekdays: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  local_start_time: z.string().regex(TIME_RE),
  local_end_time: z.string().regex(TIME_RE),
  timezone: z.string().optional().nullable(),
  branch_id: z.number().int().positive(),
  preferred_court_id: z.number().int().positive().optional().nullable(),
  pending_priority_minutes: z.number().int().min(30).max(10080).optional().default(1440),
});

export const UpdateScheduleSchema = CreateScheduleSchema.partial();

export const ListSchedulesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.enum(['active', 'paused', 'archived']).optional(),
  group_id: z.coerce.number().int().positive().optional(),
});

export const ListScheduleSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  reservation_status: z.string().optional(),
});

export const ScheduleStatusSchema = z.object({
  status: z.enum(['active', 'paused', 'archived']),
});

export const ResolveSessionSchema = z.object({
  type: z.enum(['release', 'keep', 'apply_alternative']),
  alternative: z.object({
    court_id: z.number().int().positive(),
    session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(TIME_RE),
    end_time: z.string().regex(TIME_RE),
  }).optional(),
}).refine((v) => v.type !== 'apply_alternative' || (v.alternative !== undefined && v.alternative.court_id > 0), {
  message: 'alternative is required for apply_alternative',
  path: ['alternative'],
});
