import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as service from '../application/org-portal.service.js';
import * as orgRepo from '../infrastructure/repositories/org-portal.repository.js';
import { organisationService } from '../application/organisation.service.js';
import { BranchFinancialDetailsSchema, CreateBranchSchema, CreateResourceSchema } from './organisation.dto.js';
import { auditOrganisationMutation } from './organisation-audit.js';
import { cancellationPolicyRepository } from '../infrastructure/repositories/cancellation-policy.repository.js';
import { rbacRepository } from '../../rbac/infrastructure/repositories/rbac.repository.js';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';

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

function getUserId(request: FastifyRequest): number { return (request as any).userId; }

function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

export async function getOrgDashboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const dashboard = await service.getOrgDashboard(Number(orgId));
  return reply.send(dashboard);
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
  return reply.send({ success: true, status: body.accept ? 'active' : 'rejected' });
}

export async function removeOrgCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, coachId } = request.params as { orgId: string; coachId: string };
  const oid = parseInt(orgId, 10);
  const cid = parseInt(coachId, 10);
  await service.removeCoachAgreement(oid, cid);
  auditOrganisationMutation(request, 'ORG_COACH.REMOVE', 'organisation', oid, { coachId: cid });
  return reply.send({ success: true });
}

export async function suspendOrgCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, coachId } = request.params as any;
  const actorId = (request as any).userId;
  await service.suspendCoachAgreement(Number(orgId), Number(coachId));
  recordAudit({
    actorId,
    action: 'ORG_COACH.SUSPEND',
    entityType: 'coach_org_agreement',
    entityId: Number(coachId),
    afterState: { organisationId: Number(orgId), status: 'suspended' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ data: { status: 'suspended' } });
}

export async function resumeOrgCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, coachId } = request.params as any;
  const actorId = (request as any).userId;
  await service.resumeCoachAgreement(Number(orgId), Number(coachId));
  recordAudit({
    actorId,
    action: 'ORG_COACH.RESUME',
    entityType: 'coach_org_agreement',
    entityId: Number(coachId),
    afterState: { organisationId: Number(orgId), status: 'active' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ data: { status: 'active' } });
}

export async function endOrgCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, coachId } = request.params as any;
  const actorId = (request as any).userId;
  await service.endCoachAgreement(Number(orgId), Number(coachId));
  recordAudit({
    actorId,
    action: 'ORG_COACH.END',
    entityType: 'coach_org_agreement',
    entityId: Number(coachId),
    afterState: { organisationId: Number(orgId), status: 'ended' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ data: { status: 'ended' } });
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

// ── Announcements ──

export async function listAnnouncementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [rows] = await pool.query<RowData>(
    'SELECT * FROM org_announcements WHERE organisation_id = ? ORDER BY created_at DESC', [Number(orgId)],
  );
  return reply.send(rows);
}

