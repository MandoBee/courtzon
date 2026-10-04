import { getPool } from '../../../database/mysql.js';
import { conflictError, notFoundError, validationError } from './membership-p1.errors.js';
import { membershipP1Repository } from '../infrastructure/repositories/membership-p1.repository.js';
import type { PlanVersionP1Input, CreateMembershipPlanP1Input } from '../presentation/membership-p1.dto.js';

type Row = import('mysql2').RowDataPacket[];

const DEFAULT_DURATIONS = ['monthly', 'quarterly', 'semi_annual', 'annual'];
const DEFAULT_PAYMENT_METHODS = ['cash', 'card'];

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50);
}

async function assertOrgOwnsPlan(orgId: number, planId: number): Promise<void> {
  const plan = await membershipP1Repository.findPlanById(planId);
  if (!plan || plan.organisation_id !== orgId) {
    throw notFoundError('Membership plan', 'MEMBERSHIP_PLAN_NOT_FOUND');
  }
}

async function assertBranchIdsBelongToOrg(orgId: number, branchIds: number[]): Promise<void> {
  if (!branchIds.length) return;
  const pool = getPool();
  const placeholders = branchIds.map(() => '?').join(', ');
  const [rows] = await pool.execute<Row>(
    `SELECT COUNT(*) AS c FROM branches WHERE id IN (${placeholders}) AND organisation_id = ? AND deleted_at IS NULL`,
    [...branchIds, orgId],
  );
  if (Number((rows[0] as { c: number }).c) !== branchIds.length) {
    throw validationError('One or more branches do not belong to this organisation');
  }
}

function normalizeCode(input?: string, name?: string, range: string[] = []): string {
  if (input && input.trim()) {
    const code = slugify(input);
    for (let attempt = 0; ; attempt++) {
      const candidate = attempt === 0 ? code : `${code}-${attempt + 1}`;
      if (!range.includes(candidate)) return candidate;
    }
  }
  return slugify(name || 'membership') || `plan-${Date.now().toString(36)}`;
}

function assertComponentsCodesUnique(components: PlanVersionP1Input['components']): void {
  const seen = new Set<string>();
  for (const c of components) {
    const key = c.code.trim().toLowerCase();
    if (seen.has(key)) throw validationError(`Duplicate component code: ${c.code}`);
    seen.add(key);
  }
}

/** mysql2 returns JSON columns as parsed values or strings — handle both. */
function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* fallthrough */ }
    return value ? value.split(',') : [];
  }
  return [];
}

