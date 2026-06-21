import { provincesRepository } from '../infrastructure/repositories/provinces.repository.js';

export const provincesService = {
  async listAll() { return provincesRepository.listAll(); },
  async listByCountry(countryId: number) { return provincesRepository.listByCountry(countryId); },
  async getById(id: number) { return provincesRepository.getById(id); },
  async create(data: any) { const id = await provincesRepository.create(data); return provincesRepository.getById(id); },
  async update(id: number, data: any) { await provincesRepository.update(id, data); return provincesRepository.getById(id); },
  async delete(id: number) { await provincesRepository.delete(id); },
};
