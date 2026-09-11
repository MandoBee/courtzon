import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { validateProgramTransition, validateLifecycleTransition } from '../domain/lifecycle.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { validateAcademyScopeInput, resolveProgramScope, assertCanManageAcademy, type AcademyScope } from './academy-scope.js';
import type { AcademyProgramAttributes, AcademyDashboard, AcademyLifecycleState } from '../domain/academy.types.js';

class ProgramService {
  async list(filters: {
    page?: number; limit?: number; search?: string; category?: string; status?: string; is_public?: boolean;
    organisationId?: number; branchId?: number; organisationIds?: number[];
  }) {
    return programRepository.list(filters);
  }

  async getById(id: number): Promise<AcademyProgramAttributes | null> {
    return programRepository.getById(id);
  }

  async create(data: Partial<AcademyProgramAttributes>): Promise<AcademyProgramAttributes> {
    if (data.code) {
      const existing = await programRepository.getByCode(data.code);
      if (existing) throw new ConflictError('Program code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    }
    if (!data.organisation_id) {
      throw new ConflictError('An Academy must be scoped to an organisation', ErrorCodes.ACADEMY_INVALID_SCOPE);
    }
    // Server-side ownership validation — branch must belong to the organisation.
    await validateAcademyScopeInput(data.organisation_id, data.branch_id ?? null, data.sport_id ?? null);
    const id = await programRepository.create({ ...data, lifecycle_state: 'setup' });
    const program = await programRepository.getById(id);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return program;
  }

  async update(id: number, data: Partial<AcademyProgramAttributes>): Promise<AcademyProgramAttributes> {
    const existing = await programRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

    if (data.code && data.code !== existing.code) {
      const dup = await programRepository.getByCode(data.code);
      if (dup) throw new ConflictError('Program code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    }

    // Ownership identity fields are immutable after confirmation (G1).
    if (existing.lifecycle_state === 'confirmed') {
      const locked = ['organisation_id', 'branch_id', 'sport_id'];
      if (locked.some((f) => (data as any)[f] !== undefined)) {
        throw new ConflictError('Academy ownership is locked after confirmation', ErrorCodes.ACADEMY_LIFECYCLE_LOCKED);
      }
    }
    if (data.organisation_id != null) {
      const orgId: number = data.organisation_id;
      const branchId = data.branch_id !== undefined ? data.branch_id : (existing.branch_id ?? null);
      const sportId = data.sport_id !== undefined ? data.sport_id : (existing.sport_id ?? null);
      await validateAcademyScopeInput(orgId, branchId, sportId);
    }

    // G4 — an explicit program capacity edit re-baselines original_capacity
    // (the immutable baseline). Override operations never touch original_capacity;
    // this is the deliberate "change the program's base capacity" path.
    if (data.capacity !== undefined) {
      data.original_capacity = data.capacity;
    }

    await programRepository.update(id, data);
    const program = await programRepository.getById(id);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return program;
  }

  /**
   * G1 — foundational confirmation: SETUP → CONFIRMED. Locks the Academy coach
   * and compensation on every active group. This is NOT the later
   * financial/court confirmation workflow.
   */
  async confirm(id: number, actorId: number): Promise<AcademyProgramAttributes> {
    const existing = await programRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    if (existing.lifecycle_state === 'confirmed') {
      throw new ConflictError('Academy is already confirmed', ErrorCodes.ACADEMY_LIFECYCLE_LOCKED);
    }
    validateLifecycleTransition(existing.lifecycle_state ?? 'setup', 'confirmed');
    await programRepository.confirm(id, actorId);
    const groups = await groupRepository.listByProgram(id, { status: 'active' });
    for (const g of groups.data) {
      await groupRepository.confirmLock(Number(g.id), actorId);
    }
    const program = await programRepository.getById(id);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return program;
  }

  /** Full Academy detail: program ownership + every group (coach + compensation). */
  async getDetail(id: number) {
    const program = await programRepository.getById(id);
    if (!program) return null;
    const groups = await groupRepository.listByProgram(id);
    return { program, groups: groups.data };
  }

  /** Resolve a program's ownership scope (used for object-level authorization). */
  async resolveScope(id: number): Promise<AcademyScope | null> {
    return resolveProgramScope(id);
  }

  async assertCanManage(actorId: number, id: number): Promise<void> {
    await assertCanManageAcademy(actorId, await resolveProgramScope(id));
  }

  async publish(id: number): Promise<AcademyProgramAttributes> {
    const existing = await programRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    validateProgramTransition(existing.status, 'published');
    await programRepository.updateStatus(id, 'published');
    const program = await programRepository.getById(id);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return program;
  }

  async archive(id: number): Promise<AcademyProgramAttributes> {
    const existing = await programRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    validateProgramTransition(existing.status, 'archived');
    await programRepository.updateStatus(id, 'archived');
    const program = await programRepository.getById(id);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return program;
  }

  async transitionStatus(id: number, newStatus: string): Promise<AcademyProgramAttributes> {
    const existing = await programRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    validateProgramTransition(existing.status, newStatus as any);
    await programRepository.updateStatus(id, newStatus);
    const program = await programRepository.getById(id);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return program;
  }

  async getCategories(scope: { orgIds?: number[]; branchIds?: number[] } = {}): Promise<string[]> {
    return programRepository.getCategories(scope);
  }

  async getDashboard(scope: { orgIds?: number[]; branchIds?: number[] } = {}): Promise<AcademyDashboard> {
    const d = await programRepository.getDashboard(scope);
    const capacityUtilization = d.capacity_sum > 0 ? Math.round((d.enrolled_sum / d.capacity_sum) * 100) : 0;
    return {
      total_programs: d.total_programs,
      published_programs: d.published_programs,
      running_programs: d.running_programs,
      total_groups: d.total_groups,
      total_players: d.total_players,
      waiting_list_count: d.waiting_list_count,
      capacity_utilization: capacityUtilization,
      attendance_summary: d.attendance_summary,
    };
  }
}

export const academyProgramService = new ProgramService();
