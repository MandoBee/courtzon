import { attendanceRepository } from '../infrastructure/repositories/attendance.repository.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { AcademyAttendanceAttributes } from '../domain/academy.types.js';

class AttendanceService {
  async list(filters: { page?: number; limit?: number; groupSessionId?: number; enrollmentId?: number; scopeWhere?: string; scopeParams?: number[] }) {
    return attendanceRepository.list(filters);
  }

  async getBySession(sessionId: number) {
    return attendanceRepository.getBySession(sessionId);
  }

  async record(data: {
    group_session_id: number; enrollment_id: number;
    attendance_status?: string; notes?: string;
  }): Promise<any> {
    const session = await attendanceRepository.getSession(data.group_session_id);
    if (!session) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);

    // G5 — attendance window: only in_progress sessions accept attendance.
    if (session.status !== 'in_progress') {
      throw new ConflictError('Attendance can only be recorded while the session is in progress', ErrorCodes.ACADEMY_ATTENDANCE_WINDOW);
    }

    const enrollment = await enrollmentRepository.getById(data.enrollment_id);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);

    // G5 — integrity: the enrollment MUST belong to the session's group.
    if (Number(enrollment.group_id) !== Number(session.group_id)) {
      throw new ConflictError('Enrollment does not belong to this session\'s group', ErrorCodes.ACADEMY_ATTENDANCE_GROUP_MISMATCH);
    }
    // Only confirmed (accepted) roster members can be marked.
    if (enrollment.status !== 'confirmed') {
      throw new ConflictError('Only confirmed enrollments are on the session roster', ErrorCodes.ACADEMY_ATTENDANCE_NOT_ELIGIBLE);
    }

    const existing = await attendanceRepository.getBySessionAndEnrollment(data.group_session_id, data.enrollment_id);
    if (existing) throw new ConflictError('Attendance already recorded for this session and enrollment', ErrorCodes.ACADEMY_ATTENDANCE_EXISTS);

    const id = await attendanceRepository.create({
      group_session_id: data.group_session_id,
      enrollment_id: data.enrollment_id,
      attendance_status: (data.attendance_status as any) ?? 'present',
      notes: data.notes,
    });

    return { id };
  }

  async update(id: number, data: { attendance_status?: string; notes?: string }): Promise<void> {
    const ctx = await attendanceRepository.getByIdWithSession(id);
    if (!ctx) throw new NotFoundError('Academy attendance', ErrorCodes.ACADEMY_ATTENDANCE_NOT_FOUND);

    // G5 — attendance window: finalized/not-yet-started sessions reject edits.
    if (ctx.session.status !== 'in_progress') {
      throw new ConflictError('Attendance can only be updated while the session is in progress', ErrorCodes.ACADEMY_ATTENDANCE_WINDOW);
    }

    await attendanceRepository.update(id, {
      attendance_status: data.attendance_status as any,
      notes: data.notes,
    });
  }

  async getSummary(groupSessionId: number) {
    return attendanceRepository.getAttendanceSummary(groupSessionId);
  }

  async recordBulk(sessionId: number, records: { enrollment_id: number; attendance_status?: string; notes?: string }[]): Promise<{ created: number }> {
    const session = await attendanceRepository.getSession(sessionId);
    if (!session) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);

    // G5 — bulk obeys the exact same window rule as single attendance (fast-fail).
    if (session.status !== 'in_progress') {
      throw new ConflictError('Attendance can only be recorded while the session is in progress', ErrorCodes.ACADEMY_ATTENDANCE_WINDOW);
    }

    let created = 0;
    for (const r of records) {
      try {
        await this.record({ group_session_id: sessionId, ...r });
        created++;
      } catch (err: any) {
        // Skip genuine duplicates; propagate all other errors (window/group/eligibility).
        if (err?.code === ErrorCodes.ACADEMY_ATTENDANCE_EXISTS || err?.errorCode === ErrorCodes.ACADEMY_ATTENDANCE_EXISTS) continue;
        throw err;
      }
    }
    return { created };
  }

  /** Object-scope helpers (delegated to the repository). */
  async getSessionGroupId(sessionId: number): Promise<number | null> {
    return attendanceRepository.getSessionGroupId(sessionId);
  }

  async getAttendanceSessionId(attendanceId: number): Promise<number | null> {
    return attendanceRepository.getAttendanceSessionId(attendanceId);
  }
}

export const academyAttendanceService = new AttendanceService();
