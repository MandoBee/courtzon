import { getPool } from '../../../database/mysql.js';
import { attendanceRepository } from '../infrastructure/repositories/attendance.repository.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { AcademyAttendanceAttributes } from '../domain/academy.types.js';

class AttendanceService {
  async list(filters: { page?: number; limit?: number; groupSessionId?: number; enrollmentId?: number }) {
    return attendanceRepository.list(filters);
  }

  async getBySession(sessionId: number) {
    return attendanceRepository.getBySession(sessionId);
  }

  async record(data: {
    group_session_id: number; enrollment_id: number;
    attendance_status?: string; notes?: string;
  }): Promise<any> {
    const enrollment = await enrollmentRepository.getById(data.enrollment_id);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);

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
    const pool = getPool();
    const [rows] = await pool.execute<import('mysql2').RowDataPacket[]>('SELECT id FROM academy_attendance WHERE id = ?', [id]);
    if (!rows.length) throw new NotFoundError('Academy attendance', ErrorCodes.ACADEMY_ATTENDANCE_NOT_FOUND);

    await attendanceRepository.update(id, {
      attendance_status: data.attendance_status as any,
      notes: data.notes,
    });
  }

  async getSummary(groupSessionId: number) {
    return attendanceRepository.getAttendanceSummary(groupSessionId);
  }

  async recordBulk(sessionId: number, records: { enrollment_id: number; attendance_status?: string; notes?: string }[]): Promise<{ created: number }> {
    let created = 0;
    for (const r of records) {
      try {
        await this.record({ group_session_id: sessionId, ...r });
        created++;
      } catch {
        // skip duplicates
      }
    }
    return { created };
  }
}

export const academyAttendanceService = new AttendanceService();
