import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { validateProgramTransition } from '../domain/lifecycle.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { AcademyProgramAttributes, AcademyDashboard } from '../domain/academy.types.js';

class ProgramService {
  async list(filters: {
    page?: number; limit?: number; search?: string; category?: string; status?: string; is_public?: boolean;
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
    const id = await programRepository.create(data);
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

    await programRepository.update(id, data);
    const program = await programRepository.getById(id);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return program;
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

  async getCategories(): Promise<string[]> {
    return programRepository.getCategories();
  }

  async getDashboard(): Promise<AcademyDashboard> {
    const d = await programRepository.getDashboard();
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
