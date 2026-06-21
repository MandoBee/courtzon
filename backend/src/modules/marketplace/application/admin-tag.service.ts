import { getPool } from '../../../database/mysql.js';

type RowData = import('mysql2/promise').RowDataPacket[];

export const adminTagService = {
  async list() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT t.*, (SELECT COUNT(*) FROM product_tags pt WHERE pt.tag_id = t.id) as product_count FROM tags t ORDER BY t.name ASC'
    );
    return rows;
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM tags WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create(data: { name: string; slug: string }) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO tags (name, slug) VALUES (?, ?)',
      [data.name, data.slug]
    );
    return (result as any).insertId;
  },

  async update(id: number, data: { name?: string; slug?: string; isActive?: boolean }) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.slug !== undefined) { fields.push('slug = ?'); params.push(data.slug); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); params.push(data.isActive); }
    if (!fields.length) return false;
    params.push(id);
    const [result] = await pool.execute(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`, params);
    return (result as any).affectedRows > 0;
  },

  async delete(id: number) {
    const pool = getPool();
    const [result] = await pool.execute('DELETE FROM tags WHERE id = ?', [id]);
    return (result as any).affectedRows > 0;
  },
};
