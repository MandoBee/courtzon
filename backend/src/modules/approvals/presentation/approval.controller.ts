import type { FastifyRequest, FastifyReply } from 'fastify';
import { approvalService } from '../application/approval.service.js';
import { recordAudit } from '../../audit-log/index.js';

export async function listPendingApprovalsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const result = await approvalService.listPendingRegistrations({
    status: query.status,
    type: query.type,
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
  });
  return reply.send(result);
}

export async function approveRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const adminUserId = (request as any).userId;
  const { requestId } = request.params as any;
  const result = await approvalService.approveRegistration(adminUserId, Number(requestId));
  recordAudit({
    actorId: adminUserId,
    action: 'APPROVE',
    entityType: 'organisation_upgrade_request',
    entityId: Number(requestId),
    afterState: result,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function rejectRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const adminUserId = (request as any).userId;
  const { requestId } = request.params as any;
  const { reason } = request.body as any;
  const result = await approvalService.rejectRegistration(adminUserId, Number(requestId), reason);
  recordAudit({
    actorId: adminUserId,
    action: 'REJECT',
    entityType: 'organisation_upgrade_request',
    entityId: Number(requestId),
    afterState: result,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}
