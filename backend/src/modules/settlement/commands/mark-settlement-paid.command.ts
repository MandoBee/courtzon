import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { settlementRepository } from '../infrastructure/repositories/settlement.repository.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { planTransition } from '../domain/settlement-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { SettlementStatus, SettlementDirection } from '../domain/settlement-aggregate.js';

const log = createModuleLogger('settlement');

export interface MarkSettlementPaidPayload {
  settlementId: number;
  bankAccountId?: number | null;
  transferReference?: string | null;
}

export interface MarkSettlementPaidResult {
  settlementId: number;
  aggregateVersion: number;
  status: SettlementStatus;
  amount: number;
  direction: SettlementDirection | null;
  onlineNet: number;
  codFee: number;
  organisationId: number;
  currency: string;
}

export const markSettlementPaidHandler: CommandHandler<Command, MarkSettlementPaidResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as MarkSettlementPaidPayload;
    if (!p.settlementId || p.settlementId <= 0) throw new Error('settlementId is required and must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as MarkSettlementPaidPayload;
    const settlement = await settlementRepository.findSettlementById(p.settlementId, conn);
    if (!settlement) throw new NotFoundError('Settlement');

    // State machine: only approved → paid is a valid payment transition.
    // This also guards against paying rejected/cancelled/already-paid/terminal states.
    if (settlement.settlement_status !== 'approved') {
      throw new ConflictError(`Cannot mark paid in status "${settlement.settlement_status}"`);
    }

    const transition = planTransition({
      fromStatus: settlement.settlement_status as SettlementStatus,
      toStatus: 'paid',
      currentVersion: settlement.aggregate_version || 1,
    });

    // Persist the state transition first — this is the optimistic-lock commit
    // point. A concurrent Pay request will fail here (aggregate_version mismatch)
    // and roll back this whole transaction, including the payout below.
    await settlementRepository.persistTransition(
      p.settlementId, 'paid', settlement.aggregate_version || 1, { paid_at: new Date() }, conn,
    );

    // Optional bank-account snapshot (same transaction — rolled back on conflict).
    if (p.bankAccountId) {
      const bankAccount = await settlementRepository.getBankAccount(p.bankAccountId);
      if (bankAccount) {
        await conn.execute(
          'UPDATE settlements SET bank_account_id = ?, bank_account_snapshot = ? WHERE id = ?',
          [p.bankAccountId, JSON.stringify(bankAccount), p.settlementId],
        );
      }
    }

    const finalAmount = Number(settlement.final_amount || 0);
    const direction = settlement.settlement_direction as SettlementDirection | null;

    // Create the payout transaction + entries atomically with the state change.
    if (finalAmount > 0 && direction) {
      const txnId = await transactionRepository.createTransaction({
        type: 'payout',
        sourceType: 'settlement',
        sourceId: p.settlementId,
        totalAmount: finalAmount,
        status: 'completed',
      }, conn);

      if (direction === 'courtzon_to_org') {
        await transactionRepository.createEntries([
          { transactionId: txnId, side: 'debit', entityType: 'platform_account', entityId: 2, amount: finalAmount, description: `Settlement #${p.settlementId}: CourtZon pays org` },
          { transactionId: txnId, side: 'credit', entityType: 'branch', entityId: settlement.branch_id || 0, amount: finalAmount, organisationId: settlement.organisation_id, description: `Settlement #${p.settlementId}: Org receives from CourtZon` },
        ], conn);
      } else {
        await transactionRepository.createEntries([
          { transactionId: txnId, side: 'debit', entityType: 'branch', entityId: settlement.branch_id || 0, amount: finalAmount, organisationId: settlement.organisation_id, description: `Settlement #${p.settlementId}: Org pays CourtZon fee` },
          { transactionId: txnId, side: 'credit', entityType: 'platform_account', entityId: 2, amount: finalAmount, description: `Settlement #${p.settlementId}: CourtZon receives from org` },
        ], conn);
      }
    }

    log.info({ settlementId: p.settlementId, version: transition.newVersion }, 'settlement.marked_paid');

    return {
      settlementId: p.settlementId,
      aggregateVersion: transition.newVersion,
      status: 'paid',
      amount: finalAmount,
      direction,
      onlineNet: Number(settlement.online_net_total || 0),
      codFee: Number(settlement.cod_fee_total || 0),
      organisationId: settlement.organisation_id,
      currency: 'EGP',
    };
  },

  events: (command, result) => {
    // Money only actually moves when there is an amount and a known direction.
    // The accounting listener dedups ledger postings, and the event is only
    // emitted after the state transition was persisted (pipeline commits).
    if (!result.amount || result.amount <= 0 || !result.direction) return [];
    return [{
      eventName: 'settlement:paid',
      payload: {
        settlementId: result.settlementId,
        amount: result.amount,
        direction: result.direction,
        organisationId: result.organisationId,
        currency: result.currency,
        onlineNet: result.onlineNet,
        codFee: result.codFee,
      },
      context: {
        aggregateType: 'settlement',
        aggregateId: String(result.settlementId),
        aggregateVersion: result.aggregateVersion,
        correlationId: command.correlationId,
        causationId: command.commandId,
      },
    }];
  },
};
