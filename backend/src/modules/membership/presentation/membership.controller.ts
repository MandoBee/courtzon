import type { FastifyRequest, FastifyReply } from 'fastify';
import { membershipPlanService } from '../application/membership-plan.service.js';
import { userMembershipService } from '../application/user-membership.service.js';
import {
  CreateMembershipPlanSchema,
  UpdateMembershipPlanSchema,
  ListMembershipPlansQuerySchema,
  AssignMembershipSchema,
  RenewMembershipSchema,
  ListUserMembershipsQuerySchema,
} from './membership.dto.js';
import { recordAudit } from '../../audit-log/index.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

function getUserId(request: FastifyRequest): number {
  return (request as any).userId;
}

function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

export async function listPlansHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListMembershipPlansQuerySchema.parse(request.query);
  const result = await membershipPlanService.list(query);
  return reply.send(result);
}

export async function getPlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const plan = await membershipPlanService.getById(Number(id));
  if (!plan) throw new NotFoundError('Membership plan', ErrorCodes.MEMBERSHIP_NOT_FOUND);
  return reply.send(plan);
}

export async function createPlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateMembershipPlanSchema.parse(request.body);
  const plan = await membershipPlanService.create(body, userId);
  recordAudit({
    actorId: userId,
    action: 'MEMBERSHIP_PLAN.CREATE',
    entityType: 'membership_plan',
    entityId: plan.id!,
    afterState: { code: body.code, name: body.name, category: body.category, price: body.price },
    ipAddress: request.ip,
    userAgent: getUserAgent(request),
  });
  return reply.status(201).send(plan);
}

export async function updatePlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateMembershipPlanSchema.parse(request.body);
  const before = await membershipPlanService.getById(Number(id));
  const plan = await membershipPlanService.update(Number(id), body, userId);
  recordAudit({
    actorId: userId,
    action: 'MEMBERSHIP_PLAN.UPDATE',
    entityType: 'membership_plan',
    entityId: Number(id),
    beforeState: before ? { code: before.code, name: before.name } : null,
    afterState: { code: body.code, name: body.name },
    ipAddress: request.ip,
    userAgent: getUserAgent(request),
  });
  return reply.send(plan);
}

export async function deletePlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const before = await membershipPlanService.getById(Number(id));
  await membershipPlanService.delete(Number(id), userId);
  recordAudit({
    actorId: userId,
    action: 'MEMBERSHIP_PLAN.DELETE',
    entityType: 'membership_plan',
    entityId: Number(id),
    beforeState: before ? { code: before.code, name: before.name } : null,
    ipAddress: request.ip,
    userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

export async function getPlanOptionsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const options = await membershipPlanService.getOptions();
  return reply.send(options);
}

export async function assignMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = AssignMembershipSchema.parse(request.body);
  const startDate = body.start_date || new Date().toISOString().split('T')[0];
  const membershipId = await userMembershipService.assign(body.user_id, body.plan_id, startDate, body.renewal_type);
  recordAudit({
    actorId: userId,
    action: 'USER_MEMBERSHIP.ASSIGN',
    entityType: 'user_membership',
    entityId: membershipId,
    afterState: { userId: body.user_id, planId: body.plan_id, startDate, renewalType: body.renewal_type },
    ipAddress: request.ip,
    userAgent: getUserAgent(request),
  });
  return reply.status(201).send({ id: membershipId });
}

export async function listAssignmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListUserMembershipsQuerySchema.parse(request.query);
  const { user_id } = request.query as any;
  const result = await userMembershipService.getUserMemberships(Number(user_id), query);
  return reply.send(result);
}

export async function getUserMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const membership = await userMembershipService.getById(Number(id));
  if (!membership) throw new NotFoundError('User membership', ErrorCodes.MEMBERSHIP_NOT_FOUND);
  return reply.send(membership);
}

export async function freezeMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await userMembershipService.freeze(Number(id));
  recordAudit({
    actorId: userId,
    action: 'USER_MEMBERSHIP.FREEZE',
    entityType: 'user_membership',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Membership frozen' });
}

export async function resumeMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await userMembershipService.resume(Number(id));
  recordAudit({
    actorId: userId,
    action: 'USER_MEMBERSHIP.RESUME',
    entityType: 'user_membership',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Membership resumed' });
}

export async function cancelMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await userMembershipService.cancel(Number(id));
  recordAudit({
    actorId: userId,
    action: 'USER_MEMBERSHIP.CANCEL',
    entityType: 'user_membership',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Membership cancelled' });
}

export async function renewMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = RenewMembershipSchema.parse(request.body);
  await userMembershipService.renew(Number(id), body.plan_id);
  recordAudit({
    actorId: userId,
    action: 'USER_MEMBERSHIP.RENEW',
    entityType: 'user_membership',
    entityId: Number(id),
    afterState: { planId: body.plan_id },
    ipAddress: request.ip,
    userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Membership renewed' });
}

export async function getMembershipHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const history = await userMembershipService.getHistory(Number(id));
  return reply.send(history);
}
