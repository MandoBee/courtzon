import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const couponRepository = {
  async findAll(filters: { page: number; limit: number; is_active?: boolean }) {
    const pool = getPool();
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (filters.is_active !== undefined) { where += ' AND c.is_active = ?'; params.push(filters.is_active); }
    const [countRows] = await pool.execute<RowData>(`SELECT COUNT(*) as cnt FROM coupons c ${where}`, params);
    const total = (countRows[0] as any).cnt;
    const offset = (filters.page - 1) * filters.limit;
    const [rows] = await pool.query<RowData>(
      `SELECT c.*, (SELECT COUNT(*) FROM coupon_usage cu WHERE cu.coupon_id = c.id) as usage_count
       FROM coupons c ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, filters.limit, offset],
    );
    return { data: rows, total, page: filters.page, limit: filters.limit };
  },

  async findById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT c.*,
        (SELECT COUNT(*) FROM coupon_usage cu WHERE cu.coupon_id = c.id) as usage_count,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', ca.id, 'entity_type', ca.entity_type, 'entity_id', ca.entity_id, 'is_active', ca.is_active))
         FROM coupon_assignments ca WHERE ca.coupon_id = c.id) as assignments
       FROM coupons c WHERE c.id = ?`,
      [id],
    );
    const row = rows[0] as any;
    if (!row) return null;
    if (typeof row.assignments === 'string') row.assignments = JSON.parse(row.assignments);
    if (!row.assignments) row.assignments = [];
    return row;
  },

  async findByCode(code: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM coupons WHERE code = ?', [code]);
    return rows[0] || null;
  },

  async create(data: {
    code: string; discount_type: 'percentage' | 'fixed'; discount_value: number;
    activity_type?: string; sport_id?: number;
    min_order_amount?: number; max_uses?: number; max_uses_per_user?: number;
    starts_at?: string; expires_at?: string; is_active?: boolean;
  }) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO coupons (code, discount_type, discount_value, activity_type, sport_id,
        min_order_amount, max_uses, max_uses_per_user, starts_at, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.code, data.discount_type, data.discount_value, data.activity_type || null,
       data.sport_id || null, data.min_order_amount || null, data.max_uses || null,
       data.max_uses_per_user ?? 1, data.starts_at || null, data.expires_at || null,
       data.is_active ?? true],
    );
    return { id: result.insertId, ...data };
  },

  async update(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const params: any[] = [];
    for (const key of ['code', 'discount_type', 'discount_value', 'activity_type', 'sport_id',
      'min_order_amount', 'max_uses', 'max_uses_per_user', 'starts_at', 'expires_at', 'is_active',
    ] as const) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }
    if (!fields.length) return;
    params.push(id);
    await pool.execute(`UPDATE coupons SET ${fields.join(', ')} WHERE id = ?`, params);
  },

  async delete(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM coupons WHERE id = ?', [id]);
  },
};
