export type CoachCompensationType = 'fixed_total' | 'fixed_per_session' | 'percent_gross';

export type AcademyLifecycleState = 'setup' | 'confirmed';

export interface AcademyProgramAttributes {
  id?: number;
  code: string;
  name: string;
  description?: string | null;
  category: string;
  level?: string | null;
  season?: string | null;
  capacity: number;
  price: number;
  currency: string;
  price_type: 'FREE' | 'FIXED' | 'MEMBERS_ONLY';
  status: 'draft' | 'published' | 'open' | 'full' | 'running' | 'completed' | 'cancelled' | 'archived';
  is_public: boolean;
  // ── G1 ownership + confirmation foundation ──
  organisation_id?: number | null;
  branch_id?: number | null;
  sport_id?: number | null;
  lifecycle_state?: AcademyLifecycleState;
  confirmed_at?: string | null;
  confirmed_by?: number | null;
  archived_at?: string | null;
  // ── G4 capacity model ──
  // original_capacity is the immutable baseline. Effective max =
  // original_capacity + active capacity_override_amount (computed; never stored).
  original_capacity?: number;
  capacity_override_amount?: number | null;
  capacity_override_until?: string | null;
  capacity_override_by?: number | null;
  capacity_override_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AcademyGroupAttributes {
  id?: number;
  program_id: number;
  name: string;
  coach_id?: number | null;
  // ── G1 coach compensation configuration ──
  comp_type?: CoachCompensationType | null;
  comp_value?: number | null;
  comp_currency?: string | null;
  capacity: number;
  status: 'active' | 'inactive' | 'archived';
  // ── G1 coach lock metadata ──
  coach_locked_at?: string | null;
  coach_locked_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AcademyEnrollmentAttributes {
  id?: number;
  player_id: number;
  program_id: number;
  group_id?: number | null;
  membership_id?: number | null;
  status: 'pending' | 'confirmed' | 'waiting' | 'cancelled' | 'completed';
  waiting_order?: number | null;
  enrolled_at?: string;
  cancelled_at?: string | null;
  completed_at?: string | null;
  // ── G3 — manual/offline payment acknowledgment (no gateway/ledger postings) ──
  payment_confirmed_at?: string | null;
  payment_confirmed_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AcademyGroupSessionAttributes {
  id?: number;
  group_id: number;
  session_date: string;
  start_time?: string | null;
  end_time?: string | null;
  court_id?: number | null;
  coach_id?: number | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at?: string;
  updated_at?: string;
}

export interface AcademyAttendanceAttributes {
  id?: number;
  group_session_id: number;
  enrollment_id: number;
  attendance_status: 'present' | 'absent' | 'excused' | 'late';
  notes?: string | null;
  created_at?: string;
}

export type AcademyProgramStatus = AcademyProgramAttributes['status'];
export type AcademyEnrollmentStatus = AcademyEnrollmentAttributes['status'];
export type AcademyAttendanceStatus = AcademyAttendanceAttributes['attendance_status'];
export type PriceType = AcademyProgramAttributes['price_type'];

export interface AcademyDashboard {
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
