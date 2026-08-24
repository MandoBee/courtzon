import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { generateUUID } from '../../../../shared/utils/token.js';
import { nonExpiredSubscriptionCondition } from '../../../../shared/utils/subscription-validator.js';

type RowData = mysql.RowDataPacket[];

export class OrganisationRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async findAll(countryId?: number | null, typeId?: number | null, ratingMin?: number | null, verified?: boolean | null, active?: boolean | null, page = 1, limit = 20): Promise<{ data: any[]; total: number }> {
    const conditions: string[] = ['o.deleted_at IS NULL'];
    const params: any[] = [];
    if (countryId) {
      conditions.push('o.country_id = ?');
      params.push(countryId);
    }
    if (typeId) {
      conditions.push('o.org_type_id = ?');
      params.push(typeId);
    }
    if (ratingMin !== null && ratingMin !== undefined) {
      conditions.push('o.rating_avg >= ?');
      params.push(ratingMin);
    }
    if (verified !== null && verified !== undefined) {
      conditions.push('o.is_verified = ?');
      params.push(verified ? 1 : 0);
    }
    if (active !== null && active !== undefined) {
      conditions.push('o.is_active = ?');
      params.push(active ? 1 : 0);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRows] = await this.pool.execute<RowData>(
      `SELECT COUNT(*) as cnt FROM organisations o
       JOIN organisation_types ot ON ot.id = o.org_type_id
       LEFT JOIN countries c ON c.id = o.country_id
       ${where}`,
      params
    );
    const total = (countRows[0] as any)?.cnt || 0;

