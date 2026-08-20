import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { bookingRepository } from '../../booking/infrastructure/repositories/booking.repository.js';
import { commissionService } from './commission.service.js';
import { financialEntitlementService } from './financial-entitlement.service.js';

const log = createModuleLogger('entitlement-booking-listener');

/**
 * Creates financial entitlements when a booking is confirmed (payment collected).
 *
 * For each confirmed booking, two entitlements are created:
 *   1. ORGANIZATION_EARNING — the org's net share (gross - commission - tax)
 *   2. COURTZON_COMMISSION — the platform's commission
 *
 * Entitlements are created in PENDING status. The activate_entitlements worker
 * promotes them to AVAILABLE after any activation window (or immediately if none).
 */
export function registerEntitlementBookingListeners() {
  eventBusV2.on('booking:confirmed', async (data: any) => {
    if (!data?.bookingId) return;

    try {
      const booking = await bookingRepository.findById(data.bookingId);
      if (!booking) {
        log.error({ bookingId: data.bookingId }, 'Booking not found for entitlement creation');
        return;
      }

      // Idempotency: skip if entitlements already exist for this booking
      const existing = await financialEntitlementService.getEntitlementsBySource('booking', booking.id);
      if (existing.length > 0) {
        log.info({ bookingId: booking.id }, 'Entitlements already exist — idempotent skip');
        return;
      }

      const orgId = booking.organisation_id;
      if (!orgId) {
        log.warn({ bookingId: booking.id }, 'Booking has no organisation_id — skipping entitlements');
        return;
      }

      const totalAmount = Number(booking.total_amount || 0);
      const taxAmount = Number(booking.tax_amount || 0);
      const grossPayable = totalAmount + taxAmount;

      if (grossPayable <= 0) {
        log.warn({ bookingId: booking.id, grossPayable }, 'Booking has zero/negative gross — skipping entitlements');
        return;
      }

      // Resolve commission
      let commissionAmount = 0;
      try {
        const commResult = await commissionService.calculate(orgId, 'booking', grossPayable);
        commissionAmount = commResult.commissionAmount;
      } catch (err: any) {
        log.warn({ err, bookingId: booking.id, orgId }, 'Commission calculation failed — using zero commission');
      }

      const orgNetAmount = grossPayable - commissionAmount;

      const inputs: any[] = [];

      // Organization earning (net of commission)
      if (orgNetAmount > 0) {
        inputs.push({
          organisationId: orgId,
          branchId: booking.branch_id ?? null,
          entitlementType: 'ORGANIZATION_EARNING',
          sourceType: 'booking',
          sourceId: booking.id,
          amount: orgNetAmount,
          currency: booking.currency || 'EGP',
          description: `Booking #${booking.id} — org earning`,
          metadata: {
            bookingId: booking.id,
            userId: booking.user_id,
            grossPayable,
            taxAmount,
            commissionAmount,
            orgNetAmount,
          },
        });
      }

      // CourtZon commission
      if (commissionAmount > 0) {
        inputs.push({
          organisationId: orgId,
          branchId: booking.branch_id ?? null,
          entitlementType: 'COURTZON_COMMISSION',
          sourceType: 'booking',
          sourceId: booking.id,
          amount: commissionAmount,
          currency: booking.currency || 'EGP',
          description: `Booking #${booking.id} — CourtZon commission`,
          metadata: {
            bookingId: booking.id,
            userId: booking.user_id,
            grossPayable,
            commissionAmount,
          },
        });
      }

      if (inputs.length === 0) {
        log.info({ bookingId: booking.id }, 'No entitlements to create (zero amounts)');
        return;
      }

      const ids = await financialEntitlementService.createEntitlements(inputs);
      log.info({ bookingId: booking.id, entitlementIds: ids }, 'Entitlements created for booking');
    } catch (err) {
      log.error({ err, bookingId: data.bookingId }, 'Failed to create entitlements for booking');
    }
  });

  // Cancel entitlements on booking refund
  eventBusV2.on('booking:refunded', async (data: any) => {
    if (!data?.bookingId) return;

    try {
      const cancelled = await financialEntitlementService.cancelBySource(
        'booking',
        data.bookingId,
        `Booking #${data.bookingId} refunded — amount ${data.refundAmount}`,
      );
      if (cancelled > 0) {
        log.info({ bookingId: data.bookingId, cancelled }, 'Entitlements cancelled for refunded booking');
      }
    } catch (err) {
      log.error({ err, bookingId: data.bookingId }, 'Failed to cancel entitlements for refunded booking');
    }
  });

  log.info('Entitlement booking listeners registered');
}