export async function createAnnouncementHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { orgId } = request.params as any;
  const body = request.body as any;
  const pool = getPool();
  const [result] = await pool.execute<import('mysql2').ResultSetHeader>(
    'INSERT INTO org_announcements (organisation_id, title, content, priority, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [Number(orgId), body.title, body.content, body.priority || 'normal', body.status || 'draft', userId],
  );
  recordAudit({
    actorId: userId, action: 'ORG_ANNOUNCEMENT.CREATE', entityType: 'org_announcement',
    entityId: (result as any).insertId, afterState: { title: body.title },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send({ id: (result as any).insertId });
}

export async function updateAnnouncementHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { announcementId } = request.params as any;
  const body = request.body as any;
  const pool = getPool();
  const fields: string[] = []; const params: any[] = [];
  if (body.title !== undefined) { fields.push('title = ?'); params.push(body.title); }
  if (body.content !== undefined) { fields.push('content = ?'); params.push(body.content); }
  if (body.priority !== undefined) { fields.push('priority = ?'); params.push(body.priority); }
  if (body.status !== undefined) { fields.push('status = ?'); params.push(body.status); }
  if (fields.length) {
    params.push(Number(announcementId));
    await pool.execute(`UPDATE org_announcements SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
  }
  recordAudit({
    actorId: userId, action: 'ORG_ANNOUNCEMENT.UPDATE', entityType: 'org_announcement',
    entityId: Number(announcementId), afterState: body,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

export async function deleteAnnouncementHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { announcementId } = request.params as any;
  const pool = getPool();
  await pool.execute('DELETE FROM org_announcements WHERE id = ?', [Number(announcementId)]);
  recordAudit({
    actorId: userId, action: 'ORG_ANNOUNCEMENT.DELETE', entityType: 'org_announcement',
    entityId: Number(announcementId), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

export async function publishAnnouncementHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { announcementId } = request.params as any;
  const pool = getPool();
  await pool.execute(
    "UPDATE org_announcements SET status = 'published', published_at = NOW() WHERE id = ?", [Number(announcementId)],
  );
  recordAudit({
    actorId: userId, action: 'ORG_ANNOUNCEMENT.PUBLISH', entityType: 'org_announcement',
    entityId: Number(announcementId), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── Documents & Gallery ──

export async function listOrgDocumentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [rows] = await pool.query<RowData>(
    `SELECT * FROM uploads WHERE entity_type = 'organisation' AND entity_id = ? AND file_category = 'document' ORDER BY created_at DESC`,
    [Number(orgId)],
  );
  return reply.send(rows);
}

export async function deleteOrgDocumentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { documentId } = request.params as any;
  const pool = getPool();
  await pool.execute('DELETE FROM uploads WHERE id = ? AND entity_type = \'organisation\' AND file_category = \'document\'', [Number(documentId)]);
  recordAudit({
    actorId: userId, action: 'ORG_DOCUMENT.DELETE', entityType: 'upload',
    entityId: Number(documentId), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

export async function listOrgGalleryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [rows] = await pool.query<RowData>(
    `SELECT * FROM uploads WHERE entity_type = 'organisation' AND entity_id = ? AND file_category = 'image' ORDER BY created_at DESC`,
    [Number(orgId)],
  );
  return reply.send(rows);
}

export async function uploadOrgGalleryHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { orgId } = request.params as any;
  // Delegate to existing upload service
  const { uploadService } = await import('../../upload/application/upload.service.js');
  return reply.status(201).send({ message: 'Gallery upload endpoint ready. Use existing upload routes for file upload.' });
}

export async function deleteOrgGalleryHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { imageId } = request.params as any;
  const pool = getPool();
  await pool.execute('DELETE FROM uploads WHERE id = ? AND entity_type = \'organisation\' AND file_category = \'image\'', [Number(imageId)]);
  recordAudit({
    actorId: userId, action: 'ORG_GALLERY.DELETE', entityType: 'upload',
    entityId: Number(imageId), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

// ── Reports ──

export async function getOrgBookingReportHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const query = request.query as any;
  const from = query.from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const to = query.to || new Date().toISOString().split('T')[0];
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];

  const [rows] = await pool.query<RowData>(
    `SELECT b.*, r.name AS resource_name, br.name AS branch_name, u.full_name AS player_name
     FROM bookings b
     JOIN resources r ON r.id = b.resource_id
     JOIN branches br ON br.id = r.branch_id
     LEFT JOIN users u ON u.id = b.user_id
     WHERE br.organisation_id = ? AND b.booking_date BETWEEN ? AND ?
     ORDER BY b.booking_date DESC, b.start_time ASC`,
    [Number(orgId), from, to],
  );

  const [[summary]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(b.total_amount), 0) AS total_revenue,
            COALESCE(SUM(CASE WHEN b.booking_status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
            COALESCE(SUM(CASE WHEN b.booking_status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled
     FROM bookings b
     JOIN resources r ON r.id = b.resource_id
     JOIN branches br ON br.id = r.branch_id
     WHERE br.organisation_id = ? AND b.booking_date BETWEEN ? AND ?`,
    [Number(orgId), from, to],
  );

  return reply.send({ data: rows, summary });
}

export async function getOrgRevenueReportHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const query = request.query as any;
  const from = query.from || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
  const to = query.to || new Date().toISOString().split('T')[0];
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];

  const [dailyRevenue] = await pool.query<RowData>(
    `SELECT b.booking_date AS date, COALESCE(SUM(b.total_amount), 0) AS revenue
     FROM bookings b
     JOIN resources r ON r.id = b.resource_id
     JOIN branches br ON br.id = r.branch_id
     WHERE br.organisation_id = ? AND b.booking_date BETWEEN ? AND ? AND b.booking_status = 'completed'
     GROUP BY b.booking_date ORDER BY b.booking_date`,
    [Number(orgId), from, to],
  );

  const [[totals]] = await pool.query<RowData>(
    `SELECT COALESCE(SUM(b.total_amount), 0) AS total_revenue,
            COUNT(*) AS total_transactions,
            COALESCE(AVG(b.total_amount), 0) AS avg_transaction
     FROM bookings b
     JOIN resources r ON r.id = b.resource_id
     JOIN branches br ON br.id = r.branch_id
     WHERE br.organisation_id = ? AND b.booking_date BETWEEN ? AND ? AND b.booking_status = 'completed'`,
    [Number(orgId), from, to],
  );

  return reply.send({ daily: dailyRevenue, summary: totals });
}

