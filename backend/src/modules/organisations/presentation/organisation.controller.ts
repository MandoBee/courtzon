/**
 * Admin/platform organisation routes (sports, orgs, branches, resources, subscriptions, etc.).
 * A5b: every state-changing handler below calls recordAudit (or auditOrganisationMutation in org-portal).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { organisationService } from '../application/organisation.service.js';
import { getUserCountryScope } from '../../../shared/helpers/country-scope.js';
import { recordAudit } from '../../audit-log/index.js';
import {
  CreateOrganisationSchema, UpdateOrganisationSchema, CreateBranchSchema,
  CreateResourceSchema, CreateSportSchema, UpdateSportSchema,
  OrgTypeSchema, UpdateOrgTypeSchema, ResourceTypeSchema,
  BranchFinancialDetailsSchema,
} from './organisation.dto.js';

export async function getSportsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const sports = await organisationService.getSports();
  return reply.send(sports);
}

export async function getMarketplaceSportsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const sports = await organisationService.getMarketplaceSports();
  return reply.send(sports);
}

export async function getAllSportsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const sports = await organisationService.getAllSports();
  return reply.send({ data: sports });
}

export async function getSportHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const sport = await organisationService.getSport(Number(id));
  return reply.send(sport);
}

export async function createSportHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateSportSchema.parse(request.body);
  const sport = await organisationService.createSport(body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SPORT.CREATE',
    entityType: 'sport',
    entityId: (sport as any)?.id,
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(sport);
}

export async function updateSportHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateSportSchema.parse(request.body);
  const sport = await organisationService.updateSport(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SPORT.UPDATE',
    entityType: 'sport',
    entityId: Number(id),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(sport);
}

export async function deleteSportHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await organisationService.deleteSport(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SPORT.DELETE',
    entityType: 'sport',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function getOrganisationTypesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const types = await organisationService.getOrganisationTypes();
  return reply.send({ data: types });
}

export async function createOrganisationTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = OrgTypeSchema.parse(request.body);
  const result = await organisationService.createOrganisationType(body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORG_TYPE.CREATE',
    entityType: 'organisation_type',
    entityId: (result as any)?.id,
    afterState: { slug: body.slug, name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function updateOrganisationTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateOrgTypeSchema.parse(request.body);
  const result = await organisationService.updateOrganisationType(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORG_TYPE.UPDATE',
    entityType: 'organisation_type',
    entityId: Number(id),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function deleteOrganisationTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await organisationService.deleteOrganisationType(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORG_TYPE.DELETE',
    entityType: 'organisation_type',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function listOrganisationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const scope = await getUserCountryScope((request as any).userId);
  const query = request.query as any;
  const result = await organisationService.listOrganisations({
    countryId: query.countryId ? Number(query.countryId) : scope.countryId || undefined,
    typeId: query.typeId ? Number(query.typeId) : undefined,
    ratingMin: query.ratingMin ? Number(query.ratingMin) : undefined,
    verified: query.verified !== undefined ? query.verified === 'true' : undefined,
    active: query.active !== undefined ? query.active === 'true' : undefined,
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 20,
  });
  return reply.send({ data: result.data, total: result.total, page: result.page || 1, limit: result.limit || 20 });
}

export async function getOrganisationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const org = await organisationService.getOrganisation(Number(id));
  return reply.send(org);
}

export async function getStorefrontHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const storefront = await organisationService.getStorefront(Number(id));
  return reply.send(storefront);
}

export async function createOrganisationHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateOrganisationSchema.parse(request.body);
  const userId = (request as any).userId || 1;
  const scope = await getUserCountryScope(userId);
  if (scope.countryId) {
    body.countryId = scope.countryId;
  }
  const org = await organisationService.createOrganisation(body, userId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORGANISATION.CREATE',
    entityType: 'organisation',
    entityId: (org as any)?.id,
    afterState: { name: body.name, slug: body.slug, orgTypeId: body.orgTypeId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(org);
}

export async function updateOrganisationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  try {
    const body = UpdateOrganisationSchema.parse(request.body);
    const scope = await getUserCountryScope((request as any).userId);
    if (scope.countryId) {
      const existing = await organisationService.getOrganisation(Number(id));
      if (existing.country_id !== scope.countryId) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Organisation not found' });
      }
    }
    const org = await organisationService.updateOrganisation(Number(id), body);
    recordAudit({
      actorId: (request as any).userId ?? null,
      action: 'ORGANISATION.UPDATE',
      entityType: 'organisation',
      entityId: Number(id),
      afterState: body,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send(org);
  } catch (e: any) {
    throw e;
  }
}

export async function deleteOrganisationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const scope = await getUserCountryScope((request as any).userId);
  if (scope.countryId) {
    const existing = await organisationService.getOrganisation(Number(id));
    if (existing.country_id !== scope.countryId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Organisation not found' });
    }
  }
  await organisationService.deleteOrganisation(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORGANISATION.DELETE',
    entityType: 'organisation',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function listBranchesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const branches = await organisationService.listBranches(Number(orgId));
  return reply.send({ data: branches });
}

export async function listBranchesBySportHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sportId } = request.query as any;
  const playerId = (request as any).userId;
  const branches = await organisationService.listBranchesBySport(Number(sportId), playerId);
  return reply.send({ data: branches });
}

export async function getBranchHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const branch = await organisationService.getBranch(Number(id));
  return reply.send(branch);
}

export async function getBranchFinancialDetailsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const details = await organisationService.getBranchFinancialDetails(Number(branchId));
  return reply.send({ data: details });
}

export async function upsertBranchFinancialDetailsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const body = BranchFinancialDetailsSchema.parse(request.body);
  const details = await organisationService.upsertBranchFinancialDetails(Number(branchId), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH.FINANCIAL.UPDATE',
    entityType: 'branch',
    entityId: Number(branchId),
    afterState: { branchId: Number(branchId) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ data: details });
}

export async function createBranchHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateBranchSchema.parse(request.body);
  const branch = await organisationService.createBranch(body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH.CREATE',
    entityType: 'branch',
    entityId: (branch as any)?.id,
    afterState: { name: body.name, organisationId: body.organisationId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(branch);
}

export async function updateBranchHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const branch = await organisationService.updateBranch(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH.UPDATE',
    entityType: 'branch',
    entityId: Number(id),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(branch);
}

export async function deleteBranchHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await organisationService.deleteBranch(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH.DELETE',
    entityType: 'branch',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function listResourcesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const resources = await organisationService.listResources(Number(branchId));
  return reply.send({ data: resources });
}

export async function getResourceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const resource = await organisationService.getResource(Number(id));
  return reply.send(resource);
}

export async function createResourceHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateResourceSchema.parse(request.body);
  const resource = await organisationService.createResource(body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'RESOURCE.CREATE',
    entityType: 'resource',
    entityId: (resource as any)?.id,
    afterState: { name: body.name, branchId: body.branchId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(resource);
}

export async function updateResourceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const resource = await organisationService.updateResource(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'RESOURCE.UPDATE',
    entityType: 'resource',
    entityId: Number(id),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(resource);
}

export async function deleteResourceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await organisationService.deleteResource(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'RESOURCE.DELETE',
    entityType: 'resource',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function getResourceTypesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const types = await organisationService.getResourceTypes();
  return reply.send({ data: types });
}

export async function createResourceTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = ResourceTypeSchema.parse(request.body);
  const result = await organisationService.createResourceType(body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'RESOURCE_TYPE.CREATE',
    entityType: 'resource_type',
    entityId: (result as any)?.id,
    afterState: { slug: body.slug, name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function listAmenitiesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const amenities = await organisationService.listAmenities();
  return reply.send({ data: amenities });
}

export async function getBranchAmenitiesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const amenities = await organisationService.getBranchAmenities(Number(id));
  return reply.send({ data: amenities });
}

export async function setBranchAmenitiesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { amenityIds } = request.body as any;
  const amenities = await organisationService.setBranchAmenities(Number(id), amenityIds);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH.SET_AMENITIES',
    entityType: 'branch',
    entityId: Number(id),
    afterState: { amenityIds },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ data: amenities });
}

export async function getAccessRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const requests = await organisationService.getAccessRequests(Number(branchId));
  return reply.send({ data: requests });
}

export async function approveAccessHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId, playerId } = request.params as any;
  const reviewerId = (request as any).userId;
  await organisationService.approveAccess(Number(branchId), Number(playerId), reviewerId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH_ACCESS.APPROVE',
    entityType: 'branch',
    entityId: Number(branchId),
    afterState: { playerId: Number(playerId) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function rejectAccessHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId, playerId } = request.params as any;
  const reviewerId = (request as any).userId;
  const { note } = request.body as any;
  await organisationService.rejectAccess(Number(branchId), Number(playerId), reviewerId, note);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH_ACCESS.REJECT',
    entityType: 'branch',
    entityId: Number(branchId),
    afterState: { playerId: Number(playerId), note },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function listSubscriptionPlansHandler(_request: FastifyRequest, reply: FastifyReply) {
  const plans = await organisationService.listSubscriptionPlans();
  return reply.send({ data: plans });
}

export async function listAllPlansHandler(_request: FastifyRequest, reply: FastifyReply) {
  const plans = await organisationService.listAllPlans();
  return reply.send({ data: plans });
}

export async function getPlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const plan = await organisationService.getPlan(Number(id));
  return reply.send({ data: plan });
}

export async function listSubscriptionFeaturesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const features = await organisationService.listSubscriptionFeatures();
  return reply.send({ data: features });
}

export async function createPlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const { CreatePlanSchema } = await import('./organisation.dto.js');
  const body = CreatePlanSchema.parse(request.body);
  const result = await organisationService.createPlan(body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PLAN.CREATE',
    entityType: 'subscription_plan',
    entityId: (result as any)?.id,
    afterState: { planName: body.planName, priceMonthly: body.priceMonthly, priceYearly: body.priceYearly, isUnlimited: body.isUnlimited },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ data: result });
}

export async function updatePlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { UpdatePlanSchema } = await import('./organisation.dto.js');
  const body = UpdatePlanSchema.parse(request.body);
  const result = await organisationService.updatePlan(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PLAN.UPDATE',
    entityType: 'subscription_plan',
    entityId: Number(id),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ data: result });
}

export async function deletePlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await organisationService.deletePlan(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PLAN.DELETE',
    entityType: 'subscription_plan',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function togglePlanHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await organisationService.togglePlan(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PLAN.TOGGLE',
    entityType: 'subscription_plan',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function getOrgSubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const subscription = await organisationService.getOrgSubscription(Number(orgId));
  return reply.send(subscription);
}

export async function getAllOrgSubscriptionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const scope = await getUserCountryScope((request as any).userId);
  const subscriptions = await organisationService.getAllOrganisationSubscriptions(scope.countryId);
  return reply.send({ data: subscriptions });
}

export async function updateOrgSubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const { UpdateOrgSubscriptionSchema } = await import('./organisation.dto.js');
  const { planId, billingCycle } = UpdateOrgSubscriptionSchema.parse(request.body);
  const result = await organisationService.updateOrgSubscription(Number(orgId), planId, billingCycle);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORG_SUBSCRIPTION.UPDATE',
    entityType: 'organisation',
    entityId: Number(orgId),
    afterState: { planId, billingCycle },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function activateSubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const result = await organisationService.activateSubscription(Number(orgId));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORG_SUBSCRIPTION.ACTIVATE',
    entityType: 'organisation',
    entityId: Number(orgId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function toggleSubscriptionStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const userId = (request as any).userId;
  const result = await organisationService.toggleSubscriptionStatus(Number(orgId));
  recordAudit({
    actorId: userId ?? null,
    action: 'SUBSCRIPTION.TOGGLE_STATUS',
    entityType: 'organisation_subscription',
    entityId: Number(orgId),
    afterState: { newStatus: result.status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function getPaymentMethodsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const methods = await organisationService.getPaymentMethods();
  return reply.send({ data: methods });
}

// ── Payment Methods Admin CRUD ──

export async function getAllPaymentMethodsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const methods = await organisationService.getPaymentMethods();
  return reply.send({ data: methods });
}

export async function createPaymentMethodHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const id = await organisationService.createPaymentMethod(body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PAYMENT_METHOD.CREATE',
    entityType: 'payment_method',
    entityId: id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id });
}

export async function updatePaymentMethodHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  await organisationService.updatePaymentMethod(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PAYMENT_METHOD.UPDATE',
    entityType: 'payment_method',
    entityId: Number(id),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deletePaymentMethodHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await organisationService.deletePaymentMethod(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PAYMENT_METHOD.DELETE',
    entityType: 'payment_method',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Payment Gateway Config Admin CRUD ──

export async function listGatewayConfigsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const configs = await organisationService.getGatewayConfigs();
  return reply.send({ data: configs });
}

export async function createGatewayConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const id = await organisationService.createGatewayConfig(body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PAYMENT_GATEWAY.CREATE',
    entityType: 'payment_gateway',
    entityId: id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id });
}

export async function updateGatewayConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  await organisationService.updateGatewayConfig(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PAYMENT_GATEWAY.UPDATE',
    entityType: 'payment_gateway',
    entityId: Number(id),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deleteGatewayConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await organisationService.deleteGatewayConfig(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PAYMENT_GATEWAY.DELETE',
    entityType: 'payment_gateway',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function getAllAccessRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { status, orgId, branchId } = request.query as any;
  const filters: any = {};
  if (status) filters.status = status;
  if (orgId) filters.orgId = Number(orgId);
  if (branchId) filters.branchId = Number(branchId);
  const requests = await organisationService.getAllAccessRequests(filters);
  return reply.send({ data: requests });
}

export async function requestAccessHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const playerId = (request as any).userId;
  await organisationService.requestAccess(Number(branchId), playerId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH_ACCESS.REQUEST',
    entityType: 'branch',
    entityId: Number(branchId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function getMyAccessHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const playerId = (request as any).userId;
  const status = await organisationService.getPlayerAccessStatus(Number(branchId), playerId);
  return reply.send({ status });
}

export async function updateAccessStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId, playerId } = request.params as any;
  const { status, note } = request.body as any;
  const reviewerId = (request as any).userId;
  await organisationService.updateAccessStatus(Number(branchId), Number(playerId), status, reviewerId, note);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH_ACCESS.UPDATE_STATUS',
    entityType: 'branch',
    entityId: Number(branchId),
    afterState: { playerId: Number(playerId), status, note },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

// Cancellation Policies
import { cancellationPolicyRepository } from '../infrastructure/repositories/cancellation-policy.repository.js';

export async function getOrgPoliciesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const policies = await cancellationPolicyRepository.findByOrg(Number(orgId));
  return reply.send({ data: policies });
}

export async function getBranchPoliciesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const policies = await cancellationPolicyRepository.findByBranch(Number(branchId));
  return reply.send({ data: policies });
}

export async function createPolicyHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const id = await cancellationPolicyRepository.create({
    organisationId: body.organisationId || undefined,
    branchId: body.branchId || undefined,
    cancellationWindowMinutes: body.cancellationWindowMinutes,
    refundPercent: body.refundPercent,
  });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'CANCELLATION_POLICY.CREATE',
    entityType: 'cancellation_policy',
    entityId: id,
    afterState: {
      organisationId: body.organisationId,
      branchId: body.branchId,
      cancellationWindowMinutes: body.cancellationWindowMinutes,
      refundPercent: body.refundPercent,
    },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id });
}

export async function updatePolicyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  await cancellationPolicyRepository.update(Number(id), {
    cancellationWindowMinutes: body.cancellationWindowMinutes,
    refundPercent: body.refundPercent,
    isActive: body.isActive,
  });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'CANCELLATION_POLICY.UPDATE',
    entityType: 'cancellation_policy',
    entityId: Number(id),
    afterState: {
      cancellationWindowMinutes: body.cancellationWindowMinutes,
      refundPercent: body.refundPercent,
      isActive: body.isActive,
    },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deletePolicyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await cancellationPolicyRepository.delete(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'CANCELLATION_POLICY.DELETE',
    entityType: 'cancellation_policy',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function getOrgPolicySettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const settings = await cancellationPolicyRepository.getOrgPolicySettings(Number(orgId));
  return reply.send(settings || {});
}

export async function updateOrgPolicySettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const body = request.body as any;
  if (body.policyLevel) {
    await cancellationPolicyRepository.updateOrgPolicyLevel(Number(orgId), body.policyLevel);
  }
  await cancellationPolicyRepository.updateOrgPolicySettings(Number(orgId), {
    cancellationBeforeHours: body.cancellationBeforeHours,
    cancellationFeePercentage: body.cancellationFeePercentage,
    cancellationFeeFixed: body.cancellationFeeFixed,
  });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'CANCELLATION_SETTINGS.UPDATE',
    entityType: 'organisation',
    entityId: Number(orgId),
    afterState: {
      policyLevel: body.policyLevel,
      cancellationBeforeHours: body.cancellationBeforeHours,
      cancellationFeePercentage: body.cancellationFeePercentage,
      cancellationFeeFixed: body.cancellationFeeFixed,
    },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

// ── Branch Holidays ──

export async function getBranchHolidaysHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const holidays = await organisationService.getBranchHolidays(Number(branchId));
  return reply.send({ data: holidays });
}

export async function createBranchHolidayHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const body = request.body as any;
  const holidays = await organisationService.createBranchHoliday(Number(branchId), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH_HOLIDAY.CREATE',
    entityType: 'branch',
    entityId: Number(branchId),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ data: holidays });
}

export async function updateBranchHolidayHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  await organisationService.updateBranchHoliday(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH_HOLIDAY.UPDATE',
    entityType: 'branch_holiday',
    entityId: Number(id),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deleteBranchHolidayHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await organisationService.deleteBranchHoliday(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BRANCH_HOLIDAY.DELETE',
    entityType: 'branch_holiday',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

// ── Resource Maintenance ──

export async function getResourceMaintenanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { resourceId } = request.params as any;
  const records = await organisationService.getResourceMaintenance(Number(resourceId));
  return reply.send({ data: records });
}

export async function createResourceMaintenanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { resourceId } = request.params as any;
  const body = request.body as any;
  const records = await organisationService.createResourceMaintenance(Number(resourceId), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'RESOURCE_MAINTENANCE.CREATE',
    entityType: 'resource',
    entityId: Number(resourceId),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ data: records });
}

export async function updateResourceMaintenanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  await organisationService.updateResourceMaintenance(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'RESOURCE_MAINTENANCE.UPDATE',
    entityType: 'resource_maintenance',
    entityId: Number(id),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deleteResourceMaintenanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await organisationService.deleteResourceMaintenance(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'RESOURCE_MAINTENANCE.DELETE',
    entityType: 'resource_maintenance',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

// ── Resource Peak Hours ──

export async function upsertResourcePeakHoursHandler(request: FastifyRequest, reply: FastifyReply) {
  const { resourceId } = request.params as any;
  const { peakHours } = request.body as any;
  const resource = await organisationService.upsertResourcePeakHours(Number(resourceId), peakHours);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'RESOURCE_PEAK_HOURS.UPSERT',
    entityType: 'resource',
    entityId: Number(resourceId),
    afterState: { peakHours },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(resource);
}

// ── Admin subscription requests ──

export async function listSubscriptionRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { status, page, limit, type, search, dateFrom, dateTo, sortBy, sortDir } = request.query as any;
  const result = await organisationService.listSubscriptionRequests({
    status: status || 'pending',
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
    type,
    search,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
  });
  return reply.send({ data: result.rows, total: result.total, page: result.page, limit: result.limit });
}

export async function getSubscriptionRequestDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  const { requestId } = request.params as any;
  const detail = await organisationService.getSubscriptionRequestDetail(Number(requestId));
  if (!detail) return reply.status(404).send({ error: 'Not found' });
  return reply.send(detail);
}

export async function approveSubscriptionRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const { requestId } = request.params as any;
  const adminId = (request as any).userId;
  const { approvalNotes } = request.body as any;
  const result = await organisationService.approveSubscriptionRequest(Number(requestId), adminId, approvalNotes);
  recordAudit({
    actorId: adminId,
    action: 'SUBSCRIPTION_REQUEST.APPROVE',
    entityType: 'organisation_upgrade_request',
    entityId: Number(requestId),
    afterState: { organisationId: (result as any).organisation_id, requestType: (result as any).request_type },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  // Record subscription activation
  recordAudit({
    actorId: adminId,
    action: 'SUBSCRIPTION.ACTIVATED',
    entityType: 'organisation_subscription',
    entityId: (result as any).organisation_id,
    afterState: { organisationId: (result as any).organisation_id, requestType: (result as any).request_type, requestedPlan: (result as any).requested_plan_name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  // Notify org
  const { eventBus } = await import('../../../shared/event-bus/index.js');
  eventBus.emit('subscription:request-approved', {
    organisationId: (result as any).organisation_id,
    requestId: Number(requestId),
    requestType: (result as any).request_type,
    requestedPlanName: (result as any).requested_plan_name,
    approvedBy: adminId,
  });

  return reply.send({ success: true });
}

export async function getSubscriptionRequestStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const stats = await organisationService.getSubscriptionRequestStats();
  return reply.send(stats);
}

export async function rejectSubscriptionRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const { requestId } = request.params as any;
  const { reason } = request.body as any;
  const adminId = (request as any).userId;
  const result = await organisationService.rejectSubscriptionRequest(Number(requestId), adminId, reason || 'No reason provided');
  recordAudit({
    actorId: adminId,
    action: 'SUBSCRIPTION_REQUEST.REJECT',
    entityType: 'organisation_upgrade_request',
    entityId: Number(requestId),
    afterState: { reason, requestType: (result as any).request_type },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  recordAudit({
    actorId: adminId,
    action: 'SUBSCRIPTION.REJECTED',
    entityType: 'organisation_subscription',
    entityId: (result as any).organisation_id,
    afterState: { reason, requestType: (result as any).request_type },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  const { eventBus } = await import('../../../shared/event-bus/index.js');
  eventBus.emit('subscription:request-rejected', {
    organisationId: (result as any).organisation_id,
    requestId: Number(requestId),
    requestType: (result as any).request_type,
    requestedPlanName: (result as any).requested_plan_name,
    reason: reason || 'No reason provided',
    rejectedBy: adminId,
  });

  return reply.send({ success: true });
}
