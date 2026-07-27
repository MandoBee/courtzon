import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { validateEnrollmentTransition } from '../domain/lifecycle.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { AcademyEnrollmentAttributes } from '../domain/academy.types.js';

class EnrollmentService {
  async list(filters: {
    page?: number; limit?: number; programId?: number; groupId?: number;
    playerId?: number; status?: string;
  }) {
    return enrollmentRepository.list(filters);
  }

  async getById(id: number) {
    const enrollment = await enrollmentRepository.getById(id);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    return enrollment;
  }

  async enroll(data: {
    player_id: number; program_id: number; group_id?: number; membership_id?: number;
  }): Promise<any> {
    const program = await programRepository.getById(data.program_id);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

    const existing = await enrollmentRepository.getByPlayerAndProgram(data.player_id, data.program_id);
    if (existing) throw new ConflictError('Player already enrolled in this program', ErrorCodes.ACADEMY_PLAYER_ALREADY_ASSIGNED);

    const confirmedCount = await enrollmentRepository.getConfirmedCount(data.program_id);

    let status: string;
    let waitingOrder: number | null = null;

    if (program.capacity > 0 && confirmedCount >= program.capacity) {
      waitingOrder = await enrollmentRepository.getNextWaitingOrder(data.program_id);
      status = 'waiting';
    } else {
      status = 'confirmed';
    }

    if (data.group_id) {
      const group = await groupRepository.getById(data.group_id);
      if (!group) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
      const groupCount = await enrollmentRepository.getGroupConfirmedCount(data.group_id);
      if (group.capacity > 0 && groupCount >= group.capacity) {
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
    });

    return enrollmentRepository.getById(id);
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

  async confirm(id: number): Promise<void> {
    const enrollment = await enrollmentRepository.getById(id);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    validateEnrollmentTransition(enrollment.status, 'confirmed');
    await enrollmentRepository.updateStatus(id, 'confirmed');
  }

  async moveToGroup(id: number, groupId: number): Promise<any> {
    const enrollment = await enrollmentRepository.getById(id);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    const group = await groupRepository.getById(groupId);
    if (!group) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    if (group.status === 'archived') throw new ConflictError('Cannot move to archived group', ErrorCodes.ACADEMY_INVALID_TRANSITION);

    const groupCount = await enrollmentRepository.getGroupConfirmedCount(groupId);
    if (group.capacity > 0 && groupCount >= group.capacity) {
      throw new ConflictError('Group is full', ErrorCodes.ACADEMY_GROUP_FULL);
    }

    await enrollmentRepository.moveToGroup(id, groupId);
    return enrollmentRepository.getById(id);
  }

  async getHistory(enrollmentId: number): Promise<any[]> {
    const enrollment = await enrollmentRepository.getById(enrollmentId);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    return enrollmentRepository.getHistory(enrollmentId);
  }
}

export const academyEnrollmentService = new EnrollmentService();
