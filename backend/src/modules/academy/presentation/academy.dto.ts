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
