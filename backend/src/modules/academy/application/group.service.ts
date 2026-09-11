import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { resolveProgramScope, assertCanManageAcademy, isApprovedCoach, getCoachOrgRelation, type AcademyScope, type CoachRelation } from './academy-scope.js';
import type { AcademyGroupAttributes, CoachCompensationType } from '../domain/academy.types.js';

class GroupService {
  async listByProgram(programId: number, filters?: { page?: number; limit?: number; status?: string }) {
    const program = await programRepository.getById(programId);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return groupRepository.listByProgram(programId, filters);
  }

  async listAll(filters?: { page?: number; limit?: number; status?: string; programId?: number }) {
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
    return groupRepository.getById(id);
  }

  /**
   * G1 — assign/change the Academy coach during setup. Independent from normal
   * coach eligibility: a valid approved coach (contracted or external) is
   * allowed. Contracted vs external is recorded for display/audit, not as a gate.
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

    await groupRepository.updateCoach(id, coachId);
    return { group: await groupRepository.getById(id), relation };
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
  }
}

export const academyGroupService = new GroupService();