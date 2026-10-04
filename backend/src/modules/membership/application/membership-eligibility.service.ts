import { membershipP1Repository } from '../infrastructure/repositories/membership-p1.repository.js';
import { membershipP2Repository } from '../infrastructure/repositories/membership-p2.repository.js';
import { deriveEligibility, type MembershipEligibilityFacts } from '../domain/membership-p2.types.js';
import { notFoundError } from './membership-p1.errors.js';

type Row = import('mysql2').RowDataPacket;

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(Number);
    } catch { /* fallthrough */ }
    return value.split(',').map(Number).filter((n) => Number.isFinite(n));
  }
  return [];
}

/**
 * G11.22 P2 — membership eligibility FACTS ONLY (decision #28: P2 provides
 * eligibility facts and never enforces membership access inside Bookings /
 * Academy / Discount / Door / Tournament). Tenancy is enforced here: the
 * caller must be the organisation or the owning player.
 */
export const membershipEligibilityService = {

  /**
   * Resolve eligibility facts for a subscription, scoped to org or player.
   * `effectiveBranches` comes from the IMMUTABLE branch snapshot (decision
   * #29/#30/#31): branchScopeSnapshot='ALL' → the org's live active branches;
   * 'SELECTED' → the snapshot's selected branch ids (never re-read from the
   * plan).
   */
  async getEligibility(subscriptionId: number, scope: { orgId?: number; userId?: number }): Promise<{
    facts: MembershipEligibilityFacts;
    effectiveBranches: number[];
    installments: any[];
  } | null> {
    const row = await membershipP1Repository.findSubscription(subscriptionId);
    if (!row) throw notFoundError('Membership subscription');
    if (scope.orgId != null && Number(row.organisation_id) !== scope.orgId) {
      throw notFoundError('Membership subscription');
    }
    if (scope.userId != null && Number(row.user_id) !== scope.userId) {
      throw notFoundError('Membership subscription');
    }

    const instRows = await membershipP2Repository.listInstallmentsBySubscription(subscriptionId);
    const facts = deriveEligibility({
      subscriptionId: Number(row.id),
      status: row.status,
      paymentStatus: row.payment_status,
      endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date).slice(0, 10)) : null,
      graceUntil: row.grace_until ? (row.grace_until instanceof Date ? row.grace_until.toISOString().slice(0, 10) : String(row.grace_until).slice(0, 10)) : null,
      installments: instRows.map((i) => ({
        amount: Number(i.amount), commissionAmount: Number(i.commission_amount), status: i.status,
      })),
    });

    let effectiveBranches: number[] = [];
    if (row.branch_scope_snapshot === 'ALL') {
      effectiveBranches = await membershipP2Repository.listActiveBranchIdsByOrg(Number(row.organisation_id));
    } else {
      effectiveBranches = toNumberArray(row.selected_branch_ids);
    }

    return {
      facts,
      effectiveBranches,
      installments: instRows.map((i) => ({
        id: Number(i.id), subscriptionId: Number(i.subscription_id), seq: Number(i.seq),
        amount: Number(i.amount), commissionAmount: Number(i.commission_amount),
        dueDate: i.due_date instanceof Date ? i.due_date.toISOString().slice(0, 10) : String(i.due_date).slice(0, 10),
        status: i.status, paidAt: i.paid_at ? i.paid_at : null, currency: i.currency,
      })),
    };
  },
};