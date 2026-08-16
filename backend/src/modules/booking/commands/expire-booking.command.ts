import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { planTransition, canExpire } from '../domain/booking-aggregate.js';
import { systemClock } from '../../../shared/utils/clock.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { BookingStatus } from '../domain/booking-aggregate.js';

const log = createModuleLogger('booking');

export interface ExpireBookingPayload { bookingId: number }
export interface ExpireBookingResult {
  bookingId: number;
  aggregateVersion?: number;
  userId?: number;
  organisationId?: number | null;
  branchId?: number | null;
  resourceId?: number | null;
  bookingDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export const expireBookingHandler: CommandHandler<Command, ExpireBookingResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as ExpireBookingPayload;
    if (!p.bookingId || p.bookingId <= 0) throw new Error('bookingId is required and must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as ExpireBookingPayload;
    const booking = await bookingRepository.findById(p.bookingId, conn);
    if (!booking) throw new NotFoundError('Booking');

    if (booking.booking_status === 'expired') {
      log.warn({ bookingId: p.bookingId }, 'booking.already_expired');
      return {
        bookingId: p.bookingId,
        userId: booking.user_id,
        organisationId: booking.organisation_id,
        branchId: booking.branch_id,
        resourceId: booking.resource_id,
        bookingDate: booking.booking_date,
        startTime: booking.start_time,
        endTime: booking.end_time,
      };
    }

    canExpire(booking, systemClock);

    const transition = planTransition({
      fromStatus: booking.booking_status as BookingStatus,
      toStatus: 'expired',
      currentVersion: booking.aggregate_version || 1,
    });

    await bookingRepository.persistTransition(p.bookingId, 'expired', undefined, booking.aggregate_version || 1, conn);
    log.info({ bookingId: p.bookingId, version: transition.newVersion }, 'booking.expired');
    return {
      bookingId: p.bookingId,
      aggregateVersion: transition.newVersion,
      userId: booking.user_id,
      organisationId: booking.organisation_id,
      branchId: booking.branch_id,
      resourceId: booking.resource_id,
      bookingDate: booking.booking_date,
      startTime: booking.start_time,
      endTime: booking.end_time,
    };
  },

  events: (command, result) => [{
    eventName: 'booking:expired',
    payload: {
      bookingId: result.bookingId,
      aggregateVersion: result.aggregateVersion,
      userId: result.userId,
      organisationId: result.organisationId,
      branchId: result.branchId,
      resourceId: result.resourceId,
      bookingDate: result.bookingDate,
      startTime: result.startTime,
      endTime: result.endTime,
    },
    context: {
      aggregateType: 'booking', aggregateId: String(result.bookingId),
      aggregateVersion: result.aggregateVersion || 1,
      correlationId: command.correlationId, causationId: command.commandId,
    },
  }],
};
