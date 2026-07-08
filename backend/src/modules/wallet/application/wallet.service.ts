import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { walletRepository } from '../infrastructure/repositories/wallet.repository.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { withTransaction } from '../../../database/database.transaction.js';
import { eventBus } from '../../../shared/event-bus/index.js';

export class WalletService {
  async getMyWallet(userId: number) {
    let wallet = await walletRepository.findByUserId(userId);
    if (!wallet) {
      const pool = getPool();
      const [userRows] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT c.default_currency FROM users u
         JOIN countries c ON c.id = u.country_id
         WHERE u.id = ?`,
        [userId]
      );
      const currency = (userRows[0] as any)?.default_currency || 'EGP';
      await pool.execute(
        'INSERT INTO user_wallets (user_id, balance, currency_code) VALUES (?, 0, ?)',
        [userId, currency]
      );
      wallet = await walletRepository.findByUserId(userId);
    }
    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      currencyCode: wallet.currency_code,
      isLocked: !!wallet.is_locked,
    };
  }

  async deposit(userId: number, amount: number, paymentMethod: string, returnUrl?: string) {
    const wallet = await this.getMyWallet(userId);
    const paymentRequest = {
      amount,
      currency: wallet.currencyCode,
      referenceId: wallet.id,
      referenceType: 'wallet_topup' as const,
      returnUrl: returnUrl || undefined,
    };

    const paymentResult = await paymentGateway.charge(paymentRequest);

    if (paymentResult.success && paymentResult.status === 'paid') {
      const newBalance = await withTransaction(async (conn) => {
        // FOR UPDATE lock held for duration of transaction
        const state = await walletRepository.lockAndGetBalance(wallet.id, conn);
        if (!state) throw new ConflictError('Wallet is locked');
        const balance = state.balance + amount;
        const updated = await walletRepository.updateBalance(wallet.id, balance, state.version, conn);
        if (!updated) throw new ConflictError('Concurrent wallet update');

        // Double-entry: platform float → user wallet (on the SAME connection)
        await transactionService.createWalletTopup({
          userId, walletId: wallet.id, amount,
          sourceType: 'payment_gateway',
          description: `Deposit via ${paymentMethod}`,
        }, conn);

        return balance;
      });

      eventBus.emit('wallet:deposit', {
        walletId: wallet.id,
        userId,
        amount,
        balance: newBalance,
        currency: wallet.currencyCode,
      });
      if (newBalance < 50) {
        eventBus.emit('wallet:low-balance', {
          userId,
          balance: newBalance,
          currency: wallet.currencyCode,
        });
      }
      return { success: true, balance: newBalance, transactionId: paymentResult.transactionId };
    }

    return {
      success: false,
      paymentUrl: paymentResult.paymentUrl,
      clientSecret: paymentResult.clientSecret,
      publicKey: process.env.PAYMOB_PUBLIC_KEY || '',
      transactionId: paymentResult.transactionId,
      status: paymentResult.status,
      message: 'Payment requires action — redirect to gateway',
    };
  }

  async withdraw(userId: number, amount: number, notes?: string, branchFinancialDetailsId?: number) {
    const wallet = await this.getMyWallet(userId);
    if (Number(wallet.balance) < amount) throw new Error('Insufficient balance');

    const newBalance = await withTransaction(async (conn) => {
      // FOR UPDATE lock held for duration of transaction
      const state = await walletRepository.lockAndGetBalance(wallet.id, conn);
      if (!state) throw new ConflictError('Wallet is locked');
      const balance = state.balance - amount;
      const updated = await walletRepository.updateBalance(wallet.id, balance, state.version, conn);
      if (!updated) throw new ConflictError('Concurrent wallet update');

      // Create withdrawal request on same connection
      await conn.execute(
        `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, branch_financial_details_id, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', NOW())`,
        [userId, wallet.id, amount, branchFinancialDetailsId || null]
      );

      // Double-entry: user wallet → platform float (on the SAME connection)
      await transactionService.createWalletWithdraw({
        userId, walletId: wallet.id, amount,
        description: notes || 'Withdrawal request',
      }, conn);

      return balance;
    });

    eventBus.emit('wallet:withdrawal', {
      walletId: wallet.id,
      userId,
      amount,
      balance: newBalance,
      currency: wallet.currencyCode,
    });
    if (newBalance < 50) {
      eventBus.emit('wallet:low-balance', {
        userId,
        balance: newBalance,
        currency: wallet.currencyCode,
      });
    }
    return { success: true, balance: newBalance };
  }

  async getTransactions(userId: number, filters: {
    type?: string; from?: string; to?: string; page: number; limit: number;
  }) {
    return transactionService.getUserTransactions(userId, filters.page, filters.limit);
  }
}

export const walletService = new WalletService();
