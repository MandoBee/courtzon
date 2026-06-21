import { countriesRepository } from '../infrastructure/repositories/countries.repository.js';

export const countriesService = {
  async list() { return countriesRepository.list(); },
  async listAll() { return countriesRepository.listAll(); },
  async getById(id: number) { return countriesRepository.getById(id); },
  async create(data: any) { const id = await countriesRepository.create(data); return countriesRepository.getById(id); },
  async update(id: number, data: any) { await countriesRepository.update(id, data); return countriesRepository.getById(id); },
  async delete(id: number) { await countriesRepository.delete(id); },
};
