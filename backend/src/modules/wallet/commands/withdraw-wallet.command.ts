import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { walletRepository } from '../infrastructure/repositories/wallet.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { planBalanceUpdate, isLowBalance } from '../domain/wallet-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';

const log = createModuleLogger('wallet');

export interface WithdrawWalletPayload {
  walletId: number;
  userId: number;
  amount: number;
  referenceType?: string;
  referenceId?: number;
  description?: string;
}

export interface WithdrawWalletResult {
  walletId: number;
  userId: number;
  newBalance: number;
  aggregateVersion?: number;
}

export const withdrawWalletHandler: CommandHandler<Command, WithdrawWalletResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as WithdrawWalletPayload;
    if (!p.walletId || p.walletId <= 0) throw new Error('walletId is required and must be positive');
    if (!p.userId || p.userId <= 0) throw new Error('userId is required and must be positive');
    if (!p.amount || p.amount <= 0) throw new Error('amount must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as WithdrawWalletPayload;
    const wallet = await walletRepository.findById(p.walletId, conn);
    if (!wallet) throw new NotFoundError('Wallet');

    const transition = planBalanceUpdate({
      type: 'withdrawal',
      direction: 'debit',
      amount: p.amount,
      currentBalance: Number(wallet.balance),
      currentVersion: wallet.aggregate_version || 1,
      isLocked: !!wallet.is_locked,
    });

    await walletRepository.persistBalanceUpdate(p.walletId, transition.newBalance, wallet.aggregate_version || 1, conn);

    if (isLowBalance(transition.newBalance)) {
      log.warn({ walletId: p.walletId, balance: transition.newBalance }, 'wallet.low_balance');
    }

    log.info({ walletId: p.walletId, userId: p.userId, amount: p.amount, version: transition.newVersion }, 'wallet.withdrawn');
    return { walletId: p.walletId, userId: p.userId, newBalance: transition.newBalance, aggregateVersion: transition.newVersion };
  },

  events: (command, result) => [{
    eventName: 'wallet.withdrawn',
    payload: {
      walletId: result.walletId,
      userId: result.userId,
      amount: (command.payload as unknown as WithdrawWalletPayload).amount,
      balance: result.newBalance,
      aggregateVersion: result.aggregateVersion,
    },
    context: {
      aggregateType: 'wallet',
      aggregateId: String(result.walletId),
      aggregateVersion: result.aggregateVersion || 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
