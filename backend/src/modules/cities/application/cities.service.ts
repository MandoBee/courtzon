import { citiesRepository } from '../infrastructure/repositories/cities.repository.js';

export const citiesService = {
  async listAll() { return citiesRepository.listAll(); },
  async listByProvince(provinceId: number) { return citiesRepository.listByProvince(provinceId); },
  async getById(id: number) { return citiesRepository.getById(id); },
  async create(data: any) { const id = await citiesRepository.create(data); return citiesRepository.getById(id); },
  async update(id: number, data: any) { await citiesRepository.update(id, data); return citiesRepository.getById(id); },
  async delete(id: number) { await citiesRepository.delete(id); },
};
