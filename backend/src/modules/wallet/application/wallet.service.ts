import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { walletRepository } from '../infrastructure/repositories/wallet.repository.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';
import { ConflictError } from '../../../shared/errors/app-error.js';

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
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const state = await walletRepository.lockAndGetBalance(wallet.id);
        if (!state) throw new ConflictError('Wallet is locked');
        const newBalance = state.balance + amount;
        const updated = await walletRepository.updateBalance(wallet.id, newBalance, state.version);
        if (!updated) throw new ConflictError('Concurrent wallet update');

        // Double-entry: platform float → user wallet
        await transactionService.createWalletTopup({
          userId,
          walletId: wallet.id,
          amount,
          sourceType: 'payment_gateway',
          description: `Deposit via ${paymentMethod}`,
        });

        await conn.commit();
        return { success: true, balance: newBalance, transactionId: paymentResult.transactionId };
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
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

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const state = await walletRepository.lockAndGetBalance(wallet.id);
      if (!state) throw new ConflictError('Wallet is locked');
      const newBalance = state.balance - amount;
      const updated = await walletRepository.updateBalance(wallet.id, newBalance, state.version);
      if (!updated) throw new ConflictError('Concurrent wallet update');

      // Create withdrawal request record linking to branch bank account
      await conn.execute(
        `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, branch_financial_details_id, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', NOW())`,
        [userId, wallet.id, amount, branchFinancialDetailsId || null]
      );

      // Double-entry: user wallet → platform float
      await transactionService.createWalletWithdraw({
        userId,
        walletId: wallet.id,
        amount,
        description: notes || 'Withdrawal request',
      });

      await conn.commit();
      return { success: true, balance: newBalance };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getTransactions(userId: number, filters: {
    type?: string; from?: string; to?: string; page: number; limit: number;
  }) {
    return transactionService.getUserTransactions(userId, filters.page, filters.limit);
  }
}

export const walletService = new WalletService();
