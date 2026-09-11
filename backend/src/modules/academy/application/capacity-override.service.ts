// ============================================================================
// Academy G4 — capacity override service
//
// original_capacity is the immutable baseline. An override temporarily raises
// the effective maximum (original_capacity + amount) with an optional expiry.
// Override changes are NEVER retroactive and NEVER mutate original_capacity.
// Override write operations serialize on the program row (FOR UPDATE) so
// concurrent create/extend/remove cannot interleave.
// ============================================================================
import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { recordAudit } from '../../audit-log/index.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { resolveProgramScope, assertCanManageAcademy } from './academy-scope.js';
import { effectiveCapacity, capacityOverrideState } from '../domain/capacity.js';

export interface CapacityStatus {
  programId: number;
  programName: string;
  originalCapacity: number;
  effectiveCapacity: number;
  confirmedCount: number;
  availableSeats: number;
  override: {
    active: boolean;
    amount: number | null;
    until: string | null;
    by: number | null;
    reason: string | null;
  };
}

function isValidUntil(until: string | null, now: Date = new Date()): boolean {
  if (until == null) return true;
  const t = new Date(until).getTime();
  if (Number.isNaN(t)) return false;
  return t > now.getTime();
}

class CapacityOverrideService {
  /** Read-only capacity status (original, effective, confirmed, seats, override). */
  async getStatus(programId: number, actorId: number): Promise<CapacityStatus> {
    const scope = await resolveProgramScope(programId);
    await assertCanManageAcademy(actorId, scope);
    const program = await programRepository.getById(programId);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

    const confirmedCount = await enrollmentRepository.getConfirmedCount(programId);
    const eff = effectiveCapacity(program);
    const override = capacityOverrideState(program);
    return {
      programId,
      programName: program.name ?? '',
      originalCapacity: Number(program.original_capacity ?? program.capacity ?? 0),
      effectiveCapacity: eff,
      confirmedCount,
      availableSeats: eff > 0 ? Math.max(eff - confirmedCount, 0) : -1, // -1 = unlimited
      override,
    };
  }

  /**
   * Create or extend the capacity override. original_capacity is untouched.
   * Non-retroactive: existing confirmed enrollments are never demoted.
   */
  async setOverride(programId: number, actorId: number, input: {
    amount: number;
    until?: string | null;
    reason: string;
  }): Promise<CapacityStatus> {
    const scope = await resolveProgramScope(programId);
    await assertCanManageAcademy(actorId, scope);

    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new ConflictError('Override amount must be a positive integer', ErrorCodes.ACADEMY_CAPACITY_OVERRIDE_INVALID);
    }
    if (amount > 100000) {
      throw new ConflictError('Override amount exceeds the allowed maximum', ErrorCodes.ACADEMY_CAPACITY_OVERRIDE_INVALID);
    }
    if (!input.reason?.trim()) {
      throw new ConflictError('A reason is required for a capacity override', ErrorCodes.ACADEMY_CAPACITY_OVERRIDE_REQUIRED);
    }
    const until = input.until ?? null;
    if (!isValidUntil(until)) {
      throw new ConflictError('Override expiry must be a future timestamp', ErrorCodes.ACADEMY_CAPACITY_OVERRIDE_INVALID);
    }

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const program = await programRepository.getCapacityForUpdate(programId, conn);
      if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

      const before = {
        original: Number(program.original_capacity ?? program.capacity ?? 0),
        overrideAmount: program.capacity_override_amount ?? null,
        overrideUntil: program.capacity_override_until ?? null,
        effective: effectiveCapacity(program),
      };

      await programRepository.setCapacityOverride(programId, { amount, until, by: actorId, reason: input.reason }, conn);
      await conn.commit();

      const afterProgram = await programRepository.getById(programId);
      const after = {
        original: Number(afterProgram?.original_capacity ?? afterProgram?.capacity ?? 0),
        overrideAmount: afterProgram?.capacity_override_amount ?? null,
        overrideUntil: afterProgram?.capacity_override_until ?? null,
        effective: afterProgram ? effectiveCapacity(afterProgram) : before.effective,
      };

      await recordAudit({
        actorId,
        action: 'ACADEMY_CAPACITY.OVERRIDE',
        entityType: 'academy_program',
        entityId: programId,
        beforeState: before,
        afterState: { ...after, reason: input.reason },
        ipAddress: undefined,
        userAgent: undefined,
      });

      return this.getStatus(programId, actorId);
    } catch (err) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Reduce/remove the override. original_capacity is untouched. Non-retroactive:
   * even if confirmedCount > restored effective max, confirmed players remain
   * confirmed; future enrollments above the restored max go to waiting.
   */
  async removeOverride(programId: number, actorId: number, reason: string): Promise<CapacityStatus> {
    const scope = await resolveProgramScope(programId);
    await assertCanManageAcademy(actorId, scope);
    if (!reason?.trim()) {
      throw new ConflictError('A reason is required to remove a capacity override', ErrorCodes.ACADEMY_CAPACITY_OVERRIDE_REQUIRED);
    }

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const program = await programRepository.getCapacityForUpdate(programId, conn);
      if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

      const before = {
        original: Number(program.original_capacity ?? program.capacity ?? 0),
        overrideAmount: program.capacity_override_amount ?? null,
        overrideUntil: program.capacity_override_until ?? null,
        effective: effectiveCapacity(program),
      };

      await programRepository.clearCapacityOverride(programId, conn);
      await conn.commit();

      const afterProgram = await programRepository.getById(programId);
      const after = {
        original: Number(afterProgram?.original_capacity ?? afterProgram?.capacity ?? 0),
        overrideAmount: null,
        overrideUntil: null,
        effective: afterProgram ? effectiveCapacity(afterProgram) : before.original,
      };

      await recordAudit({
        actorId,
        action: 'ACADEMY_CAPACITY.OVERRIDE_REMOVED',
        entityType: 'academy_program',
        entityId: programId,
        beforeState: before,
        afterState: { ...after, reason },
        ipAddress: undefined,
        userAgent: undefined,
      });

      return this.getStatus(programId, actorId);
    } catch (err) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      throw err;
    } finally {
      conn.release();
    }
  }
}

export const academyCapacityOverrideService = new CapacityOverrideService();