import type { FastifyRequest, FastifyReply } from 'fastify';
import { financialAdminService } from '../application/financial-admin.service.js';

export async function listOrganisationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { search } = request.query as any;
  const result = await financialAdminService.listOrganisations(search);
  return reply.send(result);
}