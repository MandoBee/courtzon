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
  capacity: number;
  status: string;
  created_at: string;
  program_name?: string;
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

export const academyApi = {
  // Dashboard
  getDashboard: () => api.get<AcademyDashboard>('/admin/academy/dashboard').then(r => r.data),

  // Programs
  getPrograms: (params?: Record<string, any>) =>
    api.get<PaginatedResult<AcademyProgram>>('/admin/academy/programs', { params }).then(r => r.data),
  getProgram: (id: number) =>
    api.get<AcademyProgram>(`/admin/academy/programs/${id}`).then(r => r.data),
  createProgram: (data: any) =>
    api.post<AcademyProgram>('/admin/academy/programs', data).then(r => r.data),
  updateProgram: (id: number, data: any) =>
    api.put<AcademyProgram>(`/admin/academy/programs/${id}`, data).then(r => r.data),
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
};
