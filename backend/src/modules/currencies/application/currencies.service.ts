import { currenciesRepository } from '../infrastructure/repositories/currencies.repository.js';

export const currenciesService = {
  async list() { return currenciesRepository.list(); },
  async listAll() { return currenciesRepository.listAll(); },
  async getById(id: number) { return currenciesRepository.getById(id); },
  async create(data: any) { const id = await currenciesRepository.create(data); return currenciesRepository.getById(id); },
  async update(id: number, data: any) { await currenciesRepository.update(id, data); return currenciesRepository.getById(id); },
  async delete(id: number) { await currenciesRepository.delete(id); },
};
