import type { RefundCaseRecord, RefundCaseLineRecord } from '../domain/refund-case.aggregate.js';

/**
 * Cancellation-only contracts for the five service domains.
 *
 * The refund engine owns the financial operation; the domain owns the
 * operational cancellation. No contract here may call Paymob, credit a wallet,
 * change the original payment status, detach a gateway settlement, or reverse an
 * original journal entry.
 */
export async function cancelServiceLine(
  caseRecord: RefundCaseRecord,
  line: RefundCaseLineRecord,
): Promise<string> {
  const actor = Number(caseRecord.approved_by ?? caseRecord.requested_by);
  const reason = caseRecord.reason;

  switch (caseRecord.domain) {
    case 'booking': {
      const { bookingService } = await import('../../booking/application/booking.service.js');
      await bookingService.cancelForRefund(Number(line.source_id), actor, reason);
      return `booking:${line.source_id}`;
    }

    case 'tournament': {
      const { tournamentRefundService } = await import('../../tournaments/application/tournament-refund.service.js');
      const { tournamentRepository } = await import('../../tournaments/infrastructure/repositories/tournament.repository.js');
      const registration = await tournamentRepository.getRegistrationById(Number(line.source_id));
      if (!registration) throw new Error(`Tournament registration ${line.source_id} not found`);
      await tournamentRefundService.withdrawForRefund(
        Number(registration.tournament_id),
        Number(line.source_id),
        actor,
        reason,
      );
      return `tournament_registration:${line.source_id}`;
    }

    case 'academy': {
      const { academyEnrollmentService } = await import('../../academy/application/enrollment.service.js');
      await academyEnrollmentService.cancel(Number(line.source_id));
      return `academy_enrollment:${line.source_id}`;
    }

    case 'marketplace': {
      const { marketplaceService } = await import('../../marketplace/application/marketplace.service.js');
      await marketplaceService.cancelOrderForRefund(Number(caseRecord.source_id), actor, reason);
      return `marketplace_order:${caseRecord.source_id}`;
    }

    case 'membership': {
      const { membershipCancelRefundService } = await import('../../membership/application/membership-cancel-refund.service.js');
      await membershipCancelRefundService.cancelSubscription(
        Number(caseRecord.organisation_id),
        Number(caseRecord.source_id),
        actor,
        reason,
      );
      return `membership_subscription:${caseRecord.source_id}`;
    }

    default:
      throw new Error(`Unsupported refund domain: ${(caseRecord as any).domain}`);
  }
}
