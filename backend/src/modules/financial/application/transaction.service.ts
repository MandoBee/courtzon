import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { transactionRepository } from '../infrastructure/transaction.repository.js';
import { walletRepository } from '../../wallet/infrastructure/repositories/wallet.repository.js';

export interface BookingPaymentParams {
  userId: number;
  walletId: number;
  branchId: number;
  organisationId: number;
  amount: number;
  commissionAmount: number;
  sourceId: number;
  description: string;
}

export interface WalletTopupParams {
  userId: number;
  walletId: number;
  amount: number;
  sourceType: string;
  sourceId?: number;
  description: string;
}

export interface WalletWithdrawParams {
  userId: number;
  walletId: number;
  amount: number;
  description: string;
}

export interface RefundParams {
  userId: number;
  walletId: number;
  branchId: number;
  organisationId: number;
  amount: number;
  sourceId: number;
  description: string;
}

class TransactionService {

  /**
   * Create booking payment journal. Accepts optional conn for transactional writes.
   */
  async createBookingPayment(params: BookingPaymentParams, conn?: mysql.PoolConnection): Promise<number> {
    const txnId = await transactionRepository.createTransaction({
      type: 'booking_payment',
      sourceType: 'booking',
      sourceId: params.sourceId,
      totalAmount: params.amount,
      status: 'completed',
    }, conn);

    const netAmount = params.amount - params.commissionAmount;

    await transactionRepository.createEntries([
      { transactionId: txnId, side: 'debit', entityType: 'user_wallet', entityId: params.walletId, amount: params.amount, description: `Payment for booking #${params.sourceId}` },
      { transactionId: txnId, side: 'credit', entityType: 'platform_account', entityId: 1, amount: params.amount, description: `Received payment for booking #${params.sourceId}` },
      { transactionId: txnId, side: 'debit', entityType: 'platform_account', entityId: 1, amount: params.amount, description: `Routing payment for booking #${params.sourceId}` },
      { transactionId: txnId, side: 'credit', entityType: 'branch', entityId: params.branchId, amount: netAmount, branchId: params.branchId, organisationId: params.organisationId, description: `Net revenue for booking #${params.sourceId}` },
      { transactionId: txnId, side: 'credit', entityType: 'platform_account', entityId: 2, amount: params.commissionAmount, description: `Commission for booking #${params.sourceId}` },
    ], conn);

    return txnId;
  }

  /**
   * Create wallet topup journal entries. Accepts optional conn for transactional writes.
   */
  async createWalletTopup(params: WalletTopupParams, conn?: mysql.PoolConnection): Promise<number> {
    const txnId = await transactionRepository.createTransaction({
      type: 'wallet_topup', sourceType: params.sourceType, sourceId: params.sourceId,
      totalAmount: params.amount, status: 'completed',
    }, conn);

    await transactionRepository.createEntries([
      { transactionId: txnId, side: 'debit', entityType: 'platform_account', entityId: 1, amount: params.amount, description: 'Funds for wallet topup' },
      { transactionId: txnId, side: 'credit', entityType: 'user_wallet', entityId: params.walletId, amount: params.amount, description: params.description },
    ], conn);

    return txnId;
  }

  /**
   * Create wallet withdrawal journal entries. Accepts optional conn for transactional writes.
   */
  async createWalletWithdraw(params: WalletWithdrawParams, conn?: mysql.PoolConnection): Promise<number> {
    const txnId = await transactionRepository.createTransaction({
      type: 'withdrawal', sourceType: 'wallet', totalAmount: params.amount, status: 'completed',
    }, conn);

    await transactionRepository.createEntries([
      { transactionId: txnId, side: 'debit', entityType: 'user_wallet', entityId: params.walletId, amount: params.amount, description: params.description },
      { transactionId: txnId, side: 'credit', entityType: 'platform_account', entityId: 1, amount: params.amount, description: `Withdrawal request - held for payout: ${params.description}` },
    ], conn);

    return txnId;
  }

  /**
   * Create refund journal entries. Accepts optional conn for transactional writes.
   */
  async createRefund(params: RefundParams, conn?: mysql.PoolConnection): Promise<number> {
    const txnId = await transactionRepository.createTransaction({
      type: 'refund', sourceType: 'booking', sourceId: params.sourceId,
      totalAmount: params.amount, status: 'completed',
    }, conn);

    await transactionRepository.createEntries([
      { transactionId: txnId, side: 'debit', entityType: 'branch', entityId: params.branchId, amount: params.amount, branchId: params.branchId, organisationId: params.organisationId, description: `Refund for booking #${params.sourceId}` },
      { transactionId: txnId, side: 'credit', entityType: 'user_wallet', entityId: params.walletId, amount: params.amount, description: params.description },
    ], conn);

    return txnId;
  }

  async getTransaction(id: number) {
    return transactionRepository.findById(id);
  }

  async getUserTransactions(userId: number, page = 1, limit = 20) {
    return transactionRepository.getUserEntries(userId, page, limit);
  }

  async getBranchTransactions(branchId: number, page = 1, limit = 20) {
    return transactionRepository.getBranchEntries(branchId, page, limit);
  }
}

export const transactionService = new TransactionService();
