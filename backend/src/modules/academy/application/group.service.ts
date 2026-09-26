import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { resolveProgramScope, assertCanManageAcademy, isApprovedCoach, getCoachOrgRelation, type AcademyScope, type CoachRelation } from './academy-scope.js';
import type { AcademyGroupAttributes, CoachCompensationType } from '../domain/academy.types.js';

/**
 * G4-A — administrative group realtime. Fired AFTER the group mutation has
 * committed (single autocommit write, then emit), with authoritative server-side
 * IDs only. Routes via SocketPublisher to organisation/branch/super-admin rooms.
 */
async function emitGroupUpdated(group: any, program: any): Promise<void> {
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  eventBusV2.emit('academy:group-updated', {
    groupId: Number(group.id),
    programId: Number(group.program_id ?? program?.id),
    organisationId: program?.organisation_id ?? null,
    branchId: program?.branch_id ?? null,
    coachId: group?.coach_id ? Number(group.coach_id) : null,
  } as any);
}

class GroupService {
  async listByProgram(programId: number, filters?: { page?: number; limit?: number; status?: string; scopeWhere?: string; scopeParams?: number[] }) {
    const program = await programRepository.getById(programId);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return groupRepository.listByProgram(programId, filters);
  }

  async listAll(filters?: { page?: number; limit?: number; status?: string; programId?: number; scopeWhere?: string; scopeParams?: number[] }) {
    return groupRepository.listAll(filters);
  }

  async getById(id: number) {
    const group = await groupRepository.getById(id);
    if (!group) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    return group;
  }

  async resolveProgramId(id: number): Promise<number | null> {
    const group = await groupRepository.getById(id);
    return group ? Number(group.program_id) : null;
  }

  async create(data: Partial<AcademyGroupAttributes>, actorId?: number): Promise<any> {
    const program = await programRepository.getById(data.program_id!);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    if (actorId) await assertCanManageAcademy(actorId, await resolveProgramScope(Number(data.program_id)));
    if (data.coach_id) {
      const ok = await isApprovedCoach(data.coach_id);
      if (!ok) throw new ConflictError('Selected user is not an approved coach', ErrorCodes.ACADEMY_COACH_NOT_FOUND);
    }
    const id = await groupRepository.create(data);
    await emitGroupUpdated({ id, program_id: data.program_id, coach_id: data.coach_id ?? null }, program);
    return groupRepository.getById(id);
  }

  async update(id: number, data: Partial<AcademyGroupAttributes>, actorId?: number): Promise<any> {
    const existing = await groupRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    if (actorId) await assertCanManageAcademy(actorId, await resolveProgramScope(Number(existing.program_id)));

    if (existing.coach_locked_at) {
      const locked = ['coach_id', 'comp_type', 'comp_value', 'comp_currency'];
      if (locked.some((f) => (data as any)[f] !== undefined)) {
        throw new ConflictError('Coach and compensation are locked after Academy confirmation', ErrorCodes.ACADEMY_COACH_LOCKED);
      }
    }
    if (data.coach_id !== undefined && data.coach_id !== Number(existing.coach_id)) {
      const ok = data.coach_id ? await isApprovedCoach(data.coach_id) : true;
      if (!ok) throw new ConflictError('Selected user is not an approved coach', ErrorCodes.ACADEMY_COACH_NOT_FOUND);
    }

    await groupRepository.update(id, data);
    const updated = await groupRepository.getById(id);
    const program = await programRepository.getById(Number(existing.program_id));
    await emitGroupUpdated(updated, program);
    return updated;
  }

