// ============================================================================
// Academy G4 — capacity + waitlist hardened enrollment service
//
// All enrollment-affecting operations (enroll, promote, replace, confirm,
// move) serialize on the academy_programs row via `SELECT ... FOR UPDATE` —
// the SAME aggregate serialization point used by G3 confirmation and the
// booking module. Under the lock every read (program, effective capacity,
// confirmed count, group capacity, waitlist order) is authoritative.
// ============================================================================
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { recordAudit } from '../../audit-log/index.js';
import { effectiveCapacity } from '../domain/capacity.js';
import { isAcademyGroupStarted } from './academy-start.js';
import { validateEnrollmentTransition } from '../domain/lifecycle.js';
import type { AcademyEnrollmentAttributes } from '../domain/academy.types.js';

export interface PromoteOptions {
  /** Skip the FIFO check (authorized out-of-order replacement). Requires reason. */
  outOfOrder?: boolean;
  /** Mandatory reason for out-of-order replacement. */
  reason?: string | null;
}

class EnrollmentService {
  async list(filters: {
    page?: number; limit?: number; programId?: number; groupId?: number;
    playerId?: number; status?: string; scopeWhere?: string; scopeParams?: number[];
  }) {
    return enrollmentRepository.list(filters);
  }

  async getById(id: number) {
    const enrollment = await enrollmentRepository.getById(id);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    return enrollment;
  }

  /**
   * G4 — enroll a player. Serializes on the program row (FOR UPDATE) so two
   * concurrent enrollments with one remaining slot yield exactly one `confirmed`
   * and one `waiting`. Group capacity is enforced in the same transaction.
   */
  async enroll(data: {
    player_id: number; program_id: number; group_id?: number; membership_id?: number;
  }): Promise<any> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const program = await programRepository.getCapacityForUpdate(data.program_id, conn);
      if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

      const existing = await enrollmentRepository.getByPlayerAndProgram(data.player_id, data.program_id, conn);
      if (existing) throw new ConflictError('Player already enrolled in this program', ErrorCodes.ACADEMY_PLAYER_ALREADY_ASSIGNED);

      const effCap = effectiveCapacity(program);
      const confirmedCount = await enrollmentRepository.getConfirmedCount(data.program_id, conn);

      let status: string;
      let waitingOrder: number | null = null;
      if (effCap > 0 && confirmedCount >= effCap) {
        waitingOrder = await enrollmentRepository.getNextWaitingOrder(data.program_id, conn);
        status = 'waiting';
      } else {
        status = 'confirmed';
      }

      if (data.group_id) {
        const group = await groupRepository.getByIdForCapacity(data.group_id, conn);
        if (!group) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
        if (group.status === 'archived') throw new ConflictError('Cannot enroll into archived group', ErrorCodes.ACADEMY_INVALID_TRANSITION);
        const groupCount = await enrollmentRepository.getGroupConfirmedCount(data.group_id, conn);
        if (Number(group.capacity) > 0 && groupCount >= Number(group.capacity)) {
          throw new ConflictError('Group is full', ErrorCodes.ACADEMY_GROUP_FULL);
        }
      }

      const id = await enrollmentRepository.create({
        player_id: data.player_id,
        program_id: data.program_id,
        group_id: data.group_id,
        membership_id: data.membership_id,
        status: status as any,
        waiting_order: waitingOrder,
      }, conn);

