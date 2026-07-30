import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

export const supportRepository = {
  async findTickets(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return rows;
  },

  async findTicketById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM support_tickets WHERE id = ?', [id]);
    return rows[0] || null;
  },
};
