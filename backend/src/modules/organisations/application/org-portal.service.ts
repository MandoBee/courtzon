import * as repo from '../infrastructure/repositories/org-portal.repository.js';
import { branchRepository } from '../infrastructure/repositories/branch.repository.js';
import { rbacRepository } from '../../rbac/infrastructure/repositories/rbac.repository.js';
import { ValidationError, NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { getPlanNumericLimit } from './plan-limits.util.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { getPool } from '../../../database/mysql.js';

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
  const { getCurrentSubscription } = await import('./current-subscription.service.js');
  const sub = await getCurrentSubscription(orgId);

  if (!sub.exists) return { plan: null, status: 'none', features: [], usage: {} };

  const usage = await repo.getFeatureUsageCounts(orgId);
  const pendingRequest = await repo.getOrgPendingSubscriptionRequest(orgId);

  const featureList = sub.features.map((f: any) => ({
    featureKey: f.featureKey,
    label: f.label,
    valueType: f.valueType,
    value: f.value,
    unit: '',
    sortOrder: 0,
    usage: usage[f.featureKey] ?? 0,
  }));

  return {
    id: sub.subscriptionId,
    planId: sub.planId,
    planName: sub.planName,
    priceMonthly: sub.planSnapshot?.priceMonthly ?? null,
    priceYearly: sub.planSnapshot?.priceYearly ?? null,
    isUnlimited: sub.planSnapshot?.isUnlimited ?? false,
    billingCycle: sub.billingCycle,
    features: featureList,
    usage,
    startDate: sub.startDate,
    endDate: sub.endDate,
    status: sub.subscriptionStatus,
    autoRenew: sub.autoRenew,
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
  eventBusV2.emit('subscription:request-submitted', {
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
    eventBusV2.emit('coach:invited', {
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

  const coachUserId = await repo.findCoachUserId(coachId);
  const orgInfo = await repo.getOrgInfo(orgId);
  if (coachUserId) {
    const eventName = accept ? 'coach:org-accepted' : 'coach:org-rejected';
    eventBusV2.emit(eventName as any, {
      coachId,
      coachUserId,
      organisationId: orgId,
      organisationName: orgInfo?.name || 'Unknown Organisation',
    });
  }
}

export async function suspendCoachAgreement(orgId: number, coachId: number) {
  const affected = await repo.suspendCoachAgreement(orgId, coachId);
  if (!affected) throw new NotFoundError('Active coach agreement');
  const coachUserId = await repo.findCoachUserId(coachId);
  const orgInfo = await repo.getOrgInfo(orgId);
  if (coachUserId) {
    eventBusV2.emit('coach:org-suspended' as any, { coachId, coachUserId, organisationId: orgId, organisationName: orgInfo?.name });
  }
}

export async function resumeCoachAgreement(orgId: number, coachId: number) {
  const affected = await repo.resumeCoachAgreement(orgId, coachId);
  if (!affected) throw new NotFoundError('Suspended coach agreement');
  const coachUserId = await repo.findCoachUserId(coachId);
  const orgInfo = await repo.getOrgInfo(orgId);
  if (coachUserId) {
    eventBusV2.emit('coach:org-resumed' as any, { coachId, coachUserId, organisationId: orgId, organisationName: orgInfo?.name });
  }
}

export async function endCoachAgreement(orgId: number, coachId: number) {
  const affected = await repo.endCoachAgreement(orgId, coachId);
  if (!affected) throw new NotFoundError('Active coach agreement');
  const coachUserId = await repo.findCoachUserId(coachId);
  const orgInfo = await repo.getOrgInfo(orgId);
  if (coachUserId) {
    eventBusV2.emit('coach:org-ended' as any, { coachId, coachUserId, organisationId: orgId, organisationName: orgInfo?.name });
  }
}

export async function removeCoachAgreement(orgId: number, coachId: number) {
  const removed = await repo.removeOrgCoachAgreement(orgId, coachId);
  if (!removed) throw new NotFoundError('Coach agreement');
}

export function getOrgStats(orgId: number) {
  return repo.getOrgStats(orgId);
}

export async function getOrgDashboard(orgId: number): Promise<any> {
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];

  // Get org info
  const [orgRows] = await pool.query<RowData>('SELECT id, name, logo_url, is_verified, is_active, created_at FROM organisations WHERE id = ?', [orgId]);
  const org = orgRows[0] || null;
  if (!org) throw new NotFoundError('Organisation', ErrorCodes.ORGANISATION_NOT_FOUND);

  // Today's date
  const today = new Date().toISOString().split('T')[0];

  // Today's bookings count + revenue
  const [[todayStats]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS booking_count, COALESCE(SUM(total_amount), 0) AS revenue
     FROM bookings b
     JOIN branches br ON br.id = b.branch_id
     WHERE br.organisation_id = ? AND b.booking_date = ? AND b.booking_status NOT IN ('cancelled','no_show')`,
    [orgId, today],
  );

  // Weekly booking trend (last 7 days)
  const [weeklyTrend] = await pool.query<RowData>(
    `SELECT b.booking_date AS date, COUNT(*) AS count, COALESCE(SUM(b.total_amount), 0) AS revenue
     FROM bookings b
     JOIN branches br ON br.id = b.branch_id
     WHERE br.organisation_id = ? AND b.booking_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       AND b.booking_status NOT IN ('cancelled','no_show')
     GROUP BY b.booking_date
     ORDER BY b.booking_date ASC`,
    [orgId],
  );

  // Monthly revenue trend (last 6 months)
  const [monthlyTrend] = await pool.query<RowData>(
    `SELECT DATE_FORMAT(b.booking_date, '%Y-%m') AS month, COALESCE(SUM(b.total_amount), 0) AS revenue
     FROM bookings b
     JOIN branches br ON br.id = b.branch_id
     WHERE br.organisation_id = ? AND b.booking_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       AND b.booking_status NOT IN ('cancelled','no_show')
     GROUP BY DATE_FORMAT(b.booking_date, '%Y-%m')
     ORDER BY month ASC`,
    [orgId],
  );

  // Top resources by booking count
  const [topResources] = await pool.query<RowData>(
    `SELECT r.id, r.name, COUNT(*) AS booking_count
     FROM bookings b
     JOIN resources r ON r.id = b.resource_id
     JOIN branches br ON br.id = r.branch_id
     WHERE br.organisation_id = ? AND b.booking_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       AND b.booking_status NOT IN ('cancelled','no_show')
     GROUP BY r.id, r.name
     ORDER BY booking_count DESC
     LIMIT 5`,
    [orgId],
  );

  // Occupancy rate (approximate: bookings today / total available slots across all resources)
  const [[occupiedSlots]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS cnt FROM bookings b
     JOIN branches br ON br.id = b.branch_id
     WHERE br.organisation_id = ? AND b.booking_date = ? AND b.booking_status NOT IN ('cancelled','no_show')`,
    [orgId, today],
  );
  const [[totalSlots]] = await pool.query<RowData>(
    `SELECT COALESCE(SUM(r.slot_count), 0) AS cnt FROM resources r
     JOIN branches br ON br.id = r.branch_id
     WHERE br.organisation_id = ? AND r.is_active = 1`,
    [orgId],
  );
  const occupancyRate = totalSlots.cnt > 0 ? Math.round((occupiedSlots.cnt / totalSlots.cnt) * 100) : 0;

  // Pending actions
  const [[pendingAccess]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS cnt FROM branch_player_access bpa
     JOIN branches br ON br.id = bpa.branch_id
     WHERE br.organisation_id = ? AND bpa.status = 'pending'`,
    [orgId],
  );
  const [[pendingCoaches]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS cnt FROM coach_org_agreements WHERE organisation_id = ? AND status = 'pending'`,
    [orgId],
  );

  // Total branches, resources, members
  const [[branchCount]] = await pool.query<RowData>('SELECT COUNT(*) AS cnt FROM branches WHERE organisation_id = ? AND deleted_at IS NULL', [orgId]);
  const [[resourceCount]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS cnt FROM resources r JOIN branches br ON br.id = r.branch_id WHERE br.organisation_id = ? AND r.deleted_at IS NULL`, [orgId],
  );
  const [[memberCount]] = await pool.query<RowData>(
    `SELECT COUNT(DISTINCT bpa.player_id) AS cnt FROM branch_player_access bpa
     JOIN branches br ON br.id = bpa.branch_id WHERE br.organisation_id = ? AND bpa.status = 'approved'`, [orgId],
  );

  return {
    org: { id: org.id, name: org.name, logo_url: org.logo_url, is_verified: !!org.is_verified, is_active: !!org.is_active },
    stats: {
      total_branches: branchCount.cnt,
      total_resources: resourceCount.cnt,
      total_members: memberCount.cnt,
    },
    today: {
      booking_count: todayStats.booking_count,
      revenue: todayStats.revenue,
    },
    trends: {
      weekly: weeklyTrend,
      monthly: monthlyTrend,
    },
    top_resources: topResources,
    occupancy_rate: occupancyRate,
    pending_actions: {
      access_requests: pendingAccess.cnt,
      coach_invites: pendingCoaches.cnt,
    },
  };
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
