import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateMembershipPlanP1Schema,
  PlanVersionP1Schema,
  UpdatePlanVersionP1Schema,
  OrganisationMembershipSettingsP1Schema,
  PurchaseSubscriptionP1Schema,
} from './membership-p1.dto.js';
import { membershipPlanVersionService } from '../application/membership-plan-version.service.js';
import { membershipSubscriptionService } from '../application/membership-subscription.service.js';

function getUserId(request: FastifyRequest): number {
  return (request as any).userId;
}

function getOrgId(request: FastifyRequest): number {
  return parseInt(String((request.params as any).orgId), 10);
}

// ── Organisation membership settings ──────────────────────────────────────
export async function getOrgMembershipSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await membershipPlanVersionService.getOrganisationSettings(getOrgId(request)));
}

export async function saveOrgMembershipSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = OrganisationMembershipSettingsP1Schema.parse(request.body);
  return reply.send(await membershipPlanVersionService.saveOrganisationSettings(getOrgId(request), body));
}

// ── Membership plans + versions (org management) ──────────────────────────
export async function listOrgPlansHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await membershipPlanVersionService.listOrgPlans(getOrgId(request)));
}

export async function createPlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const actorId = getUserId(request);
  const planData = CreateMembershipPlanP1Schema.parse(request.body);
  const versionData = PlanVersionP1Schema.parse((request.body as any).version);
  const result = await membershipPlanVersionService.createPlanWithVersion(orgId, planData, versionData, actorId);
  return reply.status(201).send(result);
}

export async function updatePlanBasicHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const planId = parseInt(String((request.params as any).planId), 10);
  const body = CreateMembershipPlanP1Schema.partial().parse(request.body);
  await membershipPlanVersionService.updatePlanBasic(orgId, planId, body);
  return reply.send({ planId });
}

export async function createVersionHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const actorId = getUserId(request);
  const planId = parseInt(String((request.params as any).planId), 10);
  const data = PlanVersionP1Schema.parse(request.body);
  const versionId = await membershipPlanVersionService.createVersion(orgId, planId, data, actorId);
  return reply.status(201).send({ versionId });
}

export async function updateVersionHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const actorId = getUserId(request);
  const versionId = parseInt(String((request.params as any).versionId), 10);
  const data = UpdatePlanVersionP1Schema.parse(request.body);
  // A patch may omit plan-level fields; enforce a full draft update shape.
  const full = PlanVersionP1Schema.parse({ ...defaultsForPatch(), ...data });
  await membershipPlanVersionService.updateDraftVersion(orgId, versionId, full, actorId);
  return reply.send({ versionId });
}

export async function activateVersionHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const actorId = getUserId(request);
  const versionId = parseInt(String((request.params as any).versionId), 10);
  await membershipPlanVersionService.activateVersion(orgId, versionId, actorId);
  return reply.send({ versionId, status: 'active' });
}

export async function archiveVersionHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const versionId = parseInt(String((request.params as any).versionId), 10);
  await membershipPlanVersionService.archiveVersion(orgId, versionId);
  return reply.send({ versionId, status: 'archived' });
}

// ── Player storefront + purchase ──────────────────────────────────────────
export async function listActiveVersionsForPurchaseHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = parseInt(String((request.params as any).orgId), 10);
  return reply.send(await membershipPlanVersionService.listActiveVersionsForPurchase(orgId));
}

export async function createSubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = parseInt(String((request.params as any).orgId), 10);
  const userId = getUserId(request);
  const body = PurchaseSubscriptionP1Schema.parse(request.body);
  const result = await membershipSubscriptionService.createSubscription(orgId, userId, body.planVersionId, body.paymentMethod, userId);
  return reply.status(201).send(result);
}

export async function listMySubscriptionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  return reply.send(await membershipSubscriptionService.listMySubscriptions(userId));
}

export async function getMySubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const subId = parseInt(String((request.params as any).subscriptionId), 10);
  const rows = await membershipSubscriptionService.listMySubscriptions(userId);
  const sub = rows.find((r) => Number(r.id) === subId);
  if (!sub) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Membership subscription not found' });
  return reply.send(sub);
}

// ── Org subscriptions administration ────────────────────────────────────
export async function listOrgSubscriptionsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await membershipSubscriptionService.listOrgSubscriptions(getOrgId(request)));
}

export async function getOrgSubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const subId = parseInt(String((request.params as any).subscriptionId), 10);
  const sub = await membershipSubscriptionService.getSubscriptionScoped(subId, orgId);
  if (!sub) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Membership subscription not found' });
  return reply.send(sub);
}

export async function confirmCashHandler(request: FastifyRequest, reply: FastifyReply) {
  const actorId = getUserId(request);
  const orgId = getOrgId(request);
  const subId = parseInt(String((request.params as any).subscriptionId), 10);
  await membershipSubscriptionService.confirmCashPayment(orgId, subId, actorId);
  return reply.send({ subscriptionId: subId, status: 'paid' });
}

export async function completeCardHandler(request: FastifyRequest, reply: FastifyReply) {
  const actorId = getUserId(request);
  const orgId = getOrgId(request);
  const subId = parseInt(String((request.params as any).subscriptionId), 10);
  await membershipSubscriptionService.completeCardPayment(orgId, subId, actorId);
  return reply.send({ subscriptionId: subId, status: 'paid' });
}

function defaultsForPatch(): Record<string, unknown> {
  return {
    durationType: 'monthly',
    durationPeriods: 1,
    renewalModel: 'anniversary',
    initialChargeType: 'full',
    graceDays: 0,
    branchScope: 'ALL',
    allowedPaymentMethods: ['cash', 'card'],
    currency: 'EGP',
    components: [],
  };
}