export async function getOrgMemberReportHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];

  const [byStatus] = await pool.query<RowData>(
    `SELECT bpa.status, COUNT(*) AS count
     FROM branch_player_access bpa
     JOIN branches br ON br.id = bpa.branch_id
     WHERE br.organisation_id = ?
     GROUP BY bpa.status`,
    [Number(orgId)],
  );

  const [byBranch] = await pool.query<RowData>(
    `SELECT br.id, br.name, COUNT(DISTINCT bpa.player_id) AS member_count
     FROM branches br
     LEFT JOIN branch_player_access bpa ON bpa.branch_id = br.id AND bpa.status = 'approved'
     WHERE br.organisation_id = ? AND br.deleted_at IS NULL
     GROUP BY br.id, br.name
     ORDER BY member_count DESC`,
    [Number(orgId)],
  );

  const [[total]] = await pool.query<RowData>(
    `SELECT COUNT(DISTINCT bpa.player_id) AS total
     FROM branch_player_access bpa
     JOIN branches br ON br.id = bpa.branch_id
     WHERE br.organisation_id = ? AND bpa.status = 'approved'`,
    [Number(orgId)],
  );

  return reply.send({ total_members: total.total, by_status: byStatus, by_branch: byBranch });
}

// ── Club Profile ──

export async function getClubProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [rows] = await pool.query<RowData>(
    `SELECT o.*, ot.name AS org_type_name, c.name AS country_name
     FROM organisations o
     LEFT JOIN organisation_types ot ON ot.id = o.organisation_type_id
     LEFT JOIN countries c ON c.id = o.country_id
     WHERE o.id = ?`,
    [Number(orgId)],
  );
  if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Organisation not found' });
  return reply.send(rows[0]);
}

