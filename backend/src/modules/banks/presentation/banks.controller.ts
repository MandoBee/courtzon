import type { FastifyRequest, FastifyReply } from 'fastify';
import { banksService } from '../application/banks.service.js';
import { CreateBankSchema, UpdateBankSchema, CreateBankBranchSchema, UpdateBankBranchSchema } from './banks.dto.js';
import { recordAudit } from '../../audit-log/index.js';

export async function listBanksHandler(req: FastifyRequest, reply: FastifyReply) {
  const { countryId } = req.query as any;
  const result = await banksService.list(countryId ? Number(countryId) : undefined);
  return reply.send({ data: result });
}

export async function getBankHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any;
  const bank = await banksService.get(Number(id));
  if (!bank) return reply.status(404).send({ error: 'Bank not found' });
  return reply.send({ data: bank });
}

export async function createBankHandler(req: FastifyRequest, reply: FastifyReply) {
  const data = CreateBankSchema.parse(req.body);
  const bank = await banksService.create(data);
  recordAudit({ actorId: (req as any).user?.id || null, action: 'create', entityType: 'bank', entityId: bank.id });
  return reply.status(201).send({ data: bank });
}

export async function updateBankHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any;
  const data = UpdateBankSchema.parse(req.body);
  const bank = await banksService.update(Number(id), data);
  recordAudit({ actorId: (req as any).user?.id || null, action: 'update', entityType: 'bank', entityId: Number(id) });
  return reply.send({ data: bank });
}

export async function deleteBankHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any;
  await banksService.remove(Number(id));
  recordAudit({ actorId: (req as any).user?.id || null, action: 'delete', entityType: 'bank', entityId: Number(id) });
  return reply.status(204).send();
}

export async function listBranchesHandler(req: FastifyRequest, reply: FastifyReply) {
  const { bankId } = req.query as any;
  const result = await banksService.listBranches(bankId ? Number(bankId) : undefined);
  return reply.send({ data: result });
}

export async function getBranchHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any;
  const branch = await banksService.getBranch(Number(id));
  if (!branch) return reply.status(404).send({ error: 'Bank branch not found' });
  return reply.send({ data: branch });
}

export async function createBranchHandler(req: FastifyRequest, reply: FastifyReply) {
  const data = CreateBankBranchSchema.parse(req.body);
  const branch = await banksService.createBranch(data);
  recordAudit({ actorId: (req as any).user?.id || null, action: 'create', entityType: 'bank_branch', entityId: branch.id });
  return reply.status(201).send({ data: branch });
}

export async function updateBranchHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any;
  const data = UpdateBankBranchSchema.parse(req.body);
  const branch = await banksService.updateBranch(Number(id), data);
  recordAudit({ actorId: (req as any).user?.id || null, action: 'update', entityType: 'bank_branch', entityId: Number(id) });
  return reply.send({ data: branch });
}

export async function deleteBranchHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any;
  await banksService.removeBranch(Number(id));
  recordAudit({ actorId: (req as any).user?.id || null, action: 'delete', entityType: 'bank_branch', entityId: Number(id) });
  return reply.status(204).send();
}
