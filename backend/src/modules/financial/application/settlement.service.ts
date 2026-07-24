import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('settlement-batch');

export class FinancialSettlementService {
  async generateBatch(
    batchType: 'daily' | 'weekly' | 'monthly' | 'manual',
    periodStart: string,
    periodEnd: string,
    organisationId?: number,
  ): Promise<number> {
    const entries = await ledgerRepository.findByDateRange(periodStart, periodEnd);

    const grossAmount = entries
      .filter(e => e.side === 'credit' && e.accountType === 'platform_revenue')
      .reduce((s, e) => s + e.amount, 0);

    const discountAmount = entries
      .filter(e => e.accountType === 'discount')
      .reduce((s, e) => s + e.amount, 0);

    const commissionAmount = entries
      .filter(e => e.accountType === 'commission')
      .reduce((s, e) => s + e.amount, 0);

    const refundAmount = entries
      .filter(e => e.accountType === 'refund')
      .reduce((s, e) => s + e.amount, 0);

    const netAmount = grossAmount - discountAmount - commissionAmount - refundAmount;

    const batchId = await ledgerRepository.createSettlementBatch({
      batchType,
      periodStart,
      periodEnd,
      grossAmount,
      discountAmount,
      taxAmount: 0,
      commissionAmount,
      refundAmount,
      netAmount,
      status: 'pending',
      organisationId,
      createdAt: new Date().toISOString(),
    });

    await ledgerRepository.updateSettlementStatus(batchId, 'completed');

    eventBusV2.emit('settlement.created', {
      batchId, batchType, grossAmount, netAmount, organisationId,
    } as Record<string, unknown>, {
      aggregateType: 'settlement',
      aggregateId: String(batchId),
      aggregateVersion: 1,
    });

    log.info({ batchId, batchType, grossAmount, netAmount }, 'settlement.batch_created');
    return batchId;
  }
}

export const financialSettlementService = new FinancialSettlementService();
