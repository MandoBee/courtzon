import { getPool } from '../../../database/mysql.js';
import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { AcademyGroupAttributes } from '../domain/academy.types.js';

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

  async create(data: Partial<AcademyGroupAttributes>): Promise<any> {
    const program = await programRepository.getById(data.program_id!);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    const id = await groupRepository.create(data);
    return groupRepository.getById(id);
  }

  async update(id: number, data: Partial<AcademyGroupAttributes>): Promise<any> {
    const existing = await groupRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    await groupRepository.update(id, data);
    return groupRepository.getById(id);
  }

  async assignCoach(id: number, coachId: number | null): Promise<any> {
    const existing = await groupRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    if (coachId) {
      const pool = getPool();
      const [rows] = await pool.execute<import('mysql2').RowDataPacket[]>('SELECT id FROM users WHERE id = ?', [coachId]);
      if (!rows.length) throw new NotFoundError('Coach', ErrorCodes.ACADEMY_COACH_NOT_FOUND);
    }
    await groupRepository.updateCoach(id, coachId);
    return groupRepository.getById(id);
  }

  async archive(id: number): Promise<void> {
    const existing = await groupRepository.getById(id);
    if (!existing) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    await groupRepository.update(id, { status: 'archived' });
  }
}

export const academyGroupService = new GroupService();