  /**
   * G1 — assign/change the Academy coach during setup. Independent from normal
   * coach eligibility: a valid approved coach (contracted or external) is
   * allowed. Contracted vs external is recorded for display/audit, not as a gate.
   *
   * Concurrency: the underlying `updateCoach` is a conditional write keyed to
   * (unlocked AND still the caller-observed coach). Two concurrent assignments
   * therefore have exactly one winner; the loser receives a deterministic
   * conflict instead of a last-writer-wins overwrite.
   */
  async assignCoach(id: number, coachId: number | null, actorId: number): Promise<{ group: any; relation: CoachRelation | null }> {
    const existing = await groupRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    const scope = await resolveProgramScope(Number(existing.program_id));
    await assertCanManageAcademy(actorId, scope);

    if (scope?.lifecycleState === 'confirmed' || existing.coach_locked_at) {
      throw new ConflictError('Coach is locked after Academy confirmation', ErrorCodes.ACADEMY_COACH_LOCKED);
    }

    let relation: CoachRelation | null = null;
    if (coachId) {
      const ok = await isApprovedCoach(coachId);
      if (!ok) throw new ConflictError('Selected user is not an approved coach', ErrorCodes.ACADEMY_COACH_NOT_FOUND);
      if (scope?.organisationId) {
        relation = (await getCoachOrgRelation(coachId, scope.organisationId)) ?? 'external';
      } else {
        relation = 'external';
      }
    }

    const applied = await groupRepository.updateCoach(id, coachId, existing.coach_id ?? null);
    if (!applied) {
      // Deterministic loser: the row moved underneath us (concurrent assignment)
      // or the group was locked between read and write. The re-read is the
      // authority — a lock marker means the confirmation path already won.
      const now = await groupRepository.getById(id);
      if (now?.coach_locked_at) {
        throw new ConflictError('Coach is locked after Academy confirmation', ErrorCodes.ACADEMY_COACH_LOCKED);
      }
      throw new ConflictError('Coach assignment no longer applies — the group changed concurrently', ErrorCodes.ACADEMY_INVALID_TRANSITION);
    }
    const assigned = await groupRepository.getById(id);
    const program = await programRepository.getById(Number(existing.program_id));
    await emitGroupUpdated(assigned, program);
    return { group: assigned, relation };
  }

  /**
   * G1 — configure/change coach compensation during setup. Compensation is an
   * INSTITUTION expense; CourtZon takes no share. No financial postings are
   * created here (financial group is later).
   */
  async setCompensation(id: number, comp: {
    comp_type: CoachCompensationType;
    comp_value: number;
    comp_currency?: string | null;
  }, actorId: number): Promise<any> {
    const existing = await groupRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    const scope = await resolveProgramScope(Number(existing.program_id));
    await assertCanManageAcademy(actorId, scope);

    if (scope?.lifecycleState === 'confirmed' || existing.coach_locked_at) {
      throw new ConflictError('Coach compensation is locked after Academy confirmation', ErrorCodes.ACADEMY_COACH_LOCKED);
    }

    const value = Number(comp.comp_value);
    if (!Number.isFinite(value) || value < 0) {
      throw new ConflictError('Compensation value must be a non-negative number', ErrorCodes.ACADEMY_INVALID_SCOPE);
    }
    if (comp.comp_type === 'percent_gross' && (value < 0 || value > 100)) {
      throw new ConflictError('Percentage compensation must be between 0 and 100', ErrorCodes.ACADEMY_INVALID_SCOPE);
    }
    let currency: string | null = comp.comp_currency ?? null;
    if (comp.comp_type === 'fixed_total' || comp.comp_type === 'fixed_per_session') {
      if (!currency) currency = 'USD';
    }

    await groupRepository.update(id, {
      comp_type: comp.comp_type,
      comp_value: value,
      comp_currency: currency,
    });
    return groupRepository.getById(id);
  }

  async archive(id: number): Promise<void> {
    const existing = await groupRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    await groupRepository.update(id, { status: 'archived' });
    const program = await programRepository.getById(Number(existing.program_id));
    await emitGroupUpdated({ ...existing, status: 'archived' }, program);
  }
}

export const academyGroupService = new GroupService();