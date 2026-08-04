import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { depositWalletHandler, type DepositWalletPayload } from '../commands/deposit-wallet.command.js';
import { walletRepository } from '../infrastructure/repositories/wallet.repository.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { ledgerService } from '../../financial/application/ledger.service.js';
import { paymentRepository } from '../../payment/infrastructure/repositories/payment.repository.js';
import type { Command } from '../../../shared/command/command-base.js';

const log = createModuleLogger('wallet-payment-listener');

/**
 * Credits the wallet when a card top-up payment succeeds.
 *
 * Wallet deposits create a `payment_transactions` row (reference_type =
 * 'wallet_topup') up-front via the gateway intention flow. Paymob's Intention
 * API always returns "pending", so the credit is performed asynchronously here
 * on the canonical `payment:succeeded` event (fired by webhook / confirm / sync).
 *
 * Accounting: in addition to crediting `user_wallets.balance`, the listener
 * writes (all inside the same transaction so balance and ledger stay in sync):
 *   - `transactions` + `transaction_entries` (wallet flow double-entry)
 *   - `wallet_transactions` (user-facing history — feeds reports/dashboard/CRM)
 *   - `ledger_entries` (financial engine — feeds Finance Dashboard, Ledger
 *     Viewer, Report Center and settlement batches)
 *   - `financial_journal_entries` (canonical Cash → Wallet Liability journal)
 *
 * Idempotency: the ledger transaction is keyed by (source_type='wallet',
 * source_id=paymentId) — a duplicate event skips the credit.
 */
export function registerWalletPaymentListeners() {
  eventBusV2.on('payment:succeeded', async (data: any) => {
    if (data.referenceType !== 'wallet_topup') return;

    const paymentId = data.paymentId;
    const userId = Number(data.metadata?.userId);
    const amount = Number(data.amount);
    if (!paymentId || !userId || !amount) {
      log.error({ paymentId, userId, amount }, 'Wallet topup succeeded but missing paymentId/userId/amount');
      return;
    }

    try {
      const existing = await transactionRepository.findBySource('wallet', paymentId);
      if (existing.length > 0) {
        log.info({ paymentId }, 'Wallet topup already credited — idempotent skip');
        return;
      }

      const wallet = await walletRepository.findByUserId(userId);
      if (!wallet) {
        log.error({ userId, paymentId }, 'Wallet not found for successful topup');
        return;
      }

      const command: Command = {
        commandId: `DepositWallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commandType: 'DepositWallet',
        aggregateType: 'wallet',
        aggregateId: String(wallet.id),
        payload: { walletId: wallet.id, userId, amount, currency: wallet.currency_code } satisfies DepositWalletPayload,
        correlationId: `dep_${paymentId}`,
      };

      const result = await commandPipeline.execute(command, {
        validate: async () => depositWalletHandler.validate(command),
        execute: async (cmd, conn) => {
          const depositResult = await depositWalletHandler.execute(cmd, conn);

          // Wallet-flow double-entry ledger (transactions + transaction_entries)
          const txnId = await transactionService.createWalletTopup({
            userId,
            walletId: wallet.id,
            amount,
            sourceType: 'wallet',
            sourceId: paymentId,
            description: `Card deposit (payment #${paymentId})`,
          }, conn);

          // User-facing wallet history row — feeds financial reports, admin
          // dashboard KPIs, CRM profile and payment reconciliation.
          await walletRepository.createTransaction({
            walletId: wallet.id,
            type: 'deposit',
            amount,
            direction: 'credit',
            referenceType: 'payment',
            referenceId: paymentId,
            description: `Card deposit (payment #${paymentId})`,
          }, conn);

          // Financial engine double-entry — feeds the Finance Dashboard KPIs,
          // Ledger Viewer, Report Center and settlement batches. A top-up moves
          // customer balance (debit) against wallet liability (credit), so it is
          // never misreported as revenue.
          await ledgerService.recordTransaction(
            String(txnId),
            'wallet',
            paymentId,
            'customer_balance',
            'wallet_liability',
            amount,
            wallet.currency_code,
            `Card deposit (payment #${paymentId})`,
            conn,
          );

          // Canonical accounting journal row (Cash → Wallet Liability).
          await paymentRepository.createJournalEntry({
            entryType: 'wallet_topup',
            referenceType: 'wallet_topup',
            referenceId: paymentId,
            debitAccount: 'Cash',
            creditAccount: 'Wallet Liability',
            amount,
            description: `Card deposit (payment #${paymentId})`,
          }, conn);

          return depositResult;
        },
        events: (cmd, res) => depositWalletHandler.events!(cmd, res),
      });

      if (result.status === 'error') {
        throw new Error(`DepositWallet failed: ${result.message}`);
      }

      const newBalance = result.data!.newBalance;
      eventBusV2.emit('wallet:deposit', {
        walletId: wallet.id,
        userId,
        amount,
        balance: newBalance,
        currency: wallet.currency_code,
      });
      if (newBalance < 50) {
        eventBusV2.emit('wallet:low-balance', {
          userId,
          balance: newBalance,
          currency: wallet.currency_code,
        });
      }

      log.info({ paymentId, walletId: wallet.id, amount, newBalance }, 'Wallet credited via payment:succeeded');
    } catch (err: any) {
      log.error({ err, paymentId, userId }, 'Wallet: topup credit failed on payment succeeded');
    }
  });

  eventBusV2.on('payment:failed-event', async (data: any) => {
    if (data.referenceType !== 'wallet_topup') return;
    log.warn({ paymentId: data.paymentId, userId: data.metadata?.userId, reason: data.reason }, 'Wallet topup payment failed — no credit');
  });

  eventBusV2.on('payment:cancelled-event', async (data: any) => {
    if (data.referenceType !== 'wallet_topup') return;
    log.warn({ paymentId: data.paymentId, userId: data.metadata?.userId }, 'Wallet topup payment cancelled — no credit');
  });

  eventBusV2.on('payment:expired-event', async (data: any) => {
    if (data.referenceType !== 'wallet_topup') return;
    log.warn({ paymentId: data.paymentId, userId: data.metadata?.userId }, 'Wallet topup payment expired — no credit');
  });

  log.info('Wallet payment listeners registered');
}
