import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { normalizeCommissionEntity } from '../../../shared/services/commission-entities.js';
import { organisationRepository } from '../infrastructure/repositories/organisation.repository.js';
import { branchFinancialRepository } from '../infrastructure/repositories/branch-financial.repository.js';
import { branchRepository } from '../infrastructure/repositories/branch.repository.js';
import { resourceRepository } from '../infrastructure/repositories/resource.repository.js';
import { amenityRepository } from '../infrastructure/repositories/amenity.repository.js';
import { countriesRepository } from '../../countries/infrastructure/repositories/countries.repository.js';
import { NotFoundError, ConflictError, ValidationError } from '../../../shared/errors/app-error.js';
import { resolveOrganisationMedia } from './organisation-media.util.js';
import { nonExpiredSubscriptionCondition } from '../../../shared/utils/subscription-validator.js';
import { eventBus } from '../../../shared/event-bus/index.js';
import {
  cascadeOrganisationSoftDelete,
  cascadeBranchSoftDelete,
  cascadeResourceSoftDelete,
  cascadeSportSoftDelete,
  cascadeSubscriptionPlanDelete,
} from '../../../shared/cascade/index.js';
import {
  mapSubscriptionPlanBase,
  resolvePlanPrice,
  type BillingPeriod,
} from '../../../shared/utils/subscription-plan.util.js';
import { getPlanNumericLimit } from '../../../shared/utils/plan-limits.util.js';

type RowData = mysql.RowDataPacket[];

