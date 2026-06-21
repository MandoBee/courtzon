import { banksRepository } from '../infrastructure/repositories/banks.repository.js';

export const banksService = {
  list: (countryId?: number) => banksRepository.list(countryId),
  get: (id: number) => banksRepository.findById(id),
  create: (data: any) => banksRepository.create(data).then(id => banksRepository.findById(id)),
  update: (id: number, data: any) => banksRepository.update(id, data).then(() => banksRepository.findById(id)),
  remove: (id: number) => banksRepository.remove(id),

  listBranches: (bankId?: number) => banksRepository.listBranches(bankId),
  getBranch: (id: number) => banksRepository.findBranchById(id),
  createBranch: (data: any) => banksRepository.createBranch(data).then(id => banksRepository.findBranchById(id)),
  updateBranch: (id: number, data: any) => banksRepository.updateBranch(id, data).then(() => banksRepository.findBranchById(id)),
  removeBranch: (id: number) => banksRepository.removeBranch(id),
};
