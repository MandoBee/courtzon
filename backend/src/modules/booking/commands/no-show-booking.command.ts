import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { planTransition, isTerminal } from '../domain/booking-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { BookingStatus } from '../domain/booking-aggregate.js';

const log = createModuleLogger('booking');

export interface NoShowBookingPayload { bookingId: number }
export interface NoShowBookingResult {
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

/**
 * No-show is its OWN booking lifecycle state (not a cancellation). The state
 * machine explicitly allows `confirmed → no_show` and `checked_in → no_show`
 * (booking-aggregate.ts). This command performs ONLY the no-show transition and
 * emits ONLY `booking:no-show` — it never emits `booking:cancelled` and never
 * routes through the CancelBooking aggregate transition, so a no-show can never
 * degrade into a cancellation state or produce a duplicate cancelled event.
 */
export const noShowBookingHandler: CommandHandler<Command, NoShowBookingResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as NoShowBookingPayload;
    if (!p.bookingId || p.bookingId <= 0) throw new Error('bookingId is required and must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as NoShowBookingPayload;
    const booking = await bookingRepository.findById(p.bookingId, conn);
    if (!booking) throw new NotFoundError('Booking');

    if (booking.booking_status === 'no_show') {
      log.warn({ bookingId: p.bookingId }, 'booking.already_no_show');
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

    if (isTerminal(booking.booking_status as BookingStatus) && booking.booking_status !== 'no_show') {
      throw new ConflictError(`Cannot mark no-show a booking in terminal state: ${booking.booking_status}`);
    }

    const transition = planTransition({
      fromStatus: booking.booking_status as BookingStatus,
      toStatus: 'no_show',
      currentVersion: booking.aggregate_version || 1,
    });

    await bookingRepository.persistTransition(p.bookingId, 'no_show', undefined, booking.aggregate_version || 1, conn);
    log.info({ bookingId: p.bookingId, version: transition.newVersion }, 'booking.no_show');
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
    eventName: 'booking:no-show',
    payload: {
      bookingId: result.bookingId,
      aggregateVersion: result.aggregateVersion,
      userId: result.userId,
      organisationId: result.organisationId,
      branchId: result.branchId,
      resourceId: result.resourceId,
      courtId: result.resourceId,
      bookingDate: result.bookingDate,
      startTime: result.startTime,
      endTime: result.endTime,
      reason: 'no_show',
    },
    context: {
      aggregateType: 'booking', aggregateId: String(result.bookingId),
      aggregateVersion: result.aggregateVersion || 1,
      correlationId: command.correlationId, causationId: command.commandId,
    },
  }],
};