      await conn.commit();
      const enrollment = await enrollmentRepository.getById(id);
      await this.notifyEnrollResult(enrollment, program);
      return enrollment;
    } catch (err) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  /** G6 — enrollment-accepted / enrollment-waitlisted, fired only after a successful commit. */
  private async notifyEnrollResult(enrollment: any, program: any): Promise<void> {
    if (!enrollment || !enrollment.status) return;
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    const payload = {
      programId: Number(enrollment.program_id),
      userId: Number(enrollment.player_id),
      enrollmentId: Number(enrollment.id),
      programName: program?.name ?? '',
      waitlistPosition: enrollment.waiting_order ?? null,
      organisationId: program?.organisation_id ?? undefined,
    } as any;
    if (enrollment.status === 'confirmed') {
      eventBusV2.emit('academy:enrollment-accepted', payload);
    } else if (enrollment.status === 'waiting') {
      eventBusV2.emit('academy:enrollment-waitlisted', payload);
    }
  }

  async cancel(id: number): Promise<void> {
    const enrollment = await enrollmentRepository.getById(id);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    validateEnrollmentTransition(enrollment.status, 'cancelled');
    await enrollmentRepository.updateStatus(id, 'cancelled');
  }

  async complete(id: number): Promise<void> {
    const enrollment = await enrollmentRepository.getById(id);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    validateEnrollmentTransition(enrollment.status, 'completed');
    await enrollmentRepository.updateStatus(id, 'completed');
  }

  /**
   * G4 — confirm an existing `pending` enrollment (legacy path). Applies the
   * capacity gate so confirming can never push the program over the effective
   * maximum. FIFO/start gates do not apply to a non-waitlisted pending row.
   */
  async confirm(id: number): Promise<void> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const enrollment = await enrollmentRepository.getByIdForUpdate(id, conn);
      if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
      if (enrollment.status !== 'pending') {
        throw new ConflictError('Only pending enrollments can be confirmed via this endpoint', ErrorCodes.ACADEMY_INVALID_TRANSITION);
      }
      const program = await programRepository.getCapacityForUpdate(Number(enrollment.program_id), conn);
      if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
      const effCap = effectiveCapacity(program);
      const confirmedCount = await enrollmentRepository.getConfirmedCount(Number(enrollment.program_id), conn);
      if (effCap > 0 && confirmedCount >= effCap) {
        throw new ConflictError('Academy capacity is full', ErrorCodes.ACADEMY_CAPACITY_EXCEEDED);
      }
      await enrollmentRepository.updateStatus(id, 'confirmed', conn);
      await conn.commit();
    } catch (err) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * G4 — manual promotion (waiting -> confirmed).
   *
   * Requirements (all evaluated under the program FOR UPDATE lock):
   *   - target enrollment is `waiting`
   *   - the Academy/group has NOT started (earliest session gate)
   *   - effective capacity is available
   *   - group capacity is available (when a group is assigned)
   *   - FIFO: target is the head of the waitlist, UNLESS `outOfOrder` (which
   *     requires a reason; the dedicated `academy.waitlist.replace` permission
   *     is enforced by the controller/route).
   *
   * There is NO automatic promotion.
   */
  async promote(id: number, actorId: number, opts: PromoteOptions = {}): Promise<any> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const enrollment = await enrollmentRepository.getByIdForUpdate(id, conn);
      if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
      if (enrollment.status !== 'waiting') {
        throw new ConflictError('Only waiting enrollments can be promoted', ErrorCodes.ACADEMY_WAITLIST_NOT_ELIGIBLE);
      }

      const programId = Number(enrollment.program_id);
      const program = await programRepository.getCapacityForUpdate(programId, conn);
      if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

      if (await isAcademyGroupStarted(enrollment.group_id ?? 0, conn)) {
        throw new ConflictError('Academy has started — waitlist replacement is no longer allowed', ErrorCodes.ACADEMY_REPLACEMENT_AFTER_START);
      }

      if (opts.outOfOrder) {
        if (!opts.reason?.trim()) {
          throw new ConflictError('A reason is required for out-of-order replacement', ErrorCodes.ACADEMY_CAPACITY_OVERRIDE_REQUIRED);
        }
      } else {
        const head = await enrollmentRepository.getWaitlistHead(programId, conn);
        if (!head || head.id !== id) {
          throw new ConflictError('Only the head of the waitlist can be promoted', ErrorCodes.ACADEMY_WAITLIST_ORDER_VIOLATION);
        }
      }

      const effCap = effectiveCapacity(program);
      const confirmedCount = await enrollmentRepository.getConfirmedCount(programId, conn);
      if (effCap > 0 && confirmedCount >= effCap) {
        throw new ConflictError('Academy capacity is full', ErrorCodes.ACADEMY_CAPACITY_EXCEEDED);
      }

      if (enrollment.group_id) {
        const group = await groupRepository.getByIdForCapacity(Number(enrollment.group_id), conn);
        if (!group) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
        const groupCount = await enrollmentRepository.getGroupConfirmedCount(Number(enrollment.group_id), conn);
        if (Number(group.capacity) > 0 && groupCount >= Number(group.capacity)) {
          throw new ConflictError('Group is full', ErrorCodes.ACADEMY_GROUP_FULL);
        }
      }

      const updated = await enrollmentRepository.promoteToConfirmed(id, conn);
      if (!updated) throw new ConflictError('Enrollment could not be promoted', ErrorCodes.ACADEMY_INVALID_TRANSITION);

      await conn.commit();

      await recordAudit({
        actorId,
        action: opts.outOfOrder ? 'ACADEMY_WAITLIST.REPLACE' : 'ACADEMY_WAITLIST.PROMOTE',
        entityType: 'academy_enrollment',
        entityId: id,
        beforeState: { status: 'waiting', waiting_order: enrollment.waiting_order ?? null },
        afterState: { status: 'confirmed', out_of_order: Boolean(opts.outOfOrder), reason: opts.reason ?? null },
        ipAddress: undefined,
        userAgent: undefined,
      });

      // G6 — promoted notification, fired only after a successful transition.
      const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
      eventBusV2.emit('academy:promoted', {
        programId,
        userId: Number(enrollment.player_id),
        enrollmentId: id,
        programName: program.name ?? '',
        organisationId: program.organisation_id ?? undefined,
      } as any);

      return enrollmentRepository.getById(id);
    } catch (err) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  /** G4 — authorized out-of-order waitlist replacement. */
  async replace(id: number, actorId: number, reason: string): Promise<any> {
    return this.promote(id, actorId, { outOfOrder: true, reason });
  }

  async moveToGroup(id: number, groupId: number): Promise<any> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const enrollment = await enrollmentRepository.getByIdForUpdate(id, conn);
      if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
      const group = await groupRepository.getByIdForCapacity(groupId, conn);
      if (!group) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
      if (group.status === 'archived') throw new ConflictError('Cannot move to archived group', ErrorCodes.ACADEMY_INVALID_TRANSITION);

      const groupCount = await enrollmentRepository.getGroupConfirmedCount(groupId, conn);
      if (Number(group.capacity) > 0 && groupCount >= Number(group.capacity)) {
        throw new ConflictError('Group is full', ErrorCodes.ACADEMY_GROUP_FULL);
      }

      await enrollmentRepository.moveToGroup(id, groupId);
      await conn.commit();
      return enrollmentRepository.getById(id);
    } catch (err) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  async getHistory(enrollmentId: number): Promise<any[]> {
    const enrollment = await enrollmentRepository.getById(enrollmentId);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    return enrollmentRepository.getHistory(enrollmentId);
  }
}

export const academyEnrollmentService = new EnrollmentService();