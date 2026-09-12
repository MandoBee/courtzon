// ============================================================================
// Academy G6 — Player-facing Academy self-service
//
// All player/public access is funneled through this service so the response is
// a dedicated PUBLIC DTO (never raw program rows) and every identity check is
// server-side. Enforces:
//   - browse/detail: is_public = 1 AND status = 'published'
//   - self-enrollment: only published programs, closed after the program has
//     started (isAcademyProgramStarted — the G4/G5 session-time semantics),
//     duplicate/capacity/waitlist behavior delegated to the existing enroll()
//   - my-data endpoints: bound to the authenticated player's user id
// ============================================================================
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { sessionRepository } from '../infrastructure/repositories/session.repository.js';
import { attendanceRepository } from '../infrastructure/repositories/attendance.repository.js';
import { academyEnrollmentService } from './enrollment.service.js';
import { effectiveCapacity } from '../domain/capacity.js';
import { isAcademyProgramStarted } from './academy-start.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

function toNumber(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export interface PublicProgramDto {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category: string;
  level: string | null;
  season: string | null;
  price: number;
  currency: string;
  price_type: string;
  status: string;
  is_public: boolean;
  capacity: number;
  confirmedCount: number;
  availableSeats: number;
  isFull: boolean;
  isUnlimited: boolean;
}

export interface PublicEnrollmentDto {
  id: number;
  programId: number;
  programName: string;
  programCode: string;
  groupId: number | null;
  groupName: string | null;
  status: string;
  waitingOrder: number | null;
  paymentState: 'pending' | 'confirmed';
  enrolledAt: string;
}

function mapPublicProgram(program: any, confirmedCount: number): PublicProgramDto {
  const eff = effectiveCapacity(program);
  const confirmed = toNumber(confirmedCount);
  return {
    id: Number(program.id),
    code: program.code ?? '',
    name: program.name ?? '',
    description: program.description ?? null,
    category: program.category ?? '',
    level: program.level ?? null,
    season: program.season ?? null,
    price: toNumber(program.price),
    currency: program.currency ?? 'USD',
    price_type: program.price_type ?? 'FIXED',
    status: program.status,
    is_public: !!program.is_public,
    capacity: eff,
    confirmedCount: confirmed,
    availableSeats: eff > 0 ? Math.max(eff - confirmed, 0) : -1,
    isFull: eff > 0 && confirmed >= eff,
    isUnlimited: eff === 0,
  };
}

function mapEnrollment(e: any): PublicEnrollmentDto {
  return {
    id: Number(e.id),
    programId: Number(e.program_id),
    programName: e.program_name ?? '',
    programCode: e.program_code ?? '',
    groupId: e.group_id == null ? null : Number(e.group_id),
    groupName: e.group_name ?? null,
    status: e.status,
    waitingOrder: e.waiting_order == null ? null : Number(e.waiting_order),
    paymentState: e.payment_confirmed_at ? 'confirmed' : 'pending',
    enrolledAt: e.enrolled_at ?? e.created_at ?? '',
  };
}

class PublicAcademyService {
  /** G6 — player browse: published + public programs with live availability. */
  async listPublished(): Promise<PublicProgramDto[]> {
    const programs = await programRepository.listPublic();
    const counts = await enrollmentRepository.countConfirmedByPrograms(programs.map((p) => Number(p.id)));
    return programs.map((p) => mapPublicProgram(p, counts.get(Number(p.id)) ?? 0));
  }

  /** G6 — player detail (published + public only; non-revealing 404 otherwise). */
  async getPublished(id: number): Promise<PublicProgramDto> {
    const program = await programRepository.getPublicById(id);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    const confirmed = await enrollmentRepository.getConfirmedCount(id);
    return mapPublicProgram(program, confirmed);
  }

  /**
   * G6 — self-enrollment. Player identity is taken from the authenticated
   * session (never a client-supplied id). Reuses the existing enroll() for the
   * capacity / effective-capacity / FIFO waitlist / duplicate / unlimited rules
   * and its concurrency lock. Rejects non-published programs and late
   * enrollment after the program has started.
   */
  async enroll(playerId: number, programId: number): Promise<{ status: 'confirmed' | 'waiting'; enrollment: PublicEnrollmentDto }> {
    const program = await programRepository.getPublicById(programId);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

    if (await isAcademyProgramStarted(programId)) {
      throw new ConflictError('Academy enrollment is closed — the program has already started', ErrorCodes.ACADEMY_ENROLLMENT_CLOSED);
    }

    const enrollment = await academyEnrollmentService.enroll({ player_id: playerId, program_id: programId });
    return {
      status: enrollment.status === 'confirmed' ? 'confirmed' : 'waiting',
      enrollment: mapEnrollment(enrollment),
    };
  }

  /** G6 — the authenticated player's own enrollments. */
  async myEnrollments(playerId: number): Promise<PublicEnrollmentDto[]> {
    const rows = await enrollmentRepository.listForPlayer(playerId);
    return rows.map(mapEnrollment);
  }

  /** G6 — the authenticated player's own Academy sessions + own attendance state. */
  async mySessions(playerId: number): Promise<any[]> {
    return sessionRepository.listForPlayer(playerId);
  }

  /** G6 — the authenticated player's own attendance history. */
  async myAttendance(playerId: number): Promise<any[]> {
    return attendanceRepository.listForPlayer(playerId);
  }
}

export const publicAcademyService = new PublicAcademyService();