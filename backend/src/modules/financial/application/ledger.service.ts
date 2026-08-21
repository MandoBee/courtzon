import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { createLedgerPair, createLedgerLines, validateLedgerBalance } from '../domain/ledger-aggregate.js';
import type { LedgerEntry, SourceType, AccountType, LedgerLineInput } from '../domain/ledger-aggregate.js';
import type mysql from 'mysql2/promise';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

export class LedgerService {
  /**
   * @deprecated LEGACY — do NOT use for new accounting flows.
   *
   * This creates ledger_entries via createLedgerPair() using legacy
   * `account_type` values (e.g. 'customer_balance', 'wallet_liability') with
   * `chart_account_id = NULL`, no `period_id`, and NO general_ledger projection.
   *
   * The canonical path is: AccountingEngineService → ledger_entries
   * (chart_account_id set) → general_ledger projection. Use
   * `postAccountingEvent()` / `recordAccountingTransaction()` instead.
   *
   * Currently has ZERO production callers after the legacy accounting
   * unification (wallet top-up was migrated to the canonical engine).
   */
  async recordTransaction(
    transactionId: string,
    sourceType: SourceType,
    sourceId: number,
    debitAccount: AccountType,
    creditAccount: AccountType,
    amount: number,
    currency: string,
    description: string,
    conn?: mysql.PoolConnection,
  ): Promise<LedgerEntry[]> {
    const entries = createLedgerPair(transactionId, sourceType, sourceId, debitAccount, creditAccount, amount, currency, description);

    if (!validateLedgerBalance(entries)) {
      throw new Error('Ledger entries are not balanced');
    }

    await ledgerRepository.createEntries(entries, conn);

    eventBusV2.emit('ledger.entry.created', {
      transactionId, sourceType, sourceId, amount, currency,
    } as Record<string, unknown>, {
      aggregateType: 'ledger',
      aggregateId: transactionId,
      aggregateVersion: 1,
    });

    return entries;
  }

  /**
   * Record an accounting transaction using the new concepts-based engine.
   * Accepts pre-resolved LedgerLineInputs from the AccountingEngineService.
   */
  async recordAccountingTransaction(
    transactionId: string,
    lines: LedgerLineInput[],
    conn?: mysql.PoolConnection,
  ): Promise<LedgerEntry[]> {
    const entries = createLedgerLines(lines);

    if (!validateLedgerBalance(entries)) {
      throw new Error('Ledger entries are not balanced');
    }

    await ledgerRepository.createEntries(entries, conn);

    eventBusV2.emit('ledger.entry.created', {
      transactionId,
      sourceType: lines[0]?.sourceType,
      sourceId: lines[0]?.sourceId,
      eventType: lines[0]?.eventType,
      amount: entries.reduce((s, e) => s + e.amount, 0) / 2,
      currency: lines[0]?.currency,
    } as Record<string, unknown>, {
      aggregateType: 'ledger',
      aggregateId: transactionId,
      aggregateVersion: 1,
    });

    return entries;
  }

  async getRevenue(from: string, to: string) {
    return ledgerRepository.getRevenueSummary(from, to);
  }
}

export const ledgerService = new LedgerService();
