import { getPool } from '../../../database/mysql.js';

type RowData = import('mysql2/promise').RowDataPacket[];

export const adminCategoryService = {
  async listCategories() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pc.*, p.name as parent_name
       FROM product_categories pc
       LEFT JOIN product_categories p ON pc.parent_id = p.id
       ORDER BY pc.sort_order ASC, pc.id ASC`
    );
    return rows;
  },

  async getCategory(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pc.*, p.name as parent_name
       FROM product_categories pc
       LEFT JOIN product_categories p ON pc.parent_id = p.id
       WHERE pc.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async createCategory(data: {
    name: string; slug: string; parentId?: number;
    description?: string; imageUrl?: string; sortOrder?: number;
  }) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO product_categories (parent_id, name, slug, description, image_url, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.parentId || null, data.name, data.slug,
       data.description || null, data.imageUrl || null, data.sortOrder ?? 0]
    );
    return (result as any).insertId;
  },

  async updateCategory(id: number, data: {
    name?: string; slug?: string; parentId?: number | null;
    description?: string; imageUrl?: string; sortOrder?: number;
    isActive?: boolean;
  }) {
    const pool = getPool();
    const fields: string[] = [];
    const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.slug !== undefined) { fields.push('slug = ?'); params.push(data.slug); }
    if (data.parentId !== undefined) { fields.push('parent_id = ?'); params.push(data.parentId); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.imageUrl !== undefined) { fields.push('image_url = ?'); params.push(data.imageUrl); }
    if (data.sortOrder !== undefined) { fields.push('sort_order = ?'); params.push(data.sortOrder); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); params.push(data.isActive); }
    if (!fields.length) return false;
    params.push(id);
    const [result] = await pool.execute(
      `UPDATE product_categories SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
    return (result as any).affectedRows > 0;
  },

  async deleteCategory(id: number) {
    const pool = getPool();
    await pool.execute('UPDATE product_categories SET parent_id = NULL WHERE parent_id = ?', [id]);
    const [result] = await pool.execute(
      'UPDATE product_categories SET is_active = FALSE WHERE id = ?',
      [id]
    );
    return (result as any).affectedRows > 0;
  },
};
