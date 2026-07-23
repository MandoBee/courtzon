import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { walletRepository } from '../infrastructure/repositories/wallet.repository.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { withTransaction } from '../../../database/database.transaction.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { isFeatureEnabled } from '../../../shared/utils/feature-flags.js';
import { depositWalletHandler, type DepositWalletPayload } from '../commands/deposit-wallet.command.js';
import { withdrawWalletHandler, type WithdrawWalletPayload } from '../commands/withdraw-wallet.command.js';
import type { Command } from '../../../shared/command/command-base.js';

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
        'INSERT INTO user_wallets (user_id, balance, currency_code, aggregate_version) VALUES (?, 0, ?, 1)',
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
    if (isFeatureEnabled('WALLET_V2_DEPOSIT')) {
      return this.depositV2(userId, amount, paymentMethod, returnUrl);
    }

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
        const state = await walletRepository.lockAndGetBalance(wallet.id, conn);
        if (!state) throw new ConflictError('Wallet is locked');
        const balance = state.balance + amount;
        const updated = await walletRepository.updateBalance(wallet.id, balance, state.version, conn);
        if (!updated) throw new ConflictError('Concurrent wallet update');

        await transactionService.createWalletTopup({
          userId, walletId: wallet.id, amount,
          sourceType: 'payment_gateway',
          description: `Deposit via ${paymentMethod}`,
        }, conn);

        return balance;
      });

      eventBusV2.emit('wallet:deposit', {
        walletId: wallet.id,
        userId,
        amount,
        balance: newBalance,
        currency: wallet.currencyCode,
      });
      if (newBalance < 50) {
        eventBusV2.emit('wallet:low-balance', {
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
    if (isFeatureEnabled('WALLET_V2_WITHDRAW')) {
      return this.withdrawV2(userId, amount, notes, branchFinancialDetailsId);
    }

    const wallet = await this.getMyWallet(userId);
    if (Number(wallet.balance) < amount) throw new Error('Insufficient balance');

    const newBalance = await withTransaction(async (conn) => {
      const state = await walletRepository.lockAndGetBalance(wallet.id, conn);
      if (!state) throw new ConflictError('Wallet is locked');
      const balance = state.balance - amount;
      const updated = await walletRepository.updateBalance(wallet.id, balance, state.version, conn);
      if (!updated) throw new ConflictError('Concurrent wallet update');

      await conn.execute(
        `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, branch_financial_details_id, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', NOW())`,
        [userId, wallet.id, amount, branchFinancialDetailsId || null]
      );

      await transactionService.createWalletWithdraw({
        userId, walletId: wallet.id, amount,
        description: notes || 'Withdrawal request',
      }, conn);

      return balance;
    });

    eventBusV2.emit('wallet:withdrawal', {
      walletId: wallet.id,
      userId,
      amount,
      balance: newBalance,
      currency: wallet.currencyCode,
    });
    if (newBalance < 50) {
      eventBusV2.emit('wallet:low-balance', {
        userId,
        balance: newBalance,
        currency: wallet.currencyCode,
      });
    }
    return { success: true, balance: newBalance };
  }

  private async depositV2(userId: number, amount: number, paymentMethod: string, returnUrl?: string) {
    const wallet = await this.getMyWallet(userId);

    const paymentRequest = {
      amount,
      currency: wallet.currencyCode,
      referenceId: wallet.id,
      referenceType: 'wallet_topup' as const,
      returnUrl: returnUrl || undefined,
    };

    const paymentResult = await paymentGateway.charge(paymentRequest);
    if (!paymentResult.success || paymentResult.status !== 'paid') {
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

    const command: Command = {
      commandId: `deposit-wallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: 'DepositWallet',
      aggregateType: 'wallet',
      aggregateId: String(wallet.id),
      payload: { walletId: wallet.id, userId, amount, currency: wallet.currencyCode } satisfies DepositWalletPayload,
      correlationId: `dep_${Date.now()}`,
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => depositWalletHandler.validate(command),
      execute: async (cmd, conn) => {
        const depositResult = await depositWalletHandler.execute(cmd, conn);

        await transactionService.createWalletTopup({
          userId, walletId: wallet.id, amount,
          sourceType: 'payment_gateway',
          description: `Deposit via ${paymentMethod}`,
        }, conn);

        return depositResult;
      },
      events: (cmd, res) => depositWalletHandler.events!(cmd, res),
    });

    if (result.status === 'error') {
      throw new Error(`DepositWallet failed: ${result.message}`);
    }

    const data = result.data!;
    eventBusV2.emit('wallet:deposit', {
      walletId: wallet.id,
      userId,
      amount,
      balance: data.newBalance,
      currency: wallet.currencyCode,
    });
    if (data.newBalance < 50) {
      eventBusV2.emit('wallet:low-balance', {
        userId,
        balance: data.newBalance,
        currency: wallet.currencyCode,
      });
    }

    return { success: true, balance: data.newBalance, transactionId: paymentResult.transactionId };
  }

  private async withdrawV2(userId: number, amount: number, notes?: string, branchFinancialDetailsId?: number) {
    const wallet = await this.getMyWallet(userId);

    const command: Command = {
      commandId: `withdraw-wallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: 'WithdrawWallet',
      aggregateType: 'wallet',
      aggregateId: String(wallet.id),
      payload: { walletId: wallet.id, userId, amount, description: notes } satisfies WithdrawWalletPayload,
      correlationId: `wd_${Date.now()}`,
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => withdrawWalletHandler.validate(command),
      execute: async (cmd, conn) => {
        const withdrawResult = await withdrawWalletHandler.execute(cmd, conn);

        await conn.execute(
          `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, branch_financial_details_id, status, created_at)
           VALUES (?, ?, ?, ?, 'pending', NOW())`,
          [userId, wallet.id, amount, branchFinancialDetailsId || null]
        );

        await transactionService.createWalletWithdraw({
          userId, walletId: wallet.id, amount,
          description: notes || 'Withdrawal request',
        }, conn);

        return withdrawResult;
      },
      events: (cmd, res) => withdrawWalletHandler.events!(cmd, res),
    });

    if (result.status === 'error') {
      throw new Error(`WithdrawWallet failed: ${result.message}`);
    }

    const data = result.data!;
    eventBusV2.emit('wallet:withdrawal', {
      walletId: wallet.id,
      userId,
      amount,
      balance: data.newBalance,
      currency: wallet.currencyCode,
    });
    if (data.newBalance < 50) {
      eventBusV2.emit('wallet:low-balance', {
        userId,
        balance: data.newBalance,
        currency: wallet.currencyCode,
      });
    }

    return { success: true, balance: data.newBalance };
  }

  async getTransactions(userId: number, filters: {
    type?: string; from?: string; to?: string; page: number; limit: number;
  }) {
    return transactionService.getUserTransactions(userId, filters.page, filters.limit);
  }
}

export const walletService = new WalletService();