    const offset = (page - 1) * limit;
    // Canonical resolution: the Subscription Status column must reflect the
    // EFFECTIVE subscription (non-expired gate, future-dated renewals excluded)
    // — never just the newest row, which during an overlap window is a
    // pending renewal and would disagree with org-portal/entitlement screens.
    const [rows] = await this.pool.query<RowData>(
      `SELECT o.*, ot.slug as org_type_slug, ot.sort_order as org_type_sort,
              c.name as country_name, c.flag_emoji as country_flag, c.iso_code as country_iso,
              (SELECT os.id FROM organisation_subscriptions os WHERE os.organisation_id = o.id AND ${nonExpiredSubscriptionCondition('os')} ORDER BY os.created_at DESC LIMIT 1) as subscription_id,
              (SELECT os.subscription_status FROM organisation_subscriptions os WHERE os.organisation_id = o.id AND ${nonExpiredSubscriptionCondition('os')} ORDER BY os.created_at DESC LIMIT 1) as subscription_status
       FROM organisations o
       JOIN organisation_types ot ON ot.id = o.org_type_id
       LEFT JOIN countries c ON c.id = o.country_id
       ${where}
       ORDER BY o.name LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { data: rows, total };
  }

  async findById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT o.*, ot.slug as org_type_slug FROM organisations o
       JOIN organisation_types ot ON ot.id = o.org_type_id
       WHERE o.id = ? AND o.deleted_at IS NULL`,
      [id]
    );
    return rows.length ? rows[0] : null;
  }

  async findBySlug(slug: string): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM organisations WHERE slug = ? AND deleted_at IS NULL`,
      [slug]
    );
    return rows.length ? rows[0] : null;
  }

  async create(data: any, ownerId: number): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, description,
        logo_url, cover_url, email, phone, website, country_id, cr_number, tax_id, tax_id_type, documents, is_verified, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)`,
      [generateUUID(), data.orgTypeId, ownerId, data.name, data.slug,
       data.description || null, data.logoUrl || null, data.coverUrl || null,
       data.email || null, data.phone || null, data.website || null,
       data.countryId || null, data.crNumber || null, data.taxId || null, data.taxIdType || null,
       data.documents ? JSON.stringify(data.documents) : null]
    );
    return result.insertId;
  }

  async update(id: number, data: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['name','slug','description','logo_url','cover_url','email','phone',
      'website','org_type_id','country_id','cr_number','tax_id','tax_id_type','documents','is_verified','is_active'];
    for (const key of allowed) {
      const dbKey = key;
      if (data[key] !== undefined) {
        fields.push(`${dbKey} = ?`);
        values.push(key === 'documents' && Array.isArray(data[key]) ? JSON.stringify(data[key]) : data[key]);
      }
    }
    if (!fields.length) return;
    values.push(id);
    await this.pool.execute(
      `UPDATE organisations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  async softDelete(id: number): Promise<void> {
    await this.pool.execute(
      `UPDATE organisations SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  }

  // ── Sports CRUD ──
  async getSports(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM sports WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY sort_order, name'
    );
    return rows;
  }

  async getMarketplaceSports(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM sports WHERE show_in_marketplace = TRUE AND deleted_at IS NULL ORDER BY sort_order, name'
    );
    return rows;
  }

  async getAllSports(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM sports WHERE deleted_at IS NULL ORDER BY sort_order, name'
    );
    return rows;
  }

  async getSportById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>('SELECT * FROM sports WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async createSport(data: { name: string; slug: string; icon?: string; sortOrder?: number }): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      'INSERT INTO sports (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)',
      [data.name, data.slug, data.icon || null, data.sortOrder || 0]
    );
    return result.insertId;
  }

  async updateSport(id: number, data: { name?: string; slug?: string; icon?: string; sortOrder?: number; isActive?: boolean; showInMarketplace?: boolean }): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.slug !== undefined) { fields.push('slug = ?'); values.push(data.slug); }
    if (data.icon !== undefined) { fields.push('icon = ?'); values.push(data.icon); }
    if (data.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(data.sortOrder); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
    if (data.showInMarketplace !== undefined) { fields.push('show_in_marketplace = ?'); values.push(data.showInMarketplace ? 1 : 0); }
    if (!fields.length) return;
    values.push(id);
    await this.pool.execute(`UPDATE sports SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async deleteSport(id: number): Promise<void> {
    await this.pool.execute('UPDATE sports SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
  }

  async getAllOrganisationSubscriptions(countryId?: number | null): Promise<any[]> {
    // Admin display: include EVERY assignment — expired by date, cancelled,
    // pending, suspended — so Subscription Management reflects reality. The
    // nonExpiredSubscriptionCondition gate is only for entitlement checks;
    // is_expired lets the UI label past-end-date rows as Expired.
    let sql = `SELECT o.id as org_id, o.name as org_name, o.slug as org_slug, o.is_verified, o.is_active,
              os.id as subscription_id, os.plan_id, os.subscription_status, os.start_date, os.end_date, os.auto_renew,
              os.billing_cycle,
              CASE WHEN os.end_date IS NOT NULL AND os.end_date < CURDATE() THEN 1 ELSE 0 END AS is_expired,
              sp.plan_name, sp.price_monthly, sp.price_yearly, sp.is_unlimited,
              CASE
                WHEN sp.is_unlimited = 1 THEN 0
                WHEN os.billing_cycle = 'yearly' THEN sp.price_yearly
                ELSE sp.price_monthly
              END AS price
       FROM organisation_subscriptions os
       INNER JOIN organisations o ON o.id = os.organisation_id AND o.deleted_at IS NULL
       INNER JOIN subscription_plans sp ON sp.id = os.plan_id`;
    const params: any[] = [];
    if (countryId) {
      sql += ` AND o.country_id = ?`;
      params.push(countryId);
    }
    // Stable chronological order per organisation: oldest period first so the
    // assignment history reads as a timeline (expired periods before active).
    sql += ` ORDER BY o.name, (os.start_date IS NULL), os.start_date ASC, os.created_at ASC`;
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows;
  }

  async getOrganisationTypes(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM organisation_types WHERE is_active = TRUE ORDER BY sort_order`
    );
    return rows;
  }

  async createOrgType(data: { slug: string; name?: string; description?: string; sortOrder?: number }): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO organisation_types (slug, name, description, sort_order) VALUES (?, ?, ?, ?)`,
      [data.slug, data.name || null, data.description || null, data.sortOrder || 0]
    );
    return result.insertId;
  }

  async updateOrgType(id: number, data: { name?: string; slug?: string; description?: string; isActive?: boolean; sortOrder?: number }): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.slug !== undefined) { fields.push('slug = ?'); values.push(data.slug); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
    if (data.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(data.sortOrder); }
    if (!fields.length) return;
    values.push(id);
    await this.pool.execute(`UPDATE organisation_types SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async deleteOrgType(id: number): Promise<void> {
    await this.pool.execute(`UPDATE organisation_types SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`, [id]);
  }

  async getOrgTypeAttributes(orgTypeId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM organisation_type_attributes WHERE org_type_id = ? AND is_active = TRUE ORDER BY sort_order`,
      [orgTypeId]
    );
    return rows;
  }

  async saveOrgAttributeValues(orgId: number, attributes: Record<string, any>): Promise<void> {
    const attrs = await this.getOrgTypeAttributesByOrg(orgId);
    for (const [key, value] of Object.entries(attributes)) {
      const attrDef = attrs.find(a => a.attribute_key === key);
      if (!attrDef) continue;
      await this.pool.execute(
        `INSERT INTO organisation_attribute_values (organisation_id, attribute_id, value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [orgId, attrDef.id, String(value)]
      );
    }
  }

  private async getOrgTypeAttributesByOrg(orgId: number): Promise<any[]> {
    const [org] = await this.pool.execute<RowData>(
      `SELECT org_type_id FROM organisations WHERE id = ?`, [orgId]
    );
    if (!org.length) return [];
    return this.getOrgTypeAttributes(org[0].org_type_id);
  }
}

export const organisationRepository = new OrganisationRepository();
