import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const couponAssignmentRepository = {
  async findByCouponId(couponId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM coupon_assignments WHERE coupon_id = ?',
      [couponId],
    );
    return rows;
  },

  async upsert(couponId: number, assignments: { entity_type: string; entity_id: number }[]) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Remove existing, re-insert
      await conn.execute('DELETE FROM coupon_assignments WHERE coupon_id = ?', [couponId]);
      for (const a of assignments) {
        await conn.execute(
          'INSERT INTO coupon_assignments (coupon_id, entity_type, entity_id) VALUES (?, ?, ?)',
          [couponId, a.entity_type, a.entity_id],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async deleteByCouponId(couponId: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM coupon_assignments WHERE coupon_id = ?', [couponId]);
  },
};