async function loadPlanFeatures(
  planIds: number[],
): Promise<Map<number, import('../../../shared/utils/subscription-plan.util.js').PlanFeature[]>> {
  if (!planIds.length) return new Map();
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT spf.plan_id, sf.feature_key, sf.label, sf.value_type, spf.value, sf.unit, sf.sort_order
     FROM subscription_plan_features spf
     JOIN subscription_features sf ON sf.id = spf.feature_id
     WHERE spf.plan_id IN (${planIds.map(() => '?').join(',')})
     ORDER BY sf.sort_order ASC`,
    planIds,
  );
  const featureMap = new Map<number, import('../../../shared/utils/subscription-plan.util.js').PlanFeature[]>();
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const planId = r.plan_id as number;
    if (!featureMap.has(planId)) featureMap.set(planId, []);
    featureMap.get(planId)!.push({
      featureKey: r.feature_key as string,
      label: r.label as string,
      valueType: r.value_type as 'numeric' | 'boolean' | 'tier' | 'text',
      value: r.value as string,
      unit: r.unit as string | null,
      sortOrder: r.sort_order as number,
    });
  }
  return featureMap;
}

async function buildPlanFromRows(rows: mysql.RowDataPacket[]) {
  const planMap = new Map<number, any>();
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const id = r.id as number;
    if (!planMap.has(id)) {
      planMap.set(id, {
        ...mapSubscriptionPlanBase(r),
        commissionRates: [],
      });
    }
    if (r.applicable_entity) {
      planMap.get(id).commissionRates.push({
        entity: r.applicable_entity,
        rate: Number(r.commission_rate),
        type: r.rate_type,
      });
    }
  }
  if (planMap.size) {
    const featureMap = await loadPlanFeatures(Array.from(planMap.keys()));
    for (const [planId, plan] of planMap) {
      plan.features = featureMap.get(planId) || null;
    }
  }
  return Array.from(planMap.values());
}

export class OrganisationService {
  async getSports() {
    return organisationRepository.getSports();
  }

  async getMarketplaceSports() {
    return organisationRepository.getMarketplaceSports();
  }

  async getAllSports() {
    return organisationRepository.getAllSports();
  }

  async getSport(id: number) {
    const sport = await organisationRepository.getSportById(id);
    if (!sport) throw new NotFoundError('Sport');
    return sport;
  }

  async createSport(data: { name: string; slug: string; icon?: string; sortOrder?: number }) {
    const id = await organisationRepository.createSport(data);
    return organisationRepository.getSportById(id);
  }

  async updateSport(id: number, data: { name?: string; slug?: string; icon?: string; sortOrder?: number; isActive?: boolean; showInMarketplace?: boolean }) {
    await organisationRepository.updateSport(id, data);
    return organisationRepository.getSportById(id);
  }

  async deleteSport(id: number) {
    const sport = await organisationRepository.getSportById(id);
    if (!sport) throw new NotFoundError('Sport');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeSportSoftDelete(id, conn);
      await conn.execute(
        'UPDATE sports SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getOrganisationTypes() {
    return organisationRepository.getOrganisationTypes();
  }

  async createOrganisationType(data: { slug: string; name?: string; description?: string; sortOrder?: number }) {
    const id = await organisationRepository.createOrgType(data);
    const types = await organisationRepository.getOrganisationTypes();
    return types.find((t: any) => t.id === id) || { id, ...data };
  }

  async updateOrganisationType(id: number, data: { name?: string; slug?: string; description?: string; isActive?: boolean; sortOrder?: number }) {
    await organisationRepository.updateOrgType(id, data);
    const types = await organisationRepository.getOrganisationTypes();
    return types.find((t: any) => t.id === id) || { id };
  }

  async deleteOrganisationType(id: number) {
    await organisationRepository.deleteOrgType(id);
  }

  async listOrganisations(filters?: { countryId?: number; typeId?: number; ratingMin?: number; verified?: boolean; active?: boolean; page?: number; limit?: number }) {
    const result = await organisationRepository.findAll(
      filters?.countryId, filters?.typeId, filters?.ratingMin, filters?.verified, filters?.active,
      filters?.page || 1, filters?.limit || 20
    );
    const data = await Promise.all(
      result.data.map(async (org: { id: number; logo_url: string | null; cover_url: string | null }) => {
        const media = await resolveOrganisationMedia(org.id, org.logo_url, org.cover_url);
        return { ...org, ...media };
      }),
    );
    return { ...result, data, page: filters?.page || 1, limit: filters?.limit || 20 };
  }

  async getOrganisation(id: number) {
    const org = await organisationRepository.findById(id);
    if (!org) throw new NotFoundError('Organisation');
    const media = await resolveOrganisationMedia(id, org.logo_url, org.cover_url);
    const attributes = await organisationRepository.getOrgTypeAttributes(org.org_type_id);
    return { ...org, ...media, attributes };
  }

  /**
   * Player-facing storefront/profile view of an organisation. Returns only
   * public, non-sensitive fields (no financial details, CR/tax numbers, owner
   * or document data) plus the org's active branches so a player can discover
   * and book the facility.
   */
  async getStorefront(id: number) {
    const org = await organisationRepository.findById(id);
    if (!org || org.is_active === 0 || org.is_active === false) {
      throw new NotFoundError('Organisation');
    }
    const branches = await branchRepository.findByOrg(id);
    const media = await resolveOrganisationMedia(id, org.logo_url, org.cover_url);
    return {
      id: org.id,
      public_id: org.public_id,
      name: org.name,
      slug: org.slug,
      description: org.description,
      logo_url: media.logo_url,
      cover_url: media.cover_url,
      email: org.email,
      phone: org.phone,
      website: org.website,
      org_type_slug: org.org_type_slug,
      org_type_id: org.org_type_id,
      rating_avg: org.rating_avg,
      rating_count: org.rating_count,
      is_verified: org.is_verified,
      branches: branches.map((b: any) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        description: b.description,
        city: b.city,
        address_line1: b.address_line1,
        access_type: b.access_type,
        rating_avg: b.rating_avg,
        images: b.images,
        opening_time: b.opening_time,
        closing_time: b.closing_time,
      })),
    };
  }

  async createOrganisation(data: any, ownerId: number) {
    const existing = await organisationRepository.findBySlug(data.slug);
    if (existing) throw new ConflictError('Organisation slug already exists');
    if (data.newCountry && !data.countryId) {
      const found = await countriesRepository.findByIsoCode(data.newCountry.isoCode);
      data.countryId = found ? found.id : await countriesRepository.create(data.newCountry);
    }
    delete data.newCountry;
    const id = await organisationRepository.create(data, ownerId);
    if (data.attributes) {
      await organisationRepository.saveOrgAttributeValues(id, data.attributes);
    }
    return this.getOrganisation(id);
  }

  async updateOrganisation(id: number, data: any) {
    const org = await organisationRepository.findById(id);
    if (!org) throw new NotFoundError('Organisation');
    if (data.slug && data.slug !== org.slug) {
      const existing = await organisationRepository.findBySlug(data.slug);
      if (existing) throw new ConflictError('Organisation slug already exists');
    }
    const mapped = { ...data };
    if (mapped.orgTypeId !== undefined) { mapped.org_type_id = mapped.orgTypeId; delete mapped.orgTypeId; }
    if (mapped.isActive !== undefined) { mapped.is_active = mapped.isActive; delete mapped.isActive; }
    if (mapped.isVerified !== undefined) { mapped.is_verified = mapped.isVerified; delete mapped.isVerified; }
    if (mapped.crNumber !== undefined) { mapped.cr_number = mapped.crNumber; delete mapped.crNumber; }
    if (mapped.countryId !== undefined) { mapped.country_id = mapped.countryId; delete mapped.countryId; }
    if (mapped.logoUrl !== undefined) { mapped.logo_url = mapped.logoUrl; delete mapped.logoUrl; }
    if (mapped.coverUrl !== undefined) { mapped.cover_url = mapped.coverUrl; delete mapped.coverUrl; }
    if (mapped.taxId !== undefined) { mapped.tax_id = mapped.taxId; delete mapped.taxId; }
    if (mapped.taxIdType !== undefined) { mapped.tax_id_type = mapped.taxIdType; delete mapped.taxIdType; }
    await organisationRepository.update(id, mapped);

    if (data.isVerified === true && !org.is_verified) {
      try { await this.activateSubscription(id); } catch {}
    }

    if (data.attributes) {
      await organisationRepository.saveOrgAttributeValues(id, data.attributes);
    }
    return this.getOrganisation(id);
  }

  async getBranchFinancialDetails(branchId: number) {
    const branch = await branchRepository.findById(branchId);
    if (!branch) throw new NotFoundError('Branch');
    return branchFinancialRepository.getByBranchId(branchId);
  }

  async upsertBranchFinancialDetails(branchId: number, data: any) {
    const branch = await branchRepository.findById(branchId);
    if (!branch) throw new NotFoundError('Branch');
    await branchFinancialRepository.upsert(branchId, data);
    return branchFinancialRepository.getByBranchId(branchId);
  }

  async upsertMainBranchFinancialDetails(orgId: number, data: any) {
    const branchId = await branchFinancialRepository.findMainBranchIdForOrg(orgId);
    if (!branchId) throw new NotFoundError('Branch');
    return this.upsertBranchFinancialDetails(branchId, data);
  }

  async deleteOrganisation(id: number) {
    const org = await organisationRepository.findById(id);
    if (!org) throw new NotFoundError('Organisation');

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeOrganisationSoftDelete(id, conn);
      await conn.execute(
        `UPDATE organisations SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listBranches(orgId: number) {
    return branchRepository.findByOrg(orgId);
  }

  async listBranchesBySport(sportId: number, playerId?: number) {
    return branchRepository.findBySport(sportId, playerId);
  }

  async getBranch(id: number) {
    const branch = await branchRepository.findById(id);
    if (!branch) throw new NotFoundError('Branch');
    return branch;
  }

  async createBranch(data: any) {
    if (!data.countryId && data.organisationId) {
      const org = await organisationRepository.findById(data.organisationId);
      if (org?.country_id) data.countryId = org.country_id;
    }
    if (data.organisationId) {
      const limit = await getPlanNumericLimit(data.organisationId, 'branches', 1);
      const existing = await branchRepository.findByOrg(data.organisationId);
      if (existing.length >= limit) {
        throw new ConflictError(
          `Branch limit reached (max ${limit === Infinity ? 'unlimited' : limit}). Upgrade your plan to add more branches.`,
        );
      }
    }
    const id = await branchRepository.create(data);
    return this.getBranch(id);
  }

  async updateBranch(id: number, data: any) {
    const branch = await branchRepository.findById(id);
    if (!branch) throw new NotFoundError('Branch');
    await branchRepository.update(id, data);
    if (data.isActive !== undefined) {
      await resourceRepository.setActiveByBranch(id, data.isActive);
    }
    return this.getBranch(id);
  }

  async deleteBranch(id: number) {
    const branch = await branchRepository.findById(id);
    if (!branch) throw new NotFoundError('Branch');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeBranchSoftDelete(id, conn);
      await conn.execute(
        'UPDATE branches SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listResources(branchId: number) {
    return resourceRepository.findByBranch(branchId);
  }

  async getResource(id: number) {
    const resource = await resourceRepository.findById(id);
    if (!resource) throw new NotFoundError('Resource');
    return resource;
  }

  async createResource(data: any) {
    if (data.branchId) {
      const pool = getPool();
      const [orgRows] = await pool.execute<RowData>(
        'SELECT organisation_id FROM branches WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [data.branchId],
      );
      if (orgRows.length) {
        const orgId = (orgRows[0] as any).organisation_id;
        const limit = await getPlanNumericLimit(orgId, 'resources', Infinity);
        const [countRows] = await pool.execute<RowData>(
          'SELECT COUNT(*) as cnt FROM resources r JOIN branches b ON b.id = r.branch_id WHERE b.organisation_id = ? AND r.deleted_at IS NULL',
          [orgId],
        );
        const count = (countRows[0] as any).cnt || 0;
        if (count >= limit) {
          throw new ConflictError(
            `Resource limit reached (max ${limit === Infinity ? 'unlimited' : limit}). Upgrade your plan to add more resources.`,
          );
        }
      }
    }
    const id = await resourceRepository.create(data);
    if (data.attributes) {
      await resourceRepository.saveResourceAttributeValues(id, data.attributes);
    }
    if (data.peakHours) {
      await resourceRepository.upsertPeakHours(id, data.peakHours);
    }
    return this.getResource(id);
  }

  async updateResource(id: number, data: any) {
    const resource = await resourceRepository.findById(id);
    if (!resource) throw new NotFoundError('Resource');
    await resourceRepository.update(id, data);
    if (data.attributes) {
      await resourceRepository.saveResourceAttributeValues(id, data.attributes);
    }
    return this.getResource(id);
  }

  async deleteResource(id: number) {
    const resource = await resourceRepository.findById(id);
    if (!resource) throw new NotFoundError('Resource');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeResourceSoftDelete(id, conn);
      await conn.execute(
        'UPDATE resources SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getResourceTypes() {
    return resourceRepository.getResourceTypes();
  }

  async createResourceType(data: any) {
    const id = await resourceRepository.createResourceType(data);
    return { id, ...data };
  }

  async listAmenities() {
    return amenityRepository.findAllActive();
  }

  async getBranchAmenities(branchId: number) {
    return amenityRepository.findByBranch(branchId);
  }

  async setBranchAmenities(branchId: number, amenityIds: number[]) {
    await amenityRepository.bulkAssign(branchId, amenityIds);
    return this.getBranchAmenities(branchId);
  }

  async listAllPlans() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT sp.*, spr.applicable_entity, spr.amount as commission_rate, spr.rate_type
       FROM subscription_plans sp
       LEFT JOIN subscription_plan_rates spr ON spr.plan_id = sp.id
       ORDER BY sp.sort_order ASC, sp.is_active DESC, COALESCE(sp.price_monthly, sp.price_yearly, 0) ASC`
    );
    return buildPlanFromRows(rows);
  }

  async createPlan(data: {
    planName: string;
    priceMonthly?: number | null;
    priceYearly?: number | null;
    isUnlimited?: boolean;
    isInternal?: boolean;
    sortOrder?: number;
    applicableOrgTypes?: number[];
    commissionRates?: { entity: string; rate: number; type: string }[];
    features?: { featureKey: string; value: string }[];
  }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute<RowData>(
        `INSERT INTO subscription_plans (plan_name, price_monthly, price_yearly, is_unlimited, applicable_org_types, is_internal, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.planName,
          data.isUnlimited ? 0 : (data.priceMonthly ?? null),
          data.isUnlimited ? null : (data.priceYearly ?? null),
          data.isUnlimited ? 1 : 0,
          data.applicableOrgTypes?.length ? JSON.stringify(data.applicableOrgTypes.filter(t => t != null)) : null,
          data.isInternal ? 1 : 0,
          data.sortOrder ?? 0,
        ],
      );
      const planId = (result as any).insertId;
      if (data.commissionRates?.length) {
        const values = data.commissionRates.map(r => {
          const entity = normalizeCommissionEntity(r.entity) ?? r.entity;
          return [planId, entity, r.type, r.rate];
        });
        await conn.query(
          `INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES ?`,
          [values]
        );
      }
      if (data.features?.length) {
        const featureKeys = data.features.map(f => f.featureKey);
        const [featRows] = await conn.query<RowData>(
          `SELECT id, feature_key FROM subscription_features WHERE feature_key IN (${featureKeys.map(() => '?').join(',')})`,
          featureKeys,
        );
        const featMap = new Map<string, number>();
        for (const fr of featRows) featMap.set(fr.feature_key, fr.id);
        const inserts = data.features
          .filter(f => featMap.has(f.featureKey))
          .map(f => [planId, featMap.get(f.featureKey)!, f.value]);
        if (inserts.length) {
          await conn.query(
            `INSERT INTO subscription_plan_features (plan_id, feature_id, value) VALUES ?`,
            [inserts],
          );
        }
      }
      await conn.commit();
      return this.listAllPlans();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updatePlan(id: number, data: {
    planName?: string;
    priceMonthly?: number | null;
    priceYearly?: number | null;
    isUnlimited?: boolean;
    isInternal?: boolean;
    sortOrder?: number;
    applicableOrgTypes?: number[];
    commissionRates?: { entity: string; rate: number; type: string }[];
    features?: { featureKey: string; value: string }[];
  }) {
    const pool = getPool();
    const [existing] = await pool.execute<RowData>('SELECT id FROM subscription_plans WHERE id = ?', [id]);
    if (!existing.length) throw new NotFoundError('Subscription plan');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const fields: string[] = [];
      const params: any[] = [];
      if (data.planName !== undefined) { fields.push('plan_name = ?'); params.push(data.planName); }
      if (data.priceMonthly !== undefined) { fields.push('price_monthly = ?'); params.push(data.priceMonthly); }
      if (data.priceYearly !== undefined) { fields.push('price_yearly = ?'); params.push(data.priceYearly); }
      if (data.isUnlimited !== undefined) {
        fields.push('is_unlimited = ?');
        params.push(data.isUnlimited ? 1 : 0);
        if (data.isUnlimited) {
          fields.push('price_monthly = ?', 'price_yearly = ?');
          params.push(0, null);
        }
      }
      if (data.applicableOrgTypes !== undefined) { fields.push('applicable_org_types = ?'); params.push(data.applicableOrgTypes.length ? JSON.stringify(data.applicableOrgTypes.filter(t => t != null)) : null); }
      if (data.isInternal !== undefined) { fields.push('is_internal = ?'); params.push(data.isInternal ? 1 : 0); }
      if (data.sortOrder !== undefined) { fields.push('sort_order = ?'); params.push(data.sortOrder); }
      if (fields.length) {
        params.push(id);
        await conn.execute(`UPDATE subscription_plans SET ${fields.join(', ')} WHERE id = ?`, params);
      }
      if (data.commissionRates !== undefined) {
        await conn.execute('DELETE FROM subscription_plan_rates WHERE plan_id = ?', [id]);
        if (data.commissionRates.length) {
          const values = data.commissionRates.map(r => {
            const entity = normalizeCommissionEntity(r.entity) ?? r.entity;
            return [id, entity, r.type, r.rate];
          });
          await conn.query(
            `INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES ?`,
            [values]
          );
        }
      }
      if (data.features !== undefined) {
        await conn.execute('DELETE FROM subscription_plan_features WHERE plan_id = ?', [id]);
        if (data.features.length) {
          const featureKeys = data.features.map(f => f.featureKey);
          const [featRows] = await conn.query<RowData>(
            `SELECT id, feature_key FROM subscription_features WHERE feature_key IN (${featureKeys.map(() => '?').join(',')})`,
            featureKeys,
          );
          const featMap = new Map<string, number>();
          for (const fr of featRows) featMap.set(fr.feature_key, fr.id);
          const inserts = data.features
            .filter(f => featMap.has(f.featureKey))
            .map(f => [id, featMap.get(f.featureKey)!, f.value]);
          if (inserts.length) {
            await conn.query(
              `INSERT INTO subscription_plan_features (plan_id, feature_id, value) VALUES ?`,
              [inserts],
            );
          }
        }
      }
      await conn.commit();
      return this.listAllPlans();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async deletePlan(id: number) {
    const pool = getPool();
    const [existing] = await pool.execute<RowData>('SELECT id FROM subscription_plans WHERE id = ?', [id]);
    if (!existing.length) throw new NotFoundError('Subscription plan');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeSubscriptionPlanDelete(id, conn);
      await conn.execute('DELETE FROM subscription_plan_features WHERE plan_id = ?', [id]);
      await conn.execute('DELETE FROM subscription_plan_rates WHERE plan_id = ?', [id]);
      await conn.execute('DELETE FROM subscription_plans WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async togglePlan(id: number) {
    const pool = getPool();
    const [existing] = await pool.execute<RowData>('SELECT id, is_active FROM subscription_plans WHERE id = ?', [id]);
    if (!existing.length) throw new NotFoundError('Subscription plan');
    const newActive = existing[0].is_active ? 0 : 1;
    await pool.execute('UPDATE subscription_plans SET is_active = ? WHERE id = ?', [newActive, id]);
    return { id, isActive: !!newActive };
  }

  async getAccessRequests(branchId: number) {
    return branchRepository.getPlayerAccessRequests(branchId);
  }

  async approveAccess(branchId: number, playerId: number, reviewerId: number) {
    await branchRepository.approveAccess(branchId, playerId, reviewerId);
  }

  async rejectAccess(branchId: number, playerId: number, reviewerId: number, note?: string) {
    await branchRepository.rejectAccess(branchId, playerId, reviewerId, note || null);
  }

  async getAllAccessRequests(filters?: { status?: string; orgId?: number; branchId?: number }) {
    return branchRepository.getAllAccessRequests(filters);
  }

  async requestAccess(branchId: number, playerId: number) {
    await branchRepository.requestAccess(branchId, playerId);
  }

  async getPlayerAccessStatus(branchId: number, playerId: number) {
    return branchRepository.getPlayerAccessStatus(branchId, playerId);
  }

  async updateAccessStatus(branchId: number, playerId: number, status: string, reviewerId: number, note?: string) {
    await branchRepository.updateAccessStatus(branchId, playerId, status, reviewerId, note);
  }

  async getPlan(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT sp.*, spr.applicable_entity, spr.amount as commission_rate, spr.rate_type
       FROM subscription_plans sp
       LEFT JOIN subscription_plan_rates spr ON spr.plan_id = sp.id
       WHERE sp.id = ?`,
      [id]
    );
    if (!rows.length) throw new NotFoundError('Subscription plan');
    const plans = await buildPlanFromRows(rows);
    return plans[0];
  }

  async listSubscriptionPlans() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT sp.*, spr.applicable_entity, spr.amount as commission_rate, spr.rate_type
       FROM subscription_plans sp
       LEFT JOIN subscription_plan_rates spr ON spr.plan_id = sp.id
       WHERE sp.is_active = TRUE AND sp.is_internal = FALSE
       ORDER BY sp.sort_order ASC, COALESCE(sp.price_monthly, sp.price_yearly, 0) ASC`
    );
    return buildPlanFromRows(rows);
  }

  async getOrgSubscription(orgId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT os.*
       FROM organisation_subscriptions os
       WHERE os.organisation_id = ? AND ${nonExpiredSubscriptionCondition('os')}
       ORDER BY os.created_at DESC
       LIMIT 1`,
      [orgId]
    );
    if (!rows.length) return { plan: null, status: 'none' };
    const sub = rows[0];

    const { getEffectivePlanConfig } = await import('../../../shared/utils/plan-resolver.js');
    const config = await getEffectivePlanConfig(orgId);

    // Resolve plan name: snapshot → live plan → fallback
    let planName = config?.planName;
    if (!planName && sub.plan_id) {
      const [pRows] = await pool.execute<RowData>(
        'SELECT plan_name FROM subscription_plans WHERE id = ?', [sub.plan_id]
      );
      planName = pRows.length ? pRows[0].plan_name : 'Unknown';
    } else if (!planName) {
      planName = 'Unknown';
    }

    const billingCycle = (config?.billingCycle || sub.billing_cycle || 'monthly') as BillingPeriod;
    const priceMonthly = config?.priceMonthly ?? null;
    const priceYearly = config?.priceYearly ?? null;
    const pricing = { priceMonthly, priceYearly, isUnlimited: !!config?.isUnlimited };
    const features = config?.features?.length
      ? config.features
      : null;

    return {
      id: sub.id,
      planId: sub.plan_id,
      planName,
      price: resolvePlanPrice(pricing, billingCycle),
      priceMonthly,
      priceYearly,
      isUnlimited: !!config?.isUnlimited,
      billingCycle,
      features,
      startDate: sub.start_date,
      endDate: sub.end_date,
      status: sub.subscription_status,
      autoRenew: !!sub.auto_renew,
    };
  }

  async getAllOrganisationSubscriptions(countryId?: number | null) {
    return organisationRepository.getAllOrganisationSubscriptions(countryId);
  }

  async updateOrgSubscription(orgId: number, planId: number, billingCycle: BillingPeriod = 'monthly') {
    const pool = getPool();
    const [plan] = await pool.execute<RowData>(
      'SELECT id, is_unlimited, price_monthly, price_yearly FROM subscription_plans WHERE id = ? AND is_active = TRUE',
      [planId]
    );
    if (!plan.length) throw new NotFoundError('Subscription plan');
    const p = plan[0];
    if (!p.is_unlimited && billingCycle === 'yearly' && p.price_yearly == null) {
      throw new ValidationError('This plan has no yearly price');
    }
    if (!p.is_unlimited && billingCycle === 'monthly' && p.price_monthly == null) {
      throw new ValidationError('This plan has no monthly price');
    }

    const [existing] = await pool.execute<RowData>(
      `SELECT id FROM organisation_subscriptions
       WHERE organisation_id = ? AND subscription_status IN ('pending', 'active')
       LIMIT 1`,
      [orgId]
    );

    if (existing.length) {
      await pool.execute(
        `UPDATE organisation_subscriptions SET plan_id = ?, billing_cycle = ?, start_date = NULL, end_date = NULL,
         subscription_status = 'pending', auto_renew = TRUE
         WHERE id = ?`,
        [planId, billingCycle, existing[0].id]
      );
    } else {
      await pool.execute(
        `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
         VALUES (?, ?, ?, NULL, NULL, 'pending', TRUE)`,
        [orgId, planId, billingCycle]
      );
    }
  }

  async activateSubscription(orgId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT os.id, os.billing_cycle, sp.is_unlimited
       FROM organisation_subscriptions os
       JOIN subscription_plans sp ON sp.id = os.plan_id
       WHERE os.organisation_id = ? AND os.subscription_status = 'pending'
       ORDER BY os.created_at DESC LIMIT 1`,
      [orgId]
    );
    if (!rows.length) throw new NotFoundError('No pending subscription found');

    const sub = rows[0];
    const startDate = new Date().toISOString().slice(0, 10);
    let endDate: string | null;
    if (sub.is_unlimited) {
      endDate = null;
    } else if (sub.billing_cycle === 'yearly') {
      const d = new Date(); d.setFullYear(d.getFullYear() + 1);
      endDate = d.toISOString().slice(0, 10);
    } else {
      const d = new Date(); d.setMonth(d.getMonth() + 1);
      endDate = d.toISOString().slice(0, 10);
    }

    await pool.execute(
      `UPDATE organisation_subscriptions SET start_date = ?, end_date = ?, subscription_status = 'active' WHERE id = ?`,
      [startDate, endDate, sub.id]
    );

    const [prevSubs] = await pool.execute<RowData>(
      'SELECT COUNT(*) as cnt FROM organisation_subscriptions WHERE organisation_id = ? AND id != ?',
      [orgId, sub.id]
    );
    const isRenewal = (prevSubs[0] as any).cnt > 0;

    if (isRenewal) {
      eventBus.emit('organisation:subscription-renewed', {
        organisationId: orgId,
        planName: '',
        billingCycle: sub.billing_cycle || 'monthly',
      });
    }

    return { startDate, endDate, status: 'active' };
  }

  async listSubscriptionFeatures() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT id, feature_key, label, value_type, unit, sort_order FROM subscription_features ORDER BY sort_order ASC',
    );
    return rows.map((r: any) => ({
      id: r.id,
      featureKey: r.feature_key,
      label: r.label,
      valueType: r.value_type,
      unit: r.unit,
      sortOrder: r.sort_order,
    }));
  }

  async getPaymentMethods() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM payment_methods ORDER BY sort_order'
    );
    return rows.map((r: any) => ({
      id: r.id, slug: r.slug, name: r.name, icon: r.icon, description: r.description,
      processingFeePct: Number(r.processing_fee_pct), processingFeeFixed: Number(r.processing_fee_fixed),
      requiresApproval: !!r.requires_approval, isActive: !!r.is_active, sortOrder: r.sort_order,
    }));
  }

  async createPaymentMethod(data: any) {
    const pool = getPool();
    const [result] = await pool.execute<RowData>(
      `INSERT INTO payment_methods (slug, name, icon, description, processing_fee_pct, processing_fee_fixed, requires_approval, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.slug, data.name, data.icon || null, data.description || null, data.processingFeePct || 0, data.processingFeeFixed || 0, data.requiresApproval ? 1 : 0, data.isActive ? 1 : 0, data.sortOrder || 0]
    );
    return (result as any).insertId;
  }

  async updatePaymentMethod(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = { slug: 'slug', name: 'name', icon: 'icon', description: 'description', processingFeePct: 'processing_fee_pct', processingFeeFixed: 'processing_fee_fixed', isActive: 'is_active', sortOrder: 'sort_order' };
    if (data.requiresApproval !== undefined) { fields.push('requires_approval = ?'); values.push(data.requiresApproval ? 1 : 0); }
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE payment_methods SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async deletePaymentMethod(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM payment_methods WHERE id = ?', [id]);
  }

  async getGatewayConfigs() {
    const pool = getPool();
    const sql = `SELECT pgc.*, pm.name as payment_method_name, pm.slug as payment_method_slug
               FROM payment_gateway_config pgc
               LEFT JOIN payment_methods pm ON pm.id = pgc.payment_method_id
               ORDER BY pgc.payment_method_id`;
    const [rows] = await pool.execute<RowData>(sql);
    return rows;
  }

  async createGatewayConfig(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO payment_gateway_config (payment_method_id, gateway_provider, is_active, config)
       VALUES (?, ?, ?, ?)`,
      [data.paymentMethodId, data.gatewayProvider, data.isActive ? 1 : 0, JSON.stringify(data.config || {})]
    );
    return (result as any).insertId;
  }

  async updateGatewayConfig(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    if (data.paymentMethodId !== undefined) { fields.push('payment_method_id = ?'); values.push(data.paymentMethodId); }
    if (data.gatewayProvider !== undefined) { fields.push('gateway_provider = ?'); values.push(data.gatewayProvider); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
    if (data.config !== undefined) { fields.push('config = ?'); values.push(JSON.stringify(data.config)); }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE payment_gateway_config SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async deleteGatewayConfig(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM payment_gateway_config WHERE id = ?', [id]);
  }

  async getBranchHolidays(branchId: number) {
    return branchRepository.getHolidays(branchId);
  }

  async createBranchHoliday(branchId: number, data: any) {
    const id = await branchRepository.createHoliday({ ...data, ownerId: branchId });
    return branchRepository.getHolidays(branchId);
  }

  async updateBranchHoliday(id: number, data: any) {
    await branchRepository.updateHoliday(id, data);
  }

  async deleteBranchHoliday(id: number) {
    await branchRepository.deleteHoliday(id);
  }

  async getResourceMaintenance(resourceId: number) {
    return resourceRepository.getMaintenanceRecords(resourceId);
  }

  async createResourceMaintenance(resourceId: number, data: any) {
    const id = await resourceRepository.createMaintenance({ ...data, resourceId });
    return resourceRepository.getMaintenanceRecords(resourceId);
  }

  async updateResourceMaintenance(id: number, data: any) {
    await resourceRepository.updateMaintenance(id, data);
  }

  async deleteResourceMaintenance(id: number) {
    await resourceRepository.deleteMaintenance(id);
  }

  async upsertResourcePeakHours(resourceId: number, peakHours: any[]) {
    await resourceRepository.upsertPeakHours(resourceId, peakHours);
    return this.getResource(resourceId);
  }

  // ── Admin subscription request management ──

  async listSubscriptionRequests(filters?: {
    status?: string; page?: number; limit?: number;
    type?: string; search?: string; dateFrom?: string; dateTo?: string;
    sortBy?: string; sortDir?: string;
  }) {
    const { listSubscriptionRequests } = await import('../infrastructure/repositories/org-portal.repository.js');
    return listSubscriptionRequests(filters);
  }

  async approveSubscriptionRequest(requestId: number, adminId: number, approvalNotes?: string) {
    const { approveSubscriptionRequest } = await import('../infrastructure/repositories/org-portal.repository.js');
    return approveSubscriptionRequest(requestId, adminId, approvalNotes);
  }

  async getSubscriptionRequestDetail(requestId: number) {
    const { getSubscriptionRequestById, getSubscriptionRequestStatusHistory } = await import('../infrastructure/repositories/org-portal.repository.js');
    const req = await getSubscriptionRequestById(requestId);
    if (!req) return null;
    const timeline = await getSubscriptionRequestStatusHistory(requestId);
    return { ...req, timeline };
  }

  async getSubscriptionRequestStats() {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT
         COUNT(*) as total,
         SUM(status = 'pending') as pending_count,
         SUM(status = 'approved') as approved_count,
         SUM(status = 'rejected') as rejected_count,
         SUM(status = 'cancelled') as cancelled_count,
         SUM(status = 'approved' AND DATE(approved_at) = CURDATE()) as approved_today,
         SUM(status = 'rejected' AND DATE(approved_at) = CURDATE()) as rejected_today,
         ROUND(AVG(CASE WHEN status = 'approved' THEN TIMESTAMPDIFF(HOUR, created_at, approved_at) END), 1) as avg_approval_hours
       FROM organisation_upgrade_requests WHERE request_type IS NOT NULL`,
    );
    const s = rows[0] || {};
    // Active subscriptions
    const [subRows] = await pool.execute<any[]>(
      `SELECT COUNT(*) as active_subs FROM organisation_subscriptions
       WHERE subscription_status = 'active' AND (end_date IS NULL OR end_date >= CURDATE())`,
    );
    // Expiring in 30 days
    const [expRows] = await pool.execute<any[]>(
      `SELECT COUNT(*) as expiring FROM organisation_subscriptions
       WHERE subscription_status = 'active' AND end_date IS NOT NULL AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`,
    );
    return {
      totalRequests: Number(s.total) || 0,
      pending: Number(s.pending_count) || 0,
      approved: Number(s.approved_count) || 0,
      rejected: Number(s.rejected_count) || 0,
      cancelled: Number(s.cancelled_count) || 0,
      approvedToday: Number(s.approved_today) || 0,
      rejectedToday: Number(s.rejected_today) || 0,
      avgApprovalHours: Number(s.avg_approval_hours) || 0,
      activeSubscriptions: Number(subRows[0]?.active_subs) || 0,
      expiringIn30Days: Number(expRows[0]?.expiring) || 0,
    };
  }

  async rejectSubscriptionRequest(requestId: number, adminId: number, reason: string) {
    const { rejectSubscriptionRequest } = await import('../infrastructure/repositories/org-portal.repository.js');
    return rejectSubscriptionRequest(requestId, adminId, reason);
  }
}

export const organisationService = new OrganisationService();
