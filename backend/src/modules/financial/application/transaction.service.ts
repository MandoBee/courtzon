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
  sourceId: number; // booking id
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
  sourceId: number; // booking id
  description: string;
}

class TransactionService {

  async createBookingPayment(params: BookingPaymentParams): Promise<number> {
    const txnId = await transactionRepository.createTransaction({
      type: 'booking_payment',
      sourceType: 'booking',
      sourceId: params.sourceId,
      totalAmount: params.amount,
      status: 'completed',
    });

    const netAmount = params.amount - params.commissionAmount;

    await transactionRepository.createEntries([
      // Debit: user wallet
      {
        transactionId: txnId,
        side: 'debit',
        entityType: 'user_wallet',
        entityId: params.walletId,
        amount: params.amount,
        description: `Payment for booking #${params.sourceId}`,
      },
      // Credit: platform float (temporary hold)
      {
        transactionId: txnId,
        side: 'credit',
        entityType: 'platform_account',
        entityId: 1, // float account
        amount: params.amount,
        description: `Received payment for booking #${params.sourceId}`,
      },
      // Debit: platform float (release funds)
      {
        transactionId: txnId,
        side: 'debit',
        entityType: 'platform_account',
        entityId: 1,
        amount: params.amount,
        description: `Routing payment for booking #${params.sourceId}`,
      },
      // Credit: branch (net amount after commission)
      {
        transactionId: txnId,
        side: 'credit',
        entityType: 'branch',
        entityId: params.branchId,
        amount: netAmount,
        branchId: params.branchId,
        organisationId: params.organisationId,
        description: `Net revenue for booking #${params.sourceId}`,
      },
      // Credit: platform commission
      {
        transactionId: txnId,
        side: 'credit',
        entityType: 'platform_account',
        entityId: 2, // commission account
        amount: params.commissionAmount,
        description: `Commission for booking #${params.sourceId}`,
      },
    ]);

    return txnId;
  }

  async createWalletTopup(params: WalletTopupParams): Promise<number> {
    const txnId = await transactionRepository.createTransaction({
      type: 'wallet_topup',
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      totalAmount: params.amount,
      status: 'completed',
    });

    await transactionRepository.createEntries([
      // Debit: platform float
      {
        transactionId: txnId,
        side: 'debit',
        entityType: 'platform_account',
        entityId: 1, // float account
        amount: params.amount,
        description: 'Funds for wallet topup',
      },
      // Credit: user wallet
      {
        transactionId: txnId,
        side: 'credit',
        entityType: 'user_wallet',
        entityId: params.walletId,
        amount: params.amount,
        description: params.description,
      },
    ]);

    return txnId;
  }

  async createWalletWithdraw(params: WalletWithdrawParams): Promise<number> {
    const txnId = await transactionRepository.createTransaction({
      type: 'withdrawal',
      sourceType: 'wallet',
      totalAmount: params.amount,
      status: 'completed',
    });

    await transactionRepository.createEntries([
      // Debit: user wallet
      {
        transactionId: txnId,
        side: 'debit',
        entityType: 'user_wallet',
        entityId: params.walletId,
        amount: params.amount,
        description: params.description,
      },
      // Credit: platform float (held for payout processing)
      {
        transactionId: txnId,
        side: 'credit',
        entityType: 'platform_account',
        entityId: 1,
        amount: params.amount,
        description: `Withdrawal request - held for payout: ${params.description}`,
      },
    ]);

    return txnId;
  }

  async createRefund(params: RefundParams): Promise<number> {
    const txnId = await transactionRepository.createTransaction({
      type: 'refund',
      sourceType: 'booking',
      sourceId: params.sourceId,
      totalAmount: params.amount,
      status: 'completed',
    });

    await transactionRepository.createEntries([
      // Debit: branch (reverse revenue)
      {
        transactionId: txnId,
        side: 'debit',
        entityType: 'branch',
        entityId: params.branchId,
        amount: params.amount,
        branchId: params.branchId,
        organisationId: params.organisationId,
        description: `Refund for booking #${params.sourceId}`,
      },
      // Credit: user wallet
      {
        transactionId: txnId,
        side: 'credit',
        entityType: 'user_wallet',
        entityId: params.walletId,
        amount: params.amount,
        description: params.description,
      },
    ]);

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