export async function updateClubProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { orgId } = request.params as any;
  const body = request.body as any;
  const pool = getPool();
  const fields: string[] = []; const params: any[] = [];
  if (body.name !== undefined) { fields.push('name = ?'); params.push(body.name); }
  if (body.description !== undefined) { fields.push('description = ?'); params.push(body.description); }
  if (body.email !== undefined) { fields.push('email = ?'); params.push(body.email); }
  if (body.phone !== undefined) { fields.push('phone = ?'); params.push(body.phone); }
  if (body.website !== undefined) { fields.push('website = ?'); params.push(body.website); }
  if (fields.length) {
    params.push(Number(orgId));
    await pool.execute(`UPDATE organisations SET ${fields.join(', ')} WHERE id = ?`, params);
  }
  recordAudit({
    actorId: userId, action: 'ORG_PROFILE.UPDATE', entityType: 'organisation',
    entityId: Number(orgId), afterState: body,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── Branch Management ──

export async function listOrgBranchesManageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [branches] = await pool.query<RowData>(
    `SELECT b.*,
      (SELECT COUNT(*) FROM resources r WHERE r.branch_id = b.id AND r.deleted_at IS NULL) AS courts_count,
      (SELECT GROUP_CONCAT(DISTINCT s.name SEPARATOR ', ') FROM resources r JOIN sports s ON s.id = r.sport_id WHERE r.branch_id = b.id AND r.deleted_at IS NULL) AS assigned_sports,
      b.opening_time, b.closing_time
     FROM branches b WHERE b.organisation_id = ? AND b.deleted_at IS NULL ORDER BY b.name`,
    [Number(orgId)],
  );
  for (const branch of branches) {
    const [managers] = await pool.query<RowData>(
      `SELECT u.id, u.full_name, u.email FROM branch_staff bs JOIN users u ON u.id = bs.user_id WHERE bs.branch_id = ? AND bs.role = 'branch-mgr'`,
      [branch.id],
    );
    branch.managers = managers;
    const [amenities] = await pool.query<RowData>(
      `SELECT a.name FROM branch_amenities ba JOIN amenities a ON a.id = ba.amenity_id WHERE ba.branch_id = ?`,
      [branch.id],
    );
    branch.amenities = amenities.map((a: any) => a.name);
  }
  return reply.send(branches);
}

export async function getOrgBranchDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  const { branchId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [rows] = await pool.query<RowData>(
    `SELECT b.*, (SELECT COUNT(*) FROM resources r WHERE r.branch_id = b.id AND r.deleted_at IS NULL) AS courts_count
     FROM branches b WHERE b.id = ? AND b.deleted_at IS NULL`,
    [Number(branchId)],
  );
  if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Branch not found' });
  const branch = rows[0];
  const [sports] = await pool.query<RowData>(
    `SELECT DISTINCT s.id, s.name FROM resources r JOIN sports s ON s.id = r.sport_id WHERE r.branch_id = ? AND r.deleted_at IS NULL`,
    [Number(branchId)],
  );
  branch.sports = sports;
  const [amenities] = await pool.query<RowData>(
    `SELECT a.name FROM branch_amenities ba JOIN amenities a ON a.id = ba.amenity_id WHERE ba.branch_id = ?`,
    [branch.id],
  );
  branch.amenities = amenities.map((a: any) => a.name);
  return reply.send(branch);
}

// ── Working Hours ──

export async function getOrgWorkingHoursHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [branches] = await pool.query<RowData>(
    `SELECT id, name, opening_time, closing_time, timezone FROM branches WHERE organisation_id = ? AND deleted_at IS NULL ORDER BY name`,
    [Number(orgId)],
  );
  for (const branch of branches) {
    const [holidays] = await pool.query<RowData>(
      `SELECT * FROM branch_holidays WHERE branch_id = ? ORDER BY holiday_date`,
      [branch.id],
    );
    branch.holidays = holidays;
    const [resources] = await pool.query<RowData>(
      `SELECT r.id, r.name, r.opening_time, r.closing_time, r.sport_id, s.name AS sport_name
       FROM resources r LEFT JOIN sports s ON s.id = r.sport_id WHERE r.branch_id = ? AND r.deleted_at IS NULL ORDER BY r.name`,
      [branch.id],
    );
    branch.resources = resources;
  }
  return reply.send(branches);
}

