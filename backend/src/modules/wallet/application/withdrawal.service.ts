import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { recordAudit } from '../../audit-log/index.js';

type RowData = mysql.RowDataPacket[];

const VALID_TRANSITIONS: Record<string, string[]> = {
  'pending': ['under_review', 'cancelled'],
  'under_review': ['approved', 'rejected', 'cancelled'],
  'approved': ['processing', 'cancelled'],
  'rejected': [],
  'processing': ['completed', 'cancelled'],
  'completed': [],
  'cancelled': [],
};

export const withdrawalService = {
  async submit(userId: number, amount: number, reason: string, playerNotes?: string) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [wallet] = await conn.execute<RowData>(
        'SELECT id, balance, reserved_balance FROM user_wallets WHERE user_id = ? FOR UPDATE', [userId]
      ) as any;
      if (!wallet.length) throw new Error('Wallet not found');
      const w = wallet[0];
      const available = Number(w.balance) - Number(w.reserved_balance);
      if (amount <= 0) throw new Error('Amount must be positive');
      if (amount > available) throw new Error('Insufficient available balance');
      await conn.execute(
        'UPDATE user_wallets SET reserved_balance = reserved_balance + ? WHERE id = ?',
        [amount, w.id]
      );
      const [result] = await conn.execute(
        `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, reason, player_notes, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [userId, w.id, amount, reason, playerNotes || null]
      ) as any;
      await conn.commit();
      const requestId = result.insertId;
      try { eventBusV2.emit('wallet:withdrawal-submitted' as any, { withdrawalId: requestId, userId, amount, reason }); } catch {}
      recordAudit({ actorId: userId, action: 'WITHDRAWAL.SUBMIT', entityType: 'withdrawal_request', entityId: requestId, afterState: { amount, reason, status: 'pending' } });
      return { id: requestId, status: 'pending', amount, reserved: true };
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  },

  async transition(requestId: number, toStatus: string, actorId: number, data?: { resolutionNotes?: string; rejectionReason?: string; executionMethod?: string; referenceNumber?: string }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute<RowData>('SELECT * FROM withdrawal_requests WHERE id = ? FOR UPDATE', [requestId]) as any;
      if (!rows.length) throw new Error('Withdrawal request not found');
      const req = rows[0];
      const current = req.status;
      const allowed = VALID_TRANSITIONS[current];
      if (!allowed || !allowed.includes(toStatus)) throw new Error(`Cannot transition from ${current} to ${toStatus}`);
      const updates: string[] = ['status = ?'];
      const params: any[] = [toStatus];
      if (toStatus === 'approved' || toStatus === 'rejected') {
        updates.push('reviewed_by = ?', 'reviewed_at = NOW()');
        params.push(actorId);
      }
      if (data?.resolutionNotes) { updates.push('resolution_notes = COALESCE(resolution_notes, \'\') || ?'); params.push('\n' + data.resolutionNotes); }
      if (toStatus === 'completed') {
        updates.push('executed_by = ?', 'executed_at = NOW()');
        params.push(actorId);
        if (data?.executionMethod) { updates.push('execution_method = ?'); params.push(data.executionMethod); }
        if (data?.referenceNumber) { updates.push('reference_number = ?'); params.push(data.referenceNumber); }
        await conn.execute('UPDATE user_wallets SET balance = balance - ?, reserved_balance = reserved_balance - ? WHERE user_id = ? AND reserved_balance >= ?', [req.amount, req.amount, req.user_id, req.amount]);
      }
      if (toStatus === 'rejected' || toStatus === 'cancelled') {
        await conn.execute('UPDATE user_wallets SET reserved_balance = reserved_balance - ? WHERE user_id = ? AND reserved_balance >= ?', [req.amount, req.user_id, req.amount]);
      }
      params.push(requestId);
      await conn.execute(`UPDATE withdrawal_requests SET ${updates.join(', ')} WHERE id = ?`, params);
      await conn.commit();
      const eventName = `wallet:withdrawal-${toStatus.replace(/_/g, '-')}`;
      try { eventBusV2.emit(eventName as any, { withdrawalId: requestId, userId: req.user_id, amount: req.amount, status: toStatus, reason: req.reason }); } catch {}
      recordAudit({ actorId, action: 'WITHDRAWAL.' + toStatus.toUpperCase(), entityType: 'withdrawal_request', entityId: requestId, afterState: { status: toStatus, ...data } });
      return { id: requestId, status: toStatus };
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  },

  async list(filters: { status?: string; search?: string; page?: number; limit?: number }) {
    const pool = getPool();
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (filters.status) { where += ' AND wr.status = ?'; params.push(filters.status); }
    if (filters.search) { where += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone_number LIKE ?)'; params.push('%'+filters.search+'%', '%'+filters.search+'%', '%'+filters.search+'%'); }
    const [count] = await pool.execute<RowData>(`SELECT COUNT(*) as total FROM withdrawal_requests wr JOIN users u ON u.id = wr.user_id ${where}`, params) as any;
    const [rows] = await pool.execute<RowData>(`SELECT wr.*, u.full_name, u.email, u.phone_number, uw.balance AS wallet_balance, uw.reserved_balance FROM withdrawal_requests wr JOIN users u ON u.id = wr.user_id JOIN user_wallets uw ON uw.user_id = wr.user_id ${where} ORDER BY FIELD(wr.status, 'pending','under_review','approved','processing') ASC, wr.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]) as any;
    return { data: rows, total: count[0].total, page, limit };
  },

  async getById(requestId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(`SELECT wr.*, u.full_name, u.email, u.phone_number, uw.balance AS wallet_balance, uw.reserved_balance FROM withdrawal_requests wr JOIN users u ON u.id = wr.user_id JOIN user_wallets uw ON uw.user_id = wr.user_id WHERE wr.id = ?`, [requestId]) as any;
    if (!rows.length) throw new Error('Not found');
    return rows[0];
  },

  async listByUser(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [userId]) as any;
    return rows;
  },

  async getStats() {
    const pool = getPool();
    const [[pending]] = await pool.execute<RowData>('SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM withdrawal_requests WHERE status IN (\'pending\',\'under_review\')') as any;
    const [[completed]] = await pool.execute<RowData>('SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM withdrawal_requests WHERE status = \'completed\' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)') as any;
    const [[rate]] = await pool.execute<RowData>('SELECT ROUND(100 * SUM(CASE WHEN status=\'completed\' THEN 1 ELSE 0 END) / GREATEST(SUM(CASE WHEN status IN (\'completed\',\'rejected\') THEN 1 ELSE 0 END), 1), 1) AS pct FROM withdrawal_requests') as any;
    return { pendingCount: Number(pending.cnt), pendingAmount: Number(pending.total), completedCount: Number(completed.cnt), completedAmount: Number(completed.total), approvalRate: Number(rate.pct), totalRequests: 0 };
  }
};
