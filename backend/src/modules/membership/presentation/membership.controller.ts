import type { FastifyRequest, FastifyReply } from 'fastify';
import { membershipService } from '../application/membership.service.js';
import { membershipRepository } from '../infrastructure/repositories/membership.repository.js';
import { SubscribeSchema, CreatePlanSchema, EarnPointsSchema, ClaimRewardSchema, CreateCampaignSchema, CreateRewardSchema } from './membership.dto.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';

export async function getPlansHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await membershipService.getPlans();
  return reply.send({ data });
}

export async function getPlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const plan = await membershipRepository.findPlanById(Number(id));
  if (!plan) throw new NotFoundError('Plan');
  return reply.send({ data: plan });
}

export async function createPlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreatePlanSchema.parse(request.body);
  const id = await membershipService.createPlan(body as any);
  return reply.status(201).send({ data: { id } });
}

export async function subscribeHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = SubscribeSchema.parse(request.body);
  const id = await membershipService.subscribe(userId, body.planId);
  return reply.status(201).send({ data: { id } });
}

export async function getMyMembershipsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const data = await membershipService.getUserMemberships(userId);
  return reply.send({ data });
}

export async function getActiveMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const data = await membershipService.getActiveMembership(userId);
  return reply.send({ data });
}

export async function getLoyaltyHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const data = await membershipService.getLoyalty(userId);
  return reply.send({ data });
}

export async function earnPointsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = EarnPointsSchema.parse(request.body);
  const data = await membershipService.earnPoints(userId, body.amount, body.activityType);
  return reply.send({ data });
}

export async function getCampaignsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await membershipService.getCampaigns();
  return reply.send({ data });
}

export async function createCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateCampaignSchema.parse(request.body);
  const id = await membershipService.createCampaign(body as any);
  return reply.status(201).send({ data: { id } });
}

export async function getRewardsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await membershipService.getRewards();
  return reply.send({ data });
}

export async function createRewardHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateRewardSchema.parse(request.body);
  const id = await membershipService.createReward(body as any);
  return reply.status(201).send({ data: { id } });
}

export async function claimRewardHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = ClaimRewardSchema.parse(request.body);
  const id = await membershipService.claimReward(userId, body.rewardId);
  return reply.send({ data: { id } });
}
