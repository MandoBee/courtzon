import { attendanceRepository } from '../infrastructure/repositories/attendance.repository.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { AcademyAttendanceAttributes } from '../domain/academy.types.js';

/**
 * G4-A — administrative attendance realtime (workbench refresh, NEVER a player
 * notification). Fired after the attendance write commits, with authoritative
 * server-side IDs only. Routes via SocketPublisher to the organisation/branch/
 * super-admin rooms and to the group coach's own user room.
 */
async function emitAttendanceUpdated(payload: {
  attendanceId: number; sessionId: number; groupId: number; enrollmentId: number;
  playerId: number; organisationId: number | null; branchId: number | null; coachId: number | null;
  attendance_status: string;
}): Promise<void> {
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  eventBusV2.emit('academy:attendance-updated', payload as any);
}

/** G4-A — resolve the authoritative org/branch/coach scope for a session's group. */
async function resolveAttendanceScope(groupId: number): Promise<{ organisationId: number | null; branchId: number | null; coachId: number | null }> {
  const group = await groupRepository.getById(groupId);
  const program = group ? await programRepository.getById(Number(group.program_id)) : null;
  return {
    organisationId: program?.organisation_id ?? null,
    branchId: program?.branch_id ?? null,
    coachId: group?.coach_id ? Number(group.coach_id) : null,
  };
}

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

    // The unique `uk_session_enrollment (group_session_id, enrollment_id)`
    // constraint is the final authority. A concurrent identical insert can
    // surface ER_DUP_ENTRY here — map it into the Academy attendance conflict
    // vocabulary rather than leaking a raw DB driver error / HTTP 500.
    let id: number;
    try {
      id = await attendanceRepository.create({
        group_session_id: data.group_session_id,
        enrollment_id: data.enrollment_id,
        attendance_status: (data.attendance_status as any) ?? 'present',
        notes: data.notes,
      });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictError('Attendance already recorded for this session and enrollment', ErrorCodes.ACADEMY_ATTENDANCE_EXISTS);
      }
      throw err;
    }

    const scope = await resolveAttendanceScope(Number(session.group_id));
    // G4-B3 — a NEW attendance row is always a genuine state; carry the exact
    // authoritative status written to the database.
    await emitAttendanceUpdated({
      attendanceId: id,
      sessionId: Number(session.id),
      groupId: Number(session.group_id),
      enrollmentId: Number(enrollment.id),
      playerId: Number(enrollment.player_id),
      attendance_status: (data.attendance_status as any) ?? 'present',
      ...scope,
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

    // G4-B3 — the player notification fires ONLY on an ACTUAL status change.
    // Notes-only writes (`attendance_status` undefined) and identical-status
    // writes are persisted but silent. The database write happened above, so a
    // failed write can never produce an event.
    const oldStatus = ctx.attendance.attendance_status;
    const newStatus = data.attendance_status;
    if (newStatus != null && newStatus !== oldStatus) {
      const enrollment = await enrollmentRepository.getById(Number(ctx.attendance.enrollment_id));
      const scope = await resolveAttendanceScope(Number(ctx.session.group_id));
      await emitAttendanceUpdated({
        attendanceId: id,
        sessionId: Number(ctx.attendance.group_session_id),
        groupId: Number(ctx.session.group_id),
        enrollmentId: Number(ctx.attendance.enrollment_id),
        playerId: enrollment ? Number(enrollment.player_id) : 0,
        attendance_status: newStatus,
        ...scope,
      });
    }
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
