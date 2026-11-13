import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { postAccountingEvent } from './accounting-event.listener.js';

const log = createModuleLogger('refund-accounting');

const toMajor = (cents: unknown): number => Math.round(Number(cents) || 0) / 100;

let registered = false;

/**
 * Refund Engine accounting.
 *
 * The owning organisation bears the refund cost. Both postings are org-scoped
 * (organisation_id = the owning organisation); CourtZon's own book is never
 * touched. Original payment/settlement entries are never reversed.
 *
 *   Approval: Dr 5220 Refund Expense / Cr 2101 Accounts Payable
 *   Payout:   Dr 2101 Accounts Payable / Cr 1120 Cash / Bank
 */
export function registerRefundAccountingListeners(): void {
  if (registered) return;
  registered = true;

  eventBusV2.on('refund:case-approved', async (data: any) => {
    try {
      const organisationId = Number(data?.organisationId);
      const amount = toMajor(data?.amountCents);
      if (!organisationId || amount <= 0) return;
      await postAccountingEvent(
        'refund_case_approved',
        'refund',
        Number(data.caseId),
        organisationId,
        { refund_expense: amount, refund_payable: amount },
        String(data.currency || 'EGP'),
        `Refund case ${data.publicId ?? data.caseId} approved (institution-funded)`,
        undefined,
        { refund_expense: organisationId, refund_payable: organisationId },
      );
    } catch (err) {
      log.error({ err, caseId: data?.caseId }, 'Refund approval accounting failed');
    }
  });

  eventBusV2.on('refund:payout-confirmed', async (data: any) => {
    try {
      const organisationId = Number(data?.organisationId);
      const amount = toMajor(data?.amountCents);
      if (!organisationId || amount <= 0) return;
      await postAccountingEvent(
        'refund_case_payout',
        'refund',
        Number(data.caseId),
        organisationId,
        { refund_payable: amount, cash_bank: amount },
        String(data.currency || 'EGP'),
        `Refund case ${data.publicId ?? data.caseId} payout (${data.method ?? 'payout'})`,
        undefined,
        { refund_payable: organisationId, cash_bank: organisationId },
      );
    } catch (err) {
      log.error({ err, caseId: data?.caseId }, 'Refund payout accounting failed');
    }
  });

  log.info('Refund Engine accounting listeners registered');
}