export async function updateBranchHoursHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { branchId } = request.params as any;
  const body = request.body as any;
  const pool = getPool();
  if (body.opening_time !== undefined || body.closing_time !== undefined) {
    const fields: string[] = []; const params: any[] = [];
    if (body.opening_time !== undefined) { fields.push('opening_time = ?'); params.push(body.opening_time); }
    if (body.closing_time !== undefined) { fields.push('closing_time = ?'); params.push(body.closing_time); }
    params.push(Number(branchId));
    await pool.execute(`UPDATE branches SET ${fields.join(', ')} WHERE id = ?`, params);
  }
  if (body.resourceHours && Array.isArray(body.resourceHours)) {
    for (const rh of body.resourceHours) {
      await pool.execute(
        'UPDATE resources SET opening_time = ?, closing_time = ? WHERE id = ?',
        [rh.opening_time, rh.closing_time, Number(rh.resourceId)],
      );
    }
  }
  recordAudit({
    actorId: userId, action: 'BRANCH_HOURS.UPDATE', entityType: 'branch',
    entityId: Number(branchId), afterState: body,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── Payment Settings ──

export async function getOrgPaymentSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [branches] = await pool.query<RowData>(
    `SELECT b.id, b.name, bfd.account_holder_name, bfd.account_number, bfd.bank_name, bfd.iban, bfd.swift_code, bfd.tax_id
     FROM branches b
     LEFT JOIN branch_financial_details bfd ON bfd.branch_id = b.id
     WHERE b.organisation_id = ? AND b.deleted_at IS NULL ORDER BY b.name`,
    [Number(orgId)],
  );
  const [paymentMethods] = await pool.query<RowData>(
    `SELECT pm.* FROM payment_methods pm WHERE pm.status = 'active' ORDER BY pm.sort_order`,
  );
  return reply.send({ branches, paymentMethods });
}

export async function updateOrgPaymentSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { orgId } = request.params as any;
  const body = request.body as any;
  const pool = getPool();
  if (body.branchId && body.financialDetails) {
    const { account_holder_name, account_number, bank_name, iban, swift_code, tax_id } = body.financialDetails;
    await pool.execute(
      `INSERT INTO branch_financial_details (branch_id, account_holder_name, account_number, bank_name, iban, swift_code, tax_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE account_holder_name = VALUES(account_holder_name), account_number = VALUES(account_number),
       bank_name = VALUES(bank_name), iban = VALUES(iban), swift_code = VALUES(swift_code), tax_id = VALUES(tax_id)`,
      [Number(body.branchId), account_holder_name, account_number, bank_name, iban, swift_code, tax_id],
    );
  }
  recordAudit({
    actorId: userId, action: 'ORG_PAYMENT_SETTINGS.UPDATE', entityType: 'organisation',
    entityId: Number(orgId), afterState: body,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── Reviews ──

export async function getOrgReviewsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [reviews] = await pool.query<RowData>(
    `SELECT r.*, u.full_name AS user_name, u.avatar_url AS user_avatar
     FROM organisation_reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.organisation_id = ?
     ORDER BY r.created_at DESC`,
    [Number(orgId)],
  );
  const [[avg]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS review_count, COALESCE(ROUND(AVG(rating), 1), 0) AS average_rating
     FROM organisation_reviews WHERE organisation_id = ?`,
    [Number(orgId)],
  );
  return reply.send({ reviews, summary: avg });
}

// ── Referees ──

export async function listOrgRefereesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [referees] = await pool.query<RowData>(
    `SELECT r.id AS referee_id, u.id, u.full_name, u.email, u.phone, u.avatar_url,
            r.status AS referee_status
     FROM referees r
     JOIN users u ON u.id = r.user_id
     ORDER BY u.full_name`,
    [],
  );
  return reply.send(referees);
}

// ── Academies ──

export async function listOrgAcademiesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [programs] = await pool.query<RowData>(
    `SELECT ap.*, ac.name AS category_name,
       (SELECT COUNT(*) FROM academy_enrollments ae WHERE ae.program_id = ap.id AND ae.status = 'enrolled') AS enrolled_count,
       (SELECT COUNT(*) FROM academy_enrollments ae WHERE ae.program_id = ap.id AND ae.status = 'waiting') AS waiting_count
     FROM academy_programs ap
     LEFT JOIN academy_categories ac ON ac.id = ap.category_id
     WHERE ap.organisation_id = ?
     ORDER BY ap.created_at DESC`,
    [Number(orgId)],
  );
  return reply.send(programs);
}

// ── Leagues ──

export async function listOrgLeaguesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [leagues] = await pool.query<RowData>(
    `SELECT l.*, s.name AS season_name, s.start_date AS season_start, s.end_date AS season_end,
       (SELECT COUNT(*) FROM league_teams lt WHERE lt.league_id = l.id) AS team_count
     FROM leagues l
     JOIN seasons s ON s.id = l.season_id
     WHERE l.organisation_id = ?
     ORDER BY s.start_date DESC, l.name`,
    [Number(orgId)],
  );
  return reply.send(leagues);
}

// ── Tournaments ──

export async function listOrgTournamentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [tournaments] = await pool.query<RowData>(
    `SELECT t.*,
       (SELECT COUNT(*) FROM tournament_registrations tr WHERE tr.tournament_id = t.id AND tr.status = 'confirmed') AS registered_count
     FROM tournaments t
     WHERE t.organisation_id = ?
     ORDER BY t.start_date DESC, t.name`,
    [Number(orgId)],
  );
  return reply.send(tournaments);
}

// ── Club Verification ──

export async function getOrgVerificationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [[org]] = await pool.query<RowData>(
    `SELECT id, name, is_verified, is_active, verification_status, verified_at FROM organisations WHERE id = ?`,
    [Number(orgId)],
  );
  if (!org) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Organisation not found' });
  const [documents] = await pool.query<RowData>(
    `SELECT * FROM uploads WHERE entity_type = 'organisation' AND entity_id = ? AND file_category = 'document' ORDER BY created_at DESC`,
    [Number(orgId)],
  );
  const [history] = await pool.query<RowData>(
    `SELECT * FROM organisation_verification_log WHERE organisation_id = ? ORDER BY created_at DESC`,
    [Number(orgId)],
  );
  return reply.send({ org, documents, history });
}
