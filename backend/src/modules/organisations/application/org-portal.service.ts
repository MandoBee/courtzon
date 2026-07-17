import * as repo from '../infrastructure/repositories/org-portal.repository.js';
import { branchRepository } from '../infrastructure/repositories/branch.repository.js';
import { rbacRepository } from '../../rbac/infrastructure/repositories/rbac.repository.js';
import { ValidationError, NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { getPlanNumericLimit } from '../../../shared/utils/plan-limits.util.js';
import { eventBus } from '../../../shared/event-bus/index.js';

export function getOrgInfo(orgId: number) {
  return repo.getOrgInfo(orgId);
}

// ── Org staff management (D5) ──
export function listOrgStaff(orgId: number) {
  return repo.listOrgStaff(orgId);
}

export async function addOrgStaff(orgId: number, email: string, roleSlug: string, assignedBy: number, branchIds?: number[], resourceIds?: number[], permissionIds?: number[]) {
  const role = await repo.getAssignableOrgRole(roleSlug);
  if (!role) throw new ValidationError(`Role "${roleSlug}" cannot be assigned to org staff`);

  if (branchIds && branchIds.length > 0) {
    for (const bid of branchIds) {
      if (!(await repo.branchBelongsToOrg(bid, orgId))) {
        throw new ValidationError(`Branch ${bid} does not belong to this organisation`);
      }
    }
  }

  if (resourceIds && resourceIds.length > 0) {
    for (const rid of resourceIds) {
      if (!(await repo.resourceBelongsToOrg(rid, orgId))) {
        throw new ValidationError(`Resource ${rid} does not belong to this organisation`);
      }
    }
  }

  const user = await repo.findUserByEmail(email.trim().toLowerCase());
  if (!user) throw new NotFoundError('No registered user with that email');

  const ownerId = await repo.getOrgOwnerId(orgId);
  if (ownerId === user.id) throw new ValidationError('The organisation owner already has full access');

  const limit = await getPlanNumericLimit(orgId, 'staff', 3);
  const currentStaff = await repo.listOrgStaff(orgId);
  if (currentStaff.length >= limit) {
    throw new ConflictError(
      `Staff limit reached (max ${limit === Infinity ? 'unlimited' : limit}). Upgrade your plan to add more staff members.`,
    );
  }

  // Clone the template role to the org (or reuse existing org-scoped clone)
  const orgRoleId = await rbacRepository.cloneRoleForOrg(role.id, orgId);

  // If specific permissions were provided, override the cloned role's permissions
  if (permissionIds && permissionIds.length > 0) {
    await rbacRepository.setRolePermissions(orgRoleId, permissionIds);
  }

  await repo.addStaffScope(user.id, orgRoleId, orgId, assignedBy, branchIds, resourceIds);
  return { userId: user.id, fullName: user.full_name, email: user.email, roleSlug: role.slug };
}

export async function changeOrgStaffRole(orgId: number, userId: number, roleSlug: string, assignedBy: number, branchIds?: number[], resourceIds?: number[]) {
  const role = await repo.getAssignableOrgRole(roleSlug);
  if (!role) throw new ValidationError(`Role "${roleSlug}" cannot be assigned to org staff`);

  if (branchIds && branchIds.length > 0) {
    for (const bid of branchIds) {
      if (!(await repo.branchBelongsToOrg(bid, orgId))) {
        throw new ValidationError(`Branch ${bid} does not belong to this organisation`);
      }
    }
  }

  if (resourceIds && resourceIds.length > 0) {
    for (const rid of resourceIds) {
      if (!(await repo.resourceBelongsToOrg(rid, orgId))) {
        throw new ValidationError(`Resource ${rid} does not belong to this organisation`);
      }
    }
  }

  const ownerId = await repo.getOrgOwnerId(orgId);
  if (ownerId === userId) throw new ValidationError('Cannot modify the organisation owner');

  // Clone the template role to the org (or reuse existing org-scoped clone)
  const orgRoleId = await rbacRepository.cloneRoleForOrg(role.id, orgId);

  await repo.removeStaffFromOrg(userId, orgId);
  await repo.addStaffScope(userId, orgRoleId, orgId, assignedBy, branchIds, resourceIds);
  return { userId, roleSlug: role.slug };
}

export async function getStaffPermissions(orgId: number, userId: number) {
  const staff = await repo.listOrgStaff(orgId);
  const member = staff.find((s: any) => s.user_id === userId);
  if (!member) throw new NotFoundError('Staff member not found in this organisation');

  const roleId = member.role_id;
  if (!roleId) throw new ValidationError('Staff member has no role assigned');

  const permissions = await rbacRepository.getRolePermissionsWithLabels(roleId);

  // Also fetch the template role's full permissions as reference
  const templateRole = await repo.getAssignableOrgRole(member.role_slug);
  let templatePermissions: any[] = [];
  if (templateRole) {
    templatePermissions = await rbacRepository.getRolePermissionsWithLabels(templateRole.id);
  }

  const role = member.role_name || member.role_slug;
  return { userId, roleId, roleName: role, roleSlug: member.role_slug, permissions, templatePermissions };
}

export async function updateStaffPermissions(orgId: number, userId: number, permissionIds: number[]) {
  const staff = await repo.listOrgStaff(orgId);
  const member = staff.find((s: any) => s.user_id === userId);
  if (!member) throw new NotFoundError('Staff member not found in this organisation');

  const roleId = member.role_id;
  if (!roleId) throw new ValidationError('Staff member has no role assigned');

  // Verify the role belongs to this org (or is a global template — safety check)
  await rbacRepository.setRolePermissions(roleId, permissionIds);
  return { success: true, roleId, permissionCount: permissionIds.length };
}



export async function removeOrgStaff(orgId: number, userId: number) {
  const ownerId = await repo.getOrgOwnerId(orgId);
  if (ownerId === userId) throw new ValidationError('Cannot remove the organisation owner');
  await repo.removeStaffFromOrg(userId, orgId);
}

// ── Subscription Requests ──

export async function getOrgSubscriptionWithUsage(orgId: number) {
  const result = await repo.getOrgSubscriptionWithFeatures(orgId);
  if (!result) return { plan: null, status: 'none', features: [], usage: {} };

  const { sub, features } = result;
  const usage = await repo.getFeatureUsageCounts(orgId);
  const pendingRequest = await repo.getOrgPendingSubscriptionRequest(orgId);

  const featureList = features.map((f: any) => ({
    featureKey: f.feature_key,
    label: f.label,
    valueType: f.value_type,
    value: f.value,
    unit: f.unit,
    sortOrder: f.sort_order,
    usage: usage[f.feature_key] ?? 0,
  }));

  const billingCycle = (sub.billing_cycle || 'monthly') as string;

  return {
    id: sub.id,
    planId: sub.plan_id,
    planName: sub.plan_name,
    priceMonthly: sub.price_monthly != null ? Number(sub.price_monthly) : null,
    priceYearly: sub.price_yearly != null ? Number(sub.price_yearly) : null,
    isUnlimited: !!sub.is_unlimited,
    billingCycle,
    features: featureList,
    usage,
    startDate: sub.start_date,
    endDate: sub.end_date,
    status: sub.subscription_status,
    autoRenew: !!sub.auto_renew,
    pendingRequest: pendingRequest
      ? {
          id: pendingRequest.id,
          requestType: pendingRequest.request_type,
          requestedPlanName: pendingRequest.requested_plan_name,
          currentPlanName: pendingRequest.current_plan_name,
          status: pendingRequest.status,
          createdAt: pendingRequest.created_at,
        }
      : null,
  };
}

export async function getAvailablePlansForOrg(orgId: number) {
  const plans = await repo.getAvailablePlansForOrg(orgId);
  return plans.map((p: any) => ({
    id: p.id,
    planName: p.plan_name,
    priceMonthly: p.price_monthly != null ? Number(p.price_monthly) : null,
    priceYearly: p.price_yearly != null ? Number(p.price_yearly) : null,
    isUnlimited: !!p.is_unlimited,
    isInternal: !!p.is_internal,
    features: [] as any[],
  }));
}

export async function submitSubscriptionRequest(orgId: number, userId: number, planId: number, requestType: 'NEW_SUBSCRIPTION' | 'PLAN_CHANGE', notes?: string) {
  const pending = await repo.getOrgPendingSubscriptionRequest(orgId);
  if (pending) throw new ConflictError('You already have a pending subscription request. Please wait for it to be reviewed.');

  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();

  // Snapshot current plan data
  const [subRows] = await pool.execute<any[]>(
    `SELECT os.plan_id, sp.plan_name, sp.price_monthly, sp.price_yearly, os.billing_cycle
     FROM organisation_subscriptions os
     LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE os.organisation_id = ? AND os.subscription_status = 'active'
       AND (os.end_date IS NULL OR os.end_date >= CURDATE())
     ORDER BY os.created_at DESC LIMIT 1`,
    [orgId],
  );
  const currentPlanId = subRows.length ? subRows[0].plan_id : null;
  const currentPlanName = subRows.length ? subRows[0].plan_name : null;
  const currentPrice = subRows.length
    ? Number(subRows[0].billing_cycle === 'yearly' ? subRows[0].price_yearly : subRows[0].price_monthly)
    : null;
  const currentBillingCycle = subRows.length ? subRows[0].billing_cycle : null;

  // Snapshot requested plan data
  const [planRows] = await pool.execute<any[]>(
    `SELECT plan_name, price_monthly, price_yearly, is_active FROM subscription_plans WHERE id = ?`,
    [planId],
  );
  if (!planRows.length || !planRows[0].is_active) {
    throw new ConflictError('The requested plan is not available');
  }

  // Prevent requesting the same plan
  if (currentPlanId === planId) {
    throw new ConflictError('You are already on this plan');
  }

  const rp = planRows[0];
  const requestedPlanName = rp.plan_name;
  const requestedPrice = Number(rp.price_monthly || rp.price_yearly || 0);
  const requestedBillingCycle = 'monthly';

  const id = await repo.createSubscriptionRequest({
    organisationId: orgId,
    requestedBy: userId,
    requestedPlanId: planId,
    requestType,
    currentPlanId,
    currentPlanName,
    currentPrice,
    currentBillingCycle,
    requestedPlanName,
    requestedPrice,
    requestedBillingCycle,
    notes,
  });

  // Emit notification event
  const { eventBus } = await import('../../../shared/event-bus/index.js');
  eventBus.emit('subscription:request-submitted', {
    organisationId: orgId,
    userId,
    requestId: id,
    requestType,
    requestedPlanName,
    notes,
  });

  return { id, status: 'pending', requestType, requestedPlanName };
}

export async function cancelMySubscriptionRequest(orgId: number, requestId: number, userId: number) {
  const pending = await repo.getOrgPendingSubscriptionRequest(orgId);
  if (!pending || pending.id !== requestId) {
    throw new ConflictError('No pending request found to cancel');
  }
  return repo.cancelSubscriptionRequest(requestId, userId, 'Cancelled by organisation');
}

export async function listOrgSubscriptionRequests(orgId: number) {
  return repo.listOrgSubscriptionRequests(orgId);
}

// ── Org coach agreements / invites (D6) ──
export function listOrgCoaches(orgId: number) {
  return repo.listOrgCoaches(orgId);
}

export function listInvitableCoaches(orgId: number) {
  return repo.listInvitableCoaches(orgId);
}

export async function inviteCoach(orgId: number, data: { coachId: number; coachSplitPct: number; orgSplitPct: number; invitedBy: number; hourlyRate?: number }) {
  if (!(await repo.coachExistsApproved(data.coachId))) {
    throw new NotFoundError('Approved coach');
  }
  if (Math.round(data.coachSplitPct + data.orgSplitPct) !== 100) {
    throw new ValidationError('Coach split and org split must add up to 100%');
  }
  await repo.orgInviteCoach({ coachId: data.coachId, orgId, coachSplitPct: data.coachSplitPct, orgSplitPct: data.orgSplitPct, invitedBy: data.invitedBy, hourlyRate: data.hourlyRate });

  const coachUserId = await repo.findCoachUserId(data.coachId);
  const orgInfo = await repo.getOrgInfo(orgId);
  if (coachUserId) {
    eventBus.emit('coach:invited', {
      coachId: data.coachId,
      userId: coachUserId,
      organisationId: orgId,
      organisationName: orgInfo?.name || 'Unknown Organisation',
      invitedBy: data.invitedBy,
    });
  }
}

export async function respondToCoachAgreement(orgId: number, coachId: number, accept: boolean) {
  const affected = await repo.respondToCoachAgreement(orgId, coachId, accept);
  if (!affected) throw new NotFoundError('Pending coach agreement');
}

export async function removeCoachAgreement(orgId: number, coachId: number) {
  const removed = await repo.removeOrgCoachAgreement(orgId, coachId);
  if (!removed) throw new NotFoundError('Coach agreement');
}

export function getOrgStats(orgId: number) {
  return repo.getOrgStats(orgId);
}

export function getOrgBookings(orgId: number, filters?: {
  branchId?: number;
  resourceId?: number;
  date?: string;
  status?: string;
  paymentStatus?: string;
  bookingType?: string;
  page?: number;
  limit?: number;
}) {
  return repo.getOrgBookings(orgId, filters);
}

export function getOrgResources(orgId: number) {
  return repo.getOrgResources(orgId);
}

export function getOrgProducts(orgId: number, page?: number, limit?: number, sportId?: number, status?: string, branchId?: number) {
  return repo.getOrgProducts(orgId, page, limit, sportId, status, branchId);
}

// ── Facility members (branch_player_access — D8) ──
export function listOrgMembers(
  orgId: number,
  filters?: { status?: string; branchId?: number },
) {
  return branchRepository.getAllAccessRequests({ orgId, ...filters });
}

export async function updateOrgMemberAccess(
  orgId: number,
  branchId: number,
  playerId: number,
  status: string,
  reviewerId: number,
  note?: string,
) {
  if (!(await repo.branchBelongsToOrg(branchId, orgId))) {
    throw new NotFoundError('Branch');
  }
  await branchRepository.updateAccessStatus(branchId, playerId, status, reviewerId, note);
}

export function getOrgTransactions(orgId: number, page: number, limit: number) {
  return repo.getOrgTransactions(orgId, page, limit);
}

export function getOrgSettlements(orgId: number, page: number, limit: number) {
  return repo.getOrgSettlements(orgId, page, limit);
}

export function getOrgSettlementDetail(orgId: number, settlementId: number) {
  return repo.getOrgSettlementDetail(orgId, settlementId);
}
