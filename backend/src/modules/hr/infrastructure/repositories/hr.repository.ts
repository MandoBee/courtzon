import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

type RowData = RowDataPacket[];

export const hrRepository = {
  async listDepartments(page: number, limit: number) {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute<RowData>('SELECT * FROM departments ORDER BY name ASC LIMIT ? OFFSET ?', [limit, offset] as any);
    const [countResult] = await pool.execute<RowData>('SELECT COUNT(*) as total FROM departments');
    return { rows, total: (countResult[0] as any).total };
  },

  async getDepartment(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM departments WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async createDepartment(name: string, description: string | null, headUserId: number | null) {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>('INSERT INTO departments (name, description, head_user_id) VALUES (?, ?, ?)', [name, description, headUserId] as any);
    return result.insertId;
  },

  async listPositions(page: number, limit: number) {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute<RowData>('SELECT * FROM positions ORDER BY title ASC LIMIT ? OFFSET ?', [limit, offset] as any);
    const [countResult] = await pool.execute<RowData>('SELECT COUNT(*) as total FROM positions');
    return { rows, total: (countResult[0] as any).total };
  },

  async getPosition(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM positions WHERE id = ?', [id]);
    return rows[0] || null;
  },
};
