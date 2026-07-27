import { seasonRepository } from '../infrastructure/repositories/season.repository.js';
import { validateSeasonTransition } from '../domain/lifecycle.js';
import type { SeasonAttributes } from '../domain/league.types.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

export class SeasonService {
  async create(data: Partial<SeasonAttributes>): Promise<SeasonAttributes> {
    const existing = await seasonRepository.findByCode(data.code!);
    if (existing) throw new ConflictError('Season code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    const id = await seasonRepository.create(data);
    const season = await seasonRepository.findById(id);
    eventBusV2.emit('season.created', { seasonId: id, name: data.name } as Record<string, unknown>, {
      aggregateType: 'season', aggregateId: String(id), aggregateVersion: 1,
    });
    return season!;
  }

  async list(filters: {
    page?: number; limit?: number; search?: string; status?: string; sport_id?: number;
  }) {
    return seasonRepository.list(filters);
  }

  async getById(id: number): Promise<SeasonAttributes> {
    const s = await seasonRepository.findById(id);
    if (!s) throw new NotFoundError('Season', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return s;
  }

  async update(id: number, data: Partial<SeasonAttributes>): Promise<SeasonAttributes> {
    await this.getById(id);
    if (data.code) {
      const existing = await seasonRepository.findByCode(data.code);
      if (existing && existing.id !== id) throw new ConflictError('Season code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    }
    await seasonRepository.update(id, data);
    return this.getById(id);
  }

  async updateStatus(id: number, status: string): Promise<SeasonAttributes> {
    const s = await this.getById(id);
    validateSeasonTransition(s.status, status as any);
    await seasonRepository.updateStatus(id, status);
    return this.getById(id);
  }

  async publish(id: number) { return this.updateStatus(id, 'published'); }

  async archive(id: number) { return this.updateStatus(id, 'archived'); }
}

export const seasonService = new SeasonService();
