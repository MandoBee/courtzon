import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { createLedgerPair, validateLedgerBalance } from '../domain/ledger-aggregate.js';
import type { LedgerEntry, SourceType, AccountType } from '../domain/ledger-aggregate.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

export class LedgerService {
  async recordTransaction(
    transactionId: string,
    sourceType: SourceType,
    sourceId: number,
    debitAccount: AccountType,
    creditAccount: AccountType,
    amount: number,
    currency: string,
    description: string,
  ): Promise<LedgerEntry[]> {
    const entries = createLedgerPair(transactionId, sourceType, sourceId, debitAccount, creditAccount, amount, currency, description);

    if (!validateLedgerBalance(entries)) {
      throw new Error('Ledger entries are not balanced');
    }

    await ledgerRepository.createEntries(entries);

    eventBusV2.emit('ledger.entry.created', {
      transactionId, sourceType, sourceId, amount, currency,
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

  async getSettlements(filters?: { status?: string; from?: string; to?: string }) {
    return ledgerRepository.findSettlementBatches(filters);
  }
}

export const ledgerService = new LedgerService();