export const membershipPlanVersionService = {
  /** Upsert organisation membership settings (enabled durations + payment channels). */
  async saveOrganisationSettings(
    orgId: number,
    data: { enabledDurations: string[]; allowedPaymentMethods: string[] },
  ): Promise<{ enabled_durations: string[]; allowed_payment_methods: string[] }> {
    const allowed = new Set(DEFAULT_DURATIONS);
    for (const d of data.enabledDurations) {
      if (!allowed.has(d)) throw validationError(`Unsupported duration: ${d}`);
    }
    if (!data.enabledDurations.length) throw validationError('At least one duration must be enabled');
    const methods = new Set(DEFAULT_PAYMENT_METHODS);
    for (const m of data.allowedPaymentMethods) {
      if (!methods.has(m)) throw validationError(`Unsupported payment method: ${m}`);
    }
    if (!data.allowedPaymentMethods.length) throw validationError('At least one payment method must be enabled');
    await membershipP1Repository.upsertOrgSettings(orgId, data.enabledDurations, data.allowedPaymentMethods);
    return { enabled_durations: data.enabledDurations, allowed_payment_methods: data.allowedPaymentMethods };
  },

  async getOrganisationSettings(orgId: number): Promise<{ enabled_durations: string[]; allowed_payment_methods: string[] }> {
    const row = await membershipP1Repository.getOrgSettings(orgId);
    if (!row) return { enabled_durations: DEFAULT_DURATIONS.slice(0), allowed_payment_methods: DEFAULT_PAYMENT_METHODS.slice(0) };
    return {
      enabled_durations: toArray(row.enabled_durations),
      allowed_payment_methods: toArray(row.allowed_payment_methods),
    };
  },

  /** Create plan (identity) + first version atomically. */
  async createPlanWithVersion(
    orgId: number,
    planData: CreateMembershipPlanP1Input,
    versionData: PlanVersionP1Input,
    actorId: number,
  ): Promise<{ planId: number; versionId: number }> {
    assertComponentsCodesUnique(versionData.components);
    const existingPlans = await membershipP1Repository.listPlansByOrg(orgId);
    const codes = existingPlans.map((p) => p.code);
    const code = normalizeCode(planData.code, planData.name, codes);
    const planId = await membershipP1Repository.createPlan(orgId, {
      name: planData.name,
      code,
      description: planData.description ?? null,
      category: planData.category,
      isPublic: planData.isPublic,
    }, actorId);
    const versionId = await this.createVersion(orgId, planId, versionData, actorId);
    return { planId, versionId };
  },

  /** Create a version for an existing plan (validates tenancy + invariant rules). */
  async createVersion(orgId: number, planId: number, data: PlanVersionP1Input, actorId: number): Promise<number> {
    await assertOrgOwnsPlan(orgId, planId);
    await assertBranchIdsBelongToOrg(orgId, data.branchIds);
    assertComponentsCodesUnique(data.components);
    if (data.branchScope === 'SELECTED' && !data.branchIds.length) {
      throw validationError('branchScope SELECTED requires at least one branchId');
    }
    if (data.initialChargeType === 'percentage' && (data.initialChargePercent == null || data.initialChargePercent <= 0)) {
      throw validationError('initialChargePercent is required when initialChargeType = percentage');
    }
    if (data.renewalModel === 'fixed_date' && (!data.fixedRenewalMonth || !data.fixedRenewalDay)) {
      throw validationError('fixedRenewalMonth/Day are required when renewalModel = fixed_date');
    }
    const versionNo = await membershipP1Repository.nextVersionNo(planId);
    const effectiveFrom = data.effectiveFrom ?? new Date().toISOString().slice(0, 10);
    const status = data.status === 'active' ? 'active' : 'draft';
    const versionId = await membershipP1Repository.createVersionWithParts(planId, {
      versionNo,
      status,
      effectiveFrom,
      durationType: data.durationType,
      durationPeriods: data.durationPeriods ?? 1,
      renewalModel: data.renewalModel,
      fixedRenewalMonth: data.fixedRenewalMonth ?? null,
      fixedRenewalDay: data.fixedRenewalDay ?? null,
      initialChargeType: data.initialChargeType,
      initialChargePercent: data.initialChargePercent ?? null,
      graceDays: data.graceDays ?? 0,
      branchScope: data.branchScope,
      allowedPaymentMethods: data.allowedPaymentMethods,
      currency: data.currency || 'EGP',
      installmentsEnabled: data.installmentsEnabled ?? false,
      actorId,
      components: data.components,
      branchIds: data.branchIds,
    });
    if (status === 'active') {
      await this.activateVersion(orgId, versionId, actorId);
    }
    return versionId;
  },

  /** Activate a (draft) version — supersedes any currently active version. */
  async activateVersion(orgId: number, planVersionId: number, actorId: number): Promise<void> {
    const version = await membershipP1Repository.findVersion(planVersionId);
    if (!version) throw notFoundError('Membership plan version', 'MEMBERSHIP_VERSION_NOT_FOUND');
    const plan = await membershipP1Repository.findPlanById(Number(version.membership_plan_id));
    if (!plan || plan.organisation_id !== orgId) throw notFoundError('Membership plan', 'MEMBERSHIP_PLAN_NOT_FOUND');
    await membershipP1Repository.supersedeActiveVersions(Number(version.membership_plan_id), actorId);
    await membershipP1Repository.setVersionStatus(planVersionId, 'active');
  },

  /** Edit a DRAFT version only (active versions are immutable historical records). */
  async updateDraftVersion(orgId: number, planVersionId: number, data: PlanVersionP1Input, actorId: number): Promise<void> {
    const version = await membershipP1Repository.findVersion(planVersionId);
    if (!version) throw notFoundError('Membership plan version', 'MEMBERSHIP_VERSION_NOT_FOUND');
    if (version.status !== 'draft') throw conflictError('Only draft versions can be edited');
    const plan = await membershipP1Repository.findPlanById(Number(version.membership_plan_id));
    if (!plan || plan.organisation_id !== orgId) throw notFoundError('Membership plan', 'MEMBERSHIP_PLAN_NOT_FOUND');
    await assertBranchIdsBelongToOrg(orgId, data.branchIds);
    assertComponentsCodesUnique(data.components);
    if (data.branchScope === 'SELECTED' && !data.branchIds.length) {
      throw validationError('branchScope SELECTED requires at least one branchId');
    }
    if (data.initialChargeType === 'percentage' && (data.initialChargePercent == null || data.initialChargePercent <= 0)) {
      throw validationError('initialChargePercent is required when initialChargeType = percentage');
    }
    await membershipP1Repository.updateDraftVersionParts(planVersionId, {
      durationType: data.durationType,
      durationPeriods: data.durationPeriods ?? 1,
      renewalModel: data.renewalModel,
      fixedRenewalMonth: data.fixedRenewalMonth ?? null,
      fixedRenewalDay: data.fixedRenewalDay ?? null,
      initialChargeType: data.initialChargeType,
      initialChargePercent: data.initialChargePercent ?? null,
      graceDays: data.graceDays ?? 0,
      branchScope: data.branchScope,
      allowedPaymentMethods: data.allowedPaymentMethods,
      currency: data.currency || 'EGP',
      installmentsEnabled: data.installmentsEnabled ?? false,
      actorId,
      components: data.components,
      branchIds: data.branchIds,
    });
  },

  async archiveVersion(orgId: number, planVersionId: number): Promise<void> {
    const version = await membershipP1Repository.findVersion(planVersionId);
    if (!version) throw notFoundError('Membership plan version', 'MEMBERSHIP_VERSION_NOT_FOUND');
    const plan = await membershipP1Repository.findPlanById(Number(version.membership_plan_id));
    if (!plan || plan.organisation_id !== orgId) throw notFoundError('Membership plan', 'MEMBERSHIP_PLAN_NOT_FOUND');
    await membershipP1Repository.setVersionStatus(planVersionId, 'archived');
  },

  /** Update plan identity fields (tenant-scoped). */
  async updatePlanBasic(
    orgId: number,
    planId: number,
    data: { name?: string; description?: string | null; category?: string; isPublic?: boolean },
  ): Promise<void> {
    const plan = await membershipP1Repository.findPlanById(planId);
    if (!plan || plan.organisation_id !== orgId) throw notFoundError('Membership plan', 'MEMBERSHIP_PLAN_NOT_FOUND');
    await membershipP1Repository.updatePlanBasic(planId, data);
  },

  async listOrgPlans(orgId: number): Promise<any[]> {
    const plans = await membershipP1Repository.listPlansByOrg(orgId);
    const out: any[] = [];
    for (const plan of plans) {
      const versions = await membershipP1Repository.listVersionsByPlan(Number(plan.id));
      const versionView: any[] = [];
      for (const v of versions) {
        const components = await membershipP1Repository.listComponentsByVersionId(Number(v.id));
        const branchIds = await membershipP1Repository.listBranchIdsByVersionId(Number(v.id));
        versionView.push({ ...this.toVersionJson(v), components, branchIds });
      }
      out.push({ ...plan, versions: versionView });
    }
    return out;
  },

  /** Active public versions for the player storefront (org-scoped). */
  async listActiveVersionsForPurchase(orgId: number): Promise<any[]> {
    const plans = await membershipP1Repository.listPlansByOrg(orgId);
    const out: any[] = [];
    for (const plan of plans) {
      const versions = await membershipP1Repository.listVersionsByPlan(Number(plan.id));
      for (const v of versions) {
        if (v.status !== 'active') continue;
        if (Number(plan.is_public) !== 1) continue;
        const components = await membershipP1Repository.listComponentsByVersionId(Number(v.id));
        out.push({ plan: { id: plan.id, name: plan.name, description: plan.description }, version: this.toVersionJson(v), components });
      }
    }
    return out;
  },

  toVersionJson(v: any): any {
    return {
      id: Number(v.id),
      versionNo: Number(v.version_no),
      status: v.status,
      effectiveFrom: v.effective_from instanceof Date ? v.effective_from.toISOString().slice(0, 10) : String(v.effective_from ?? '').slice(0, 10),
      durationType: v.duration_type,
      durationPeriods: Number(v.duration_periods),
      renewalModel: v.renewal_model,
      fixedRenewalMonth: v.fixed_renewal_month != null ? Number(v.fixed_renewal_month) : null,
      fixedRenewalDay: v.fixed_renewal_day != null ? Number(v.fixed_renewal_day) : null,
      initialChargeType: v.initial_charge_type,
      initialChargePercent: v.initial_charge_percent != null ? Number(v.initial_charge_percent) : null,
      graceDays: Number(v.grace_days),
      branchScope: v.branch_scope,
      allowedPaymentMethods: toArray(v.allowed_payment_methods),
      currency: v.currency,
      installmentsEnabled: Number(v.installments_enabled) === 1,
    };
  },
};