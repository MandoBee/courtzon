import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as service from '../application/org-portal.service.js';
import * as orgRepo from '../infrastructure/repositories/org-portal.repository.js';
import { organisationService } from '../application/organisation.service.js';
import { BranchFinancialDetailsSchema, CreateBranchSchema, CreateResourceSchema } from './organisation.dto.js';
import { auditOrganisationMutation } from './organisation-audit.js';
import { cancellationPolicyRepository } from '../infrastructure/repositories/cancellation-policy.repository.js';
import { rbacRepository } from '../../rbac/infrastructure/repositories/rbac.repository.js';

const ASSIGNABLE_ROLES = ['org-admin', 'shop-admin', 'branch-mgr', 'resource-mgr', 'coach', 'accountant'] as const;
const AddStaffSchema = z.object({
  email: z.string().email(),
  roleSlug: z.enum(ASSIGNABLE_ROLES),
  branchIds: z.array(z.number().int().positive()).optional(),
  resourceIds: z.array(z.number().int().positive()).optional(),
  permissionIds: z.array(z.number().int().positive()).optional(),
});
const ChangeStaffRoleSchema = z.object({
  roleSlug: z.enum(ASSIGNABLE_ROLES),
  branchIds: z.array(z.number().int().positive()).optional(),
  resourceIds: z.array(z.number().int().positive()).optional(),
});
const InviteCoachSchema = z.object({
  coachId: z.coerce.number().int().positive(),
  coachSplitPct: z.coerce.number().min(0).max(100),
  orgSplitPct: z.coerce.number().min(0).max(100),
  hourlyRate: z.coerce.number().positive().optional(),
});
const UpdateMemberAccessSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'banned']),
  note: z.string().max(500).optional(),
});

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 200) || 'branch';

export async function getOrgInfoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const org = await service.getOrgInfo(parseInt(orgId, 10));
  if (!org) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Organisation not found' });
  return reply.send(org);
}

export async function getOrgStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const stats = await service.getOrgStats(parseInt(orgId, 10));
  return reply.send(stats);
}

export async function getOrgBookingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const { branchId, resourceId, date, status, paymentStatus, bookingType, page, limit } = request.query as any;
  const filters: any = {};
  if (branchId) filters.branchId = Number(branchId);
  if (resourceId) filters.resourceId = Number(resourceId);
  if (date) filters.date = date;
  if (status) filters.status = status;
  if (paymentStatus) filters.paymentStatus = paymentStatus;
  if (bookingType) filters.bookingType = bookingType;
  if (page) filters.page = Number(page);
  if (limit) filters.limit = Number(limit);
  const { rows, total } = await service.getOrgBookings(parseInt(orgId, 10), filters);
  return reply.send({ data: rows, total, page: filters.page || 1, limit: filters.limit || 20 });
}

export async function getOrgResourcesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const resources = await service.getOrgResources(parseInt(orgId, 10));
  return reply.send(resources);
}

export async function getOrgProductsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const { page, limit, sportId, status, branchId } = request.query as any;
  const products = await service.getOrgProducts(parseInt(orgId, 10), Number(page) || 1, Number(limit) || 20, sportId ? Number(sportId) : undefined, status, branchId ? Number(branchId) : undefined);
  return reply.send(products);
}

// ── Org self-service: organisation profile (D4) ──
export async function updateOrgInfoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const oid = parseInt(orgId, 10);
  const body: Record<string, unknown> = { ...(request.body as any) };
  // Org self-service must NOT be able to self-verify / (de)activate or change ownership.
  for (const k of ['isVerified', 'isActive', 'is_verified', 'is_active', 'ownerId', 'owner_id']) delete body[k];
  const org = await organisationService.updateOrganisation(oid, body);
  auditOrganisationMutation(request, 'ORGANISATION.UPDATE', 'organisation', oid);
  return reply.send(org);
}

// ── Org self-service: Branches ──
export async function listOrgBranchesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  return reply.send(await orgRepo.listOrgBranches(parseInt(orgId, 10)));
}

export async function createOrgBranchHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const oid = parseInt(orgId, 10);
  const raw = request.body as any;
  const data = CreateBranchSchema.parse({
    ...raw,
    organisationId: oid,
    slug: raw.slug || slugify(raw.name || ''),
  });
  const branch = await organisationService.createBranch(data);
  auditOrganisationMutation(request, 'BRANCH.CREATE', 'branch', (branch as any)?.id, { organisationId: oid });
  return reply.status(201).send(branch);
}

export async function updateOrgBranchHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, branchId } = request.params as { orgId: string; branchId: string };
  const oid = parseInt(orgId, 10);
  const bid = parseInt(branchId, 10);
  if (!(await orgRepo.branchBelongsToOrg(bid, oid))) {
    return reply.status(403).send({ error: 'FORBIDDEN', message: 'Branch does not belong to this organisation' });
  }
  try { await orgRepo.assertUserBranchAccess((request as any).userId, bid, oid); }
  catch (e: any) { return reply.status(403).send({ error: 'FORBIDDEN', message: e.message }); }
  const body = CreateBranchSchema.omit({ organisationId: true, slug: true }).partial().parse(request.body);
  const branch = await organisationService.updateBranch(bid, body);
  auditOrganisationMutation(request, 'BRANCH.UPDATE', 'branch', bid);
  return reply.send(branch);
}

export async function deleteOrgBranchHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, branchId } = request.params as { orgId: string; branchId: string };
  const oid = parseInt(orgId, 10);
  const bid = parseInt(branchId, 10);
  if (!(await orgRepo.branchBelongsToOrg(bid, oid))) {
    return reply.status(403).send({ error: 'FORBIDDEN', message: 'Branch does not belong to this organisation' });
  }
  try { await orgRepo.assertUserBranchAccess((request as any).userId, bid, oid); }
  catch (e: any) { return reply.status(403).send({ error: 'FORBIDDEN', message: e.message }); }
  await organisationService.deleteBranch(bid);
  auditOrganisationMutation(request, 'BRANCH.DELETE', 'branch', bid);
  return reply.send({ success: true });
}

export async function getOrgBranchFinancialDetailsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, branchId } = request.params as { orgId: string; branchId: string };
  const oid = parseInt(orgId, 10);
  const bid = parseInt(branchId, 10);
  if (!(await orgRepo.branchBelongsToOrg(bid, oid))) {
    return reply.status(403).send({ error: 'FORBIDDEN', message: 'Branch does not belong to this organisation' });
  }
  const details = await organisationService.getBranchFinancialDetails(bid);
  return reply.send({ data: details });
}

export async function updateOrgBranchFinancialDetailsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, branchId } = request.params as { orgId: string; branchId: string };
  const oid = parseInt(orgId, 10);
  const bid = parseInt(branchId, 10);
  if (!(await orgRepo.branchBelongsToOrg(bid, oid))) {
    return reply.status(403).send({ error: 'FORBIDDEN', message: 'Branch does not belong to this organisation' });
  }
  const body = BranchFinancialDetailsSchema.parse(request.body);
  const details = await organisationService.upsertBranchFinancialDetails(bid, body);
  auditOrganisationMutation(request, 'BRANCH.FINANCIAL.UPDATE', 'branch', bid);
  return reply.send({ data: details });
}

// ── Org self-service: Resources ──
export async function createOrgResourceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const oid = parseInt(orgId, 10);
  const data = CreateResourceSchema.parse(request.body);
  if (!(await orgRepo.branchBelongsToOrg(data.branchId, oid))) {
    return reply.status(403).send({ error: 'FORBIDDEN', message: 'Target branch does not belong to this organisation' });
  }
  try { await orgRepo.assertUserBranchAccess((request as any).userId, data.branchId, oid); }
  catch (e: any) { return reply.status(403).send({ error: 'FORBIDDEN', message: e.message }); }
  const resource = await organisationService.createResource(data);
  auditOrganisationMutation(request, 'RESOURCE.CREATE', 'resource', (resource as any)?.id, { branchId: data.branchId });
  return reply.status(201).send(resource);
}

export async function updateOrgResourceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, resourceId } = request.params as { orgId: string; resourceId: string };
  const oid = parseInt(orgId, 10);
  const rid = parseInt(resourceId, 10);
  if (!(await orgRepo.resourceBelongsToOrg(rid, oid))) {
    return reply.status(403).send({ error: 'FORBIDDEN', message: 'Resource does not belong to this organisation' });
  }
  const branchId = await orgRepo.getResourceBranchId(rid);
  if (branchId) {
    try { await orgRepo.assertUserBranchAccess((request as any).userId, branchId, oid); }
    catch (e: any) { return reply.status(403).send({ error: 'FORBIDDEN', message: e.message }); }
  }
  const body = CreateResourceSchema.omit({ branchId: true, resourceTypeId: true }).partial().parse(request.body);
  const resource = await organisationService.updateResource(rid, body);
  auditOrganisationMutation(request, 'RESOURCE.UPDATE', 'resource', rid);
  return reply.send(resource);
}

export async function deleteOrgResourceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, resourceId } = request.params as { orgId: string; resourceId: string };
  const oid = parseInt(orgId, 10);
  const rid = parseInt(resourceId, 10);
  if (!(await orgRepo.resourceBelongsToOrg(rid, oid))) {
    return reply.status(403).send({ error: 'FORBIDDEN', message: 'Resource does not belong to this organisation' });
  }
  const branchId = await orgRepo.getResourceBranchId(rid);
  if (branchId) {
    try { await orgRepo.assertUserBranchAccess((request as any).userId, branchId, oid); }
    catch (e: any) { return reply.status(403).send({ error: 'FORBIDDEN', message: e.message }); }
  }
  await organisationService.deleteResource(rid);
  auditOrganisationMutation(request, 'RESOURCE.DELETE', 'resource', rid);
  return reply.send({ success: true });
}

// ── Org self-service: Staff management (D5) ──
export async function listOrgStaffHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  return reply.send({ data: await service.listOrgStaff(parseInt(orgId, 10)) });
}

export async function addOrgStaffHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const oid = parseInt(orgId, 10);
  const { email, roleSlug, branchIds, resourceIds, permissionIds } = AddStaffSchema.parse(request.body);
  const actorId = (request as any).userId;
  const result = await service.addOrgStaff(oid, email, roleSlug, actorId, branchIds, resourceIds, permissionIds);
  auditOrganisationMutation(request, 'ORG_STAFF.ADD', 'organisation', oid, { staffUserId: result.userId, roleSlug, branchIds, resourceIds });
  return reply.status(201).send(result);
}

export async function getTemplateRolePermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as { slug: string };
  const role = await orgRepo.getAssignableOrgRole(slug);
  if (!role) throw new Error('Role not found');
  const permissions = await rbacRepository.getRolePermissionsWithLabels(role.id);
  return reply.send({ data: { roleId: role.id, roleSlug: role.slug, roleName: role.name, permissions } });
}

export async function changeOrgStaffRoleHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.params as { orgId: string; userId: string };
  const oid = parseInt(orgId, 10);
  const targetUserId = parseInt(userId, 10);
  const { roleSlug, branchIds, resourceIds } = ChangeStaffRoleSchema.parse(request.body);
  const actorId = (request as any).userId;
  const result = await service.changeOrgStaffRole(oid, targetUserId, roleSlug, actorId, branchIds, resourceIds);
  auditOrganisationMutation(request, 'ORG_STAFF.UPDATE_ROLE', 'organisation', oid, { staffUserId: targetUserId, roleSlug, branchIds, resourceIds });
  return reply.send(result);
}

export async function removeOrgStaffHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.params as { orgId: string; userId: string };
  const oid = parseInt(orgId, 10);
  const targetUserId = parseInt(userId, 10);
  await service.removeOrgStaff(oid, targetUserId);
  auditOrganisationMutation(request, 'ORG_STAFF.REMOVE', 'organisation', oid, { staffUserId: targetUserId });
  return reply.send({ success: true });
}

export async function getStaffPermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.params as { orgId: string; userId: string };
  const oid = parseInt(orgId, 10);
  const targetUserId = parseInt(userId, 10);
  const result = await service.getStaffPermissions(oid, targetUserId);
  return reply.send({ data: result });
}

export async function updateStaffPermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId } = request.params as { orgId: string; userId: string };
  const oid = parseInt(orgId, 10);
  const targetUserId = parseInt(userId, 10);
  const { permissionIds } = request.body as { permissionIds: number[] };
  const result = await service.updateStaffPermissions(oid, targetUserId, permissionIds);
  auditOrganisationMutation(request, 'ORG_STAFF.UPDATE_PERMISSIONS', 'organisation', oid, { staffUserId: targetUserId, permissionIds });
  return reply.send(result);
}

// ── Org self-service: Coach agreements / invites (D6) ──
export async function listOrgCoachesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  return reply.send({ data: await service.listOrgCoaches(parseInt(orgId, 10)) });
}

export async function listInvitableCoachesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  return reply.send({ data: await service.listInvitableCoaches(parseInt(orgId, 10)) });
}

export async function inviteCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const oid = parseInt(orgId, 10);
  const body = InviteCoachSchema.parse(request.body);
  const actorId = (request as any).userId;
  await service.inviteCoach(oid, { ...body, invitedBy: actorId });
  auditOrganisationMutation(request, 'ORG_COACH.INVITE', 'organisation', oid, { coachId: body.coachId, coachSplitPct: body.coachSplitPct, orgSplitPct: body.orgSplitPct, hourlyRate: body.hourlyRate });
  return reply.status(201).send({ message: 'Invite sent' });
}

export async function respondOrgCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, coachId } = request.params as { orgId: string; coachId: string };
  const body = z.object({ accept: z.boolean() }).parse(request.body);
  const oid = parseInt(orgId, 10);
  const cid = parseInt(coachId, 10);
  await service.respondToCoachAgreement(oid, cid, body.accept);
  auditOrganisationMutation(request, 'ORG_COACH.RESPOND', 'organisation', oid, { coachId: cid, accept: body.accept });
  return reply.send({ success: true, status: body.accept ? 'accepted' : 'rejected' });
}

export async function removeOrgCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, coachId } = request.params as { orgId: string; coachId: string };
  const oid = parseInt(orgId, 10);
  const cid = parseInt(coachId, 10);
  await service.removeCoachAgreement(oid, cid);
  auditOrganisationMutation(request, 'ORG_COACH.REMOVE', 'organisation', oid, { coachId: cid });
  return reply.send({ success: true });
}

// ── Facility members (branch access / membership — D8) ──
export async function listOrgMembersHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const { status, branchId } = request.query as { status?: string; branchId?: string };
  const filters: { status?: string; branchId?: number } = {};
  if (status) filters.status = status;
  if (branchId) filters.branchId = parseInt(branchId, 10);
  const data = await service.listOrgMembers(parseInt(orgId, 10), filters);
  return reply.send({ data });
}

export async function updateOrgMemberAccessHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, branchId, playerId } = request.params as { orgId: string; branchId: string; playerId: string };
  const oid = parseInt(orgId, 10);
  const bid = parseInt(branchId, 10);
  const pid = parseInt(playerId, 10);
  const { status, note } = UpdateMemberAccessSchema.parse(request.body);
  const reviewerId = (request as any).userId;
  await service.updateOrgMemberAccess(oid, bid, pid, status, reviewerId, note);
  auditOrganisationMutation(request, 'BRANCH_ACCESS.UPDATE_STATUS', 'branch', bid, { playerId: pid, status, note });
  return reply.send({ success: true });
}

export async function getOrgPolicySettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const settings = await cancellationPolicyRepository.getOrgPolicySettings(parseInt(orgId, 10));
  return reply.send(settings || {});
}

export async function updateOrgPolicySettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const oid = parseInt(orgId, 10);
  const body = request.body as any;
  if (body.policyLevel) {
    await cancellationPolicyRepository.updateOrgPolicyLevel(oid, body.policyLevel);
  }
  await cancellationPolicyRepository.updateOrgPolicySettings(oid, {
    cancellationBeforeHours: body.cancellationBeforeHours,
    cancellationFeePercentage: body.cancellationFeePercentage,
    cancellationFeeFixed: body.cancellationFeeFixed,
  });
  auditOrganisationMutation(request, 'CANCELLATION_SETTINGS.UPDATE', 'organisation', oid, {
    policyLevel: body.policyLevel,
    cancellationBeforeHours: body.cancellationBeforeHours,
    cancellationFeePercentage: body.cancellationFeePercentage,
    cancellationFeeFixed: body.cancellationFeeFixed,
  });
  return reply.send({ success: true });
}

// ── Subscription requests (org self-service) ──

const RequestSubscriptionSchema = z.object({
  planId: z.coerce.number().int().positive(),
  requestType: z.enum(['NEW_SUBSCRIPTION', 'PLAN_CHANGE']),
  notes: z.string().max(500).optional(),
});

export async function getOrgSubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const sub = await service.getOrgSubscriptionWithUsage(parseInt(orgId, 10));
  return reply.send(sub);
}

export async function getAvailablePlansHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const plans = await service.getAvailablePlansForOrg(parseInt(orgId, 10));
  return reply.send({ data: plans });
}

export async function submitSubscriptionRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const oid = parseInt(orgId, 10);
  const { planId, requestType, notes } = RequestSubscriptionSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await service.submitSubscriptionRequest(oid, userId, planId, requestType, notes);
  auditOrganisationMutation(request, 'SUBSCRIPTION.REQUEST', 'organisation', oid, { planId, requestType, notes });
  return reply.status(201).send(result);
}

export async function cancelSubscriptionRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, requestId } = request.params as { orgId: string; requestId: string };
  const userId = (request as any).userId;
  const result = await service.cancelMySubscriptionRequest(parseInt(orgId, 10), parseInt(requestId, 10), userId);
  auditOrganisationMutation(request, 'SUBSCRIPTION.REQUEST.CANCEL', 'organisation_upgrade_request', parseInt(requestId, 10), {});
  return reply.send(result);
}

export async function listOrgSubscriptionRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const requests = await service.listOrgSubscriptionRequests(parseInt(orgId, 10));
  return reply.send({ data: requests });
}

export async function getOrgTransactionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const { page = 1, limit = 20 } = request.query as any;
  const result = await service.getOrgTransactions(parseInt(orgId, 10), Number(page), Number(limit));
  return reply.send(result);
}

export async function getOrgSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as { orgId: string };
  const { page = 1, limit = 20 } = request.query as any;
  const result = await service.getOrgSettlements(parseInt(orgId, 10), Number(page), Number(limit));
  return reply.send(result);
}

export async function getOrgSettlementDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, settlementId } = request.params as { orgId: string; settlementId: string };
  const result = await service.getOrgSettlementDetail(parseInt(orgId, 10), parseInt(settlementId, 10));
  if (!result) return reply.status(404).send({ error: 'Settlement not found' });
  return reply.send(result);
}
