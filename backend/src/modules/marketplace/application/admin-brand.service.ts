import { getPool } from '../../../database/mysql.js';

type RowData = import('mysql2/promise').RowDataPacket[];

export const adminBrandService = {
  async list() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM brands ORDER BY sort_order ASC, name ASC'
    );
    return rows;
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM brands WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create(data: {
    name: string; slug: string; description?: string; logoUrl?: string;
    website?: string; country?: string; sortOrder?: number;
  }) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO brands (name, slug, description, logo_url, website, country, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.slug, data.description || null, data.logoUrl || null,
       data.website || null, data.country || null, data.sortOrder ?? 0]
    );
    return (result as any).insertId;
  },

  async update(id: number, data: {
    name?: string; slug?: string; description?: string; logoUrl?: string;
    website?: string; country?: string; sortOrder?: number; isActive?: boolean;
  }) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.slug !== undefined) { fields.push('slug = ?'); params.push(data.slug); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.logoUrl !== undefined) { fields.push('logo_url = ?'); params.push(data.logoUrl); }
    if (data.website !== undefined) { fields.push('website = ?'); params.push(data.website); }
    if (data.country !== undefined) { fields.push('country = ?'); params.push(data.country); }
    if (data.sortOrder !== undefined) { fields.push('sort_order = ?'); params.push(data.sortOrder); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); params.push(data.isActive); }
    if (!fields.length) return false;
    params.push(id);
    const [result] = await pool.execute(
      `UPDATE brands SET ${fields.join(', ')} WHERE id = ?`, params
    );
    return (result as any).affectedRows > 0;
  },

  async delete(id: number) {
    const pool = getPool();
    const [result] = await pool.execute('UPDATE brands SET is_active = FALSE WHERE id = ?', [id]);
    return (result as any).affectedRows > 0;
  },
};
