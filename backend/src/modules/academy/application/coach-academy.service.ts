// ============================================================================
// Academy G7 — Coach-facing Academy service
//
// Coach authorization source of truth: academy_groups.coach_id = authenticated
// user id. The assigned coach may view sessions, rosters, mark attendance, and
// drive the G5 session lifecycle for their own groups. ALL G5 rules (state
// machine, conditional single-winner updates, attendance window, group-membership
// integrity, confirmed-only eligibility, audit) are reused — the coach path is a
// thin authorization wrapper over the shared Academy services, never a second
// implementation.
// ============================================================================
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { sessionRepository } from '../infrastructure/repositories/session.repository.js';
import { attendanceRepository } from '../infrastructure/repositories/attendance.repository.js';
import { academySessionService } from './session.service.js';
import { academyAttendanceService } from './attendance.service.js';
import { isApprovedCoach } from './academy-scope.js';

/**
 * An authenticated user must be an APPROVED coach (the same rule Academy
 * assignment enforces). A forged request cannot grant Academy access to a
 * non-coach. Denial is non-revealing.
 */
async function assertApprovedCoach(userId: number): Promise<void> {
  if (!(await isApprovedCoach(userId))) {
    throw new NotFoundError('Academy session', ErrorCodes.ACADEMY_INVALID_SESSION);
  }
}

/** Resolve a session ONLY if it belongs to a group assigned to this coach. */
async function assertCoachSession(userId: number, sessionId: number): Promise<any> {
  const session = await sessionRepository.getByIdForCoach(sessionId, userId);
  if (!session) throw new NotFoundError('Academy session', ErrorCodes.ACADEMY_INVALID_SESSION);
  return session;
}

/** Resolve an attendance record ONLY if its session belongs to this coach. */
async function assertCoachAttendance(userId: number, attendanceId: number): Promise<void> {
  const ctx = await attendanceRepository.getByIdWithSession(attendanceId);
  if (!ctx) throw new NotFoundError('Academy attendance', ErrorCodes.ACADEMY_ATTENDANCE_NOT_FOUND);
  await assertCoachSession(userId, Number(ctx.attendance.group_session_id));
}

class CoachAcademyService {
  /** G7 — assigned coach's own Academy sessions. */
  async listMySessions(userId: number): Promise<any[]> {
    await assertApprovedCoach(userId);
    return sessionRepository.listForCoach(userId);
  }

  /** G7 — coach-scoped session detail (non-revealing when not the assigned coach). */
  async getMySession(userId: number, sessionId: number): Promise<any> {
    await assertApprovedCoach(userId);
    return assertCoachSession(userId, sessionId);
  }

  /** G7 — coach-scoped roster + attendance summary for their own session. */
  async getRoster(userId: number, sessionId: number): Promise<{ data: any[]; summary: any }> {
    await assertApprovedCoach(userId);
    await assertCoachSession(userId, sessionId);
    const data = await attendanceRepository.getSessionRoster(sessionId);
    const summary = await academySessionService.getSummary(sessionId);
    return { data, summary };
  }

  /** G7 — coach marks attendance for their own session (G5 integrity rules). */
  async markAttendance(userId: number, input: {
    group_session_id: number;
    enrollment_id: number;
    attendance_status?: string;
    notes?: string;
  }): Promise<any> {
    await assertApprovedCoach(userId);
    await assertCoachSession(userId, input.group_session_id);
    return academyAttendanceService.record(input);
  }

  /** G7 — coach updates attendance for their own session (G5 window rules). */
  async updateAttendance(userId: number, attendanceId: number, data: { attendance_status?: string; notes?: string }): Promise<void> {
    await assertApprovedCoach(userId);
    await assertCoachAttendance(userId, attendanceId);
    return academyAttendanceService.update(attendanceId, data);
  }

  /** G7 — coach bulk attendance for their own session (G5 rules). */
  async bulkAttendance(userId: number, sessionId: number, records: { enrollment_id: number; attendance_status?: string; notes?: string }[]): Promise<{ created: number }> {
    await assertApprovedCoach(userId);
    await assertCoachSession(userId, sessionId);
    return academyAttendanceService.recordBulk(sessionId, records);
  }

  /** G7 — coach starts their own session (shared G5 lifecycle). */
  async start(userId: number, sessionId: number): Promise<any> {
    await assertApprovedCoach(userId);
    await assertCoachSession(userId, sessionId);
    return academySessionService.start(sessionId, userId);
  }

  /** G7 — coach completes their own in_progress session (shared G5 lifecycle). */
  async complete(userId: number, sessionId: number): Promise<any> {
    await assertApprovedCoach(userId);
    await assertCoachSession(userId, sessionId);
    return academySessionService.complete(sessionId, userId);
  }

  /** G7 — coach cancels their own scheduled/in_progress session (shared G5 lifecycle). */
  async cancel(userId: number, sessionId: number, reason?: string | null): Promise<any> {
    await assertApprovedCoach(userId);
    await assertCoachSession(userId, sessionId);
    return academySessionService.cancel(sessionId, userId, reason);
  }
}

export const coachAcademyService = new CoachAcademyService();