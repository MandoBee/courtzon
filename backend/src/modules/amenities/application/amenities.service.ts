import { amenitiesRepository } from '../infrastructure/repositories/amenities.repository.js';

export const amenitiesService = {
  async listAll() { return amenitiesRepository.listAll(); },
  async getById(id: number) { return amenitiesRepository.getById(id); },
  async create(data: any) { const id = await amenitiesRepository.create(data); return amenitiesRepository.getById(id); },
  async update(id: number, data: any) { await amenitiesRepository.update(id, data); return amenitiesRepository.getById(id); },
  async delete(id: number) { await amenitiesRepository.delete(id); },
};
