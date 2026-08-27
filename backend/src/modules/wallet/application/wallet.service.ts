import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { walletRepository } from '../infrastructure/repositories/wallet.repository.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { withTransaction } from '../../../database/database.transaction.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { isFeatureEnabled } from '../../../shared/utils/feature-flags.js';
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
        'INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (?, 0, ?, 1)',
        [userId, currency]
      );
      wallet = await walletRepository.findByUserId(userId);
    }
    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      reserved_balance: Number(wallet.reserved_balance || 0),
      // Canonical available balance (single authority) — balance minus reserved
      // funds. The frontend must display this value directly rather than
      // reconstructing `balance − reserved_balance` client-side.
      available_balance: Number(wallet.balance) - Number(wallet.reserved_balance || 0),
      currencyCode: wallet.currency_code,
      isLocked: !!wallet.is_locked,
    };
  }

  async deposit(userId: number, amount: number, paymentMethod: string, returnUrl?: string) {
    const wallet = await this.getMyWallet(userId);

    // Create a payment_transactions row up-front via the gateway intention flow
    // (same as booking prepare / marketplace checkout). Paymob's Intention API
    // always returns "pending", so the wallet is credited by the
    // wallet-payment.listener on the `payment:succeeded` event (webhook/confirm/sync).
    const { paymentService } = await import('../../payment/application/payment.service.js');
    const pool = getPool();
    const [userRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT full_name, email, full_phone FROM users WHERE id = ?',
      [userId],
    );
    const user = userRows[0] as any;

    const gwResult = await (paymentService.createGatewayIntention as any)(userId, {
      referenceType: 'wallet_topup',
      referenceId: wallet.id,
      amount,
      currency: wallet.currencyCode,
      paymentMethod: paymentMethod as 'card',
      returnUrl: returnUrl || undefined,
      customerName: user?.full_name,
      customerPhone: user?.full_phone,
      customerEmail: user?.email,
    });

    if (!gwResult.success) {
      return {
        success: false,
        paymentId: undefined,
        clientSecret: null,
        publicKey: process.env.PAYMOB_PUBLIC_KEY || '',
        status: 'failed',
        message: (gwResult as any).errorMessage || 'Payment gateway rejected the transaction',
      };
    }

    return {
      success: false,
      paymentId: gwResult.paymentId,
      clientSecret: gwResult.clientSecret || null,
      publicKey: process.env.PAYMOB_PUBLIC_KEY || '',
      status: 'pending',
      message: 'Payment requires action — complete the card form',
    };
  }

  async withdraw(
    userId: number, amount: number, notes?: string,
    branchFinancialDetailsId?: number, conn?: mysql.PoolConnection,
  ) {
    if (!conn && isFeatureEnabled('WALLET_V2_WITHDRAW')) {
      return this.withdrawV2(userId, amount, notes, branchFinancialDetailsId);
    }

    const wallet = await this.getMyWallet(userId);
    if (Number(wallet.balance) < amount) throw new Error('Insufficient balance');

    let withdrawalId = 0;
    const doDeduction = async (c: mysql.PoolConnection) => {
      const state = await walletRepository.lockAndGetBalance(wallet.id, c);
      if (!state) throw new ConflictError('Wallet is locked');
      const balance = state.balance - amount;
      const updated = await walletRepository.updateBalance(wallet.id, balance, state.version, c);
      if (!updated) throw new ConflictError('Concurrent wallet update');

      const [wdResult] = await c.execute(
        `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, branch_financial_details_id, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', NOW())`,
        [userId, wallet.id, amount, branchFinancialDetailsId || null]
      );
      withdrawalId = (wdResult as any).insertId;

      await transactionService.createWalletWithdraw({
        userId, walletId: wallet.id, amount,
        description: notes || 'Withdrawal request',
      }, c);

      return balance;
    };

    const newBalance = conn ? await doDeduction(conn) : await withTransaction(doDeduction);

    // Canonical accounting trigger — same event as the submission flow.
    // One withdrawal request → one canonical `withdrawal_request` posting.
    if (withdrawalId) {
      try {
        eventBusV2.emit('wallet:withdrawal-submitted', {
          withdrawalId,
          userId,
          amount,
          reason: notes || 'Withdrawal request',
        });
      } catch {}
    }

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

  private async withdrawV2(userId: number, amount: number, notes?: string, branchFinancialDetailsId?: number) {
    const wallet = await this.getMyWallet(userId);

    let withdrawalId = 0;

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

        const [wdResult] = await conn.execute(
          `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, branch_financial_details_id, status, created_at)
           VALUES (?, ?, ?, ?, 'pending', NOW())`,
          [userId, wallet.id, amount, branchFinancialDetailsId || null]
        );
        withdrawalId = (wdResult as any).insertId;

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

    // Canonical accounting trigger — same event as the submission flow.
    if (withdrawalId) {
      try {
        eventBusV2.emit('wallet:withdrawal-submitted', {
          withdrawalId,
          userId,
          amount,
          reason: notes || 'Withdrawal request',
        });
      } catch {}
    }

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
