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
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AcademyGroupAttributes {
  id?: number;
  program_id: number;
  name: string;
  coach_id?: number | null;
  capacity: number;
  status: 'active' | 'inactive' | 'archived';
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
