import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { buildPagination, paginationClause } from '../../../shared/utils/pagination.js';
import type { MembershipPlanAttributes, MembershipBenefitAttributes, MembershipPlanWithBenefits } from '../domain/membership.types.js';

type RowData = import('mysql2').RowDataPacket[];

class MembershipPlanService {
  async list(filters: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: string;
  }) {
    const pool = getPool();
    const where: string[] = [];
    const params: any[] = [];

    if (filters.search) {
      where.push('(mp.name LIKE ? OR mp.code LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.category) {
      where.push('mp.category = ?');
      params.push(filters.category);
    }
    if (filters.status) {
      where.push('mp.status = ?');
      params.push(filters.status);
    }
    if (where.length === 0) where.push('1 = 1');

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS total FROM membership_plans mp WHERE ${where.join(' AND ')}`,
      params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.execute<RowData>(
      `SELECT mp.* FROM membership_plans mp
       WHERE ${where.join(' AND ')}
       ORDER BY mp.sort_order ASC, mp.created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows as MembershipPlanAttributes[], total, page: pag.page, limit: pag.limit };
  }

  async getById(id: number): Promise<MembershipPlanWithBenefits | null> {
    const pool = getPool();
    const [plans] = await pool.execute<RowData>(
      `SELECT * FROM membership_plans WHERE id = ?`,
      [id],
    );
    if (!plans.length) return null;
    const plan = plans[0] as MembershipPlanAttributes;
    const [benefits] = await pool.execute<RowData>(
      `SELECT * FROM membership_benefits WHERE membership_plan_id = ? ORDER BY display_order ASC`,
      [id],
    );
    return { ...plan, benefits: benefits as MembershipBenefitAttributes[] };
  }

  async create(
    data: {
      code: string;
      name: string;
      description?: string;
      category: string;
      duration_type: string;
      duration_value: number;
      price: number;
      currency?: string;
      status?: string;
      is_default?: boolean;
      is_public?: boolean;
      sort_order?: number;
      benefits?: { benefit_key: string; benefit_value: string; display_order?: number }[];
    },
    userId: number,
  ): Promise<MembershipPlanWithBenefits> {
    const pool = getPool();

    const [existing] = await pool.execute<RowData>(
      `SELECT id FROM membership_plans WHERE code = ? LIMIT 1`,
      [data.code],
    );
    if (existing.length) throw new ConflictError('Plan code already exists', ErrorCodes.VALIDATION_INVALID_VALUE);

    const [result] = await pool.execute(
      `INSERT INTO membership_plans (code, name, description, category, duration_type, duration_value, price, currency, status, is_default, is_public, sort_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.code, data.name, data.description ?? null, data.category,
        data.duration_type, data.duration_value, data.price,
        data.currency ?? 'USD', data.status ?? 'active',
        data.is_default ?? false, data.is_public ?? true,
        data.sort_order ?? 0, userId, userId,
      ],
    );
    const planId = (result as any).insertId;

    if (data.benefits?.length) {
      const rows = data.benefits.map((b, i) => [planId, b.benefit_key, b.benefit_value, b.display_order ?? i + 1]);
      const placeholders = rows.map(() => '(?, ?, ?, ?)').join(', ');
      await pool.execute(
        `INSERT INTO membership_benefits (membership_plan_id, benefit_key, benefit_value, display_order) VALUES ${placeholders}`,
        rows.flat(),
      );
    }

    return (await this.getById(planId))!;
  }

  async update(
    id: number,
    data: {
      code?: string;
      name?: string;
      description?: string;
      category?: string;
      duration_type?: string;
      duration_value?: number;
      price?: number;
      currency?: string;
      status?: string;
      is_default?: boolean;
      is_public?: boolean;
      sort_order?: number;
      benefits?: { benefit_key: string; benefit_value: string; display_order?: number }[];
    },
    userId: number,
  ): Promise<MembershipPlanWithBenefits> {
    const pool = getPool();

    const existing = await this.getById(id);
    if (!existing) throw new NotFoundError('Membership plan', ErrorCodes.MEMBERSHIP_NOT_FOUND);

    if (data.code) {
      const [dup] = await pool.execute<RowData>(
        `SELECT id FROM membership_plans WHERE code = ? AND id != ? LIMIT 1`,
        [data.code, id],
      );
      if (dup.length) throw new ConflictError('Plan code already exists', ErrorCodes.VALIDATION_INVALID_VALUE);
    }

    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof typeof data)[] = [
      'code', 'name', 'description', 'category', 'duration_type',
      'duration_value', 'price', 'currency', 'status', 'is_default',
      'is_public', 'sort_order',
    ];
    for (const field of updatable) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field]);
      }
    }

    if (fields.length) {
      fields.push('updated_at = NOW()');
      params.push(userId, id);
      await pool.execute(
        `UPDATE membership_plans SET ${fields.join(', ')}, updated_by = ? WHERE id = ?`,
        params,
      );
    }

    if (data.benefits !== undefined) {
      await pool.execute(`DELETE FROM membership_benefits WHERE membership_plan_id = ?`, [id]);
      if (data.benefits.length) {
        const rows = data.benefits.map((b, i) => [id, b.benefit_key, b.benefit_value, b.display_order ?? i + 1]);
        const placeholders = rows.map(() => '(?, ?, ?, ?)').join(', ');
        await pool.execute(
          `INSERT INTO membership_benefits (membership_plan_id, benefit_key, benefit_value, display_order) VALUES ${placeholders}`,
          rows.flat(),
        );
      }
    }

    return (await this.getById(id))!;
  }

  async delete(id: number, _userId: number): Promise<void> {
    const pool = getPool();

    const existing = await this.getById(id);
    if (!existing) throw new NotFoundError('Membership plan', ErrorCodes.MEMBERSHIP_NOT_FOUND);

    const [active] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM user_memberships WHERE membership_plan_id = ? AND status = 'active'`,
      [id],
    );
    if (active[0]?.cnt > 0) {
      throw new ConflictError('Cannot delete plan with active memberships', ErrorCodes.VALIDATION_INVALID_VALUE);
    }

    await pool.execute(`DELETE FROM membership_benefits WHERE membership_plan_id = ?`, [id]);
    await pool.execute(`DELETE FROM membership_plans WHERE id = ?`, [id]);
  }

  async getOptions() {
    const pool = getPool();
    const [categories] = await pool.execute<RowData>(
      `SELECT DISTINCT category FROM membership_plans WHERE status != 'archived' ORDER BY category`,
    );
    return {
      categories: categories.map((r: any) => r.category),
      duration_types: ['day', 'week', 'month', 'year'],
      statuses: ['active', 'inactive', 'archived'],
    };
  }
}

export const membershipPlanService = new MembershipPlanService();
