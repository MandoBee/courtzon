import { withdrawalRequestRepository } from '../../wallet/infrastructure/repositories/withdrawal-request.repository.js';
import { transactionRepository } from '../infrastructure/transaction.repository.js';
import { getPool } from '../../../database/mysql.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

class FinancialAdminService {
  async listWithdrawalRequests(filters: {
    status?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }) {
    return withdrawalRequestRepository.findAll(filters);
  }

  async listTransactions(filters: {
    page: number;
    limit: number;
    type?: string;
    orgId?: number;
    branchId?: number;
    settlementStatus?: string;
    search?: string;
    from?: string;
    to?: string;
  }) {
    return transactionRepository.getAllEntries(filters);
  }

  async getTransaction(id: number) {
    const txn = await transactionRepository.findById(id);
    if (!txn) throw new NotFoundError('Transaction');
    return txn;
  }

  async listOrganisations(search?: string) {
    const pool = getPool();
    const params: any[] = [];
    let where = '';
    if (search) { where = 'WHERE o.name LIKE ?'; params.push(`%${search}%`); }
    const [rows] = await pool.execute<RowData>(
      `SELECT o.id, o.name
       FROM organisations o
       ${where}
       ORDER BY o.name`,
      params,
    );
    return rows;
  }

  async getWithdrawalRequest(id: number) {
    const req = await withdrawalRequestRepository.findById(id);
    if (!req) throw new NotFoundError('Withdrawal request');
    return req;
  }

  async approveWithdrawalRequest(id: number, reviewedBy: number, notes?: string) {
    const req = await withdrawalRequestRepository.findById(id);
    if (!req) throw new NotFoundError('Withdrawal request');
    if (req.status !== 'pending') throw new Error('Can only approve pending requests');
    await withdrawalRequestRepository.updateStatus(id, 'approved', reviewedBy, notes);
    return { success: true, status: 'approved' };
  }

  async rejectWithdrawalRequest(id: number, reviewedBy: number, notes?: string) {
    const req = await withdrawalRequestRepository.findById(id);
    if (!req) throw new NotFoundError('Withdrawal request');
    if (req.status !== 'pending') throw new Error('Can only reject pending requests');
    await withdrawalRequestRepository.updateStatus(id, 'rejected', reviewedBy, notes);
    return { success: true, status: 'rejected' };
  }

  async completeWithdrawalRequest(id: number, reviewedBy: number, notes?: string) {
    const req = await withdrawalRequestRepository.findById(id);
    if (!req) throw new NotFoundError('Withdrawal request');
    if (req.status !== 'approved') throw new Error('Can only complete approved requests');
    await withdrawalRequestRepository.updateStatus(id, 'completed', reviewedBy, notes);
    return { success: true, status: 'completed' };
  }
}

export const financialAdminService = new FinancialAdminService();
