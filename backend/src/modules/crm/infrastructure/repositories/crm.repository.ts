import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

export const crmRepository = {
  async listLeads(page: number, limit: number) {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const [rows] = await pool.query<RowData>('SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    const [countResult] = await pool.execute<RowData>('SELECT COUNT(*) as total FROM leads');
    return { rows, total: (countResult[0] as any).total };
  },

  async listSegments() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM segments WHERE is_active = 1 ORDER BY name');
    return rows;
  },
};
