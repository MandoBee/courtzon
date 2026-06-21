import { languagesRepository } from '../infrastructure/repositories/languages.repository.js';

export const languagesService = {
  async list() { return languagesRepository.list(); },
  async listAll() { return languagesRepository.listAll(); },
  async getById(id: number) { return languagesRepository.getById(id); },
  async create(data: any) { const id = await languagesRepository.create(data); return languagesRepository.getById(id); },
  async update(id: number, data: any) { await languagesRepository.update(id, data); return languagesRepository.getById(id); },
  async delete(id: number) { await languagesRepository.delete(id); },
};
