import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { planTransition, isTerminal } from '../domain/booking-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { BookingStatus } from '../domain/booking-aggregate.js';

const log = createModuleLogger('booking');

export interface CancelBookingPayload { bookingId: number; reason?: string }
export interface CancelBookingResult { bookingId: number; aggregateVersion?: number }

export const cancelBookingHandler: CommandHandler<Command, CancelBookingResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as CancelBookingPayload;
    if (!p.bookingId || p.bookingId <= 0) throw new Error('bookingId is required and must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as CancelBookingPayload;
    const booking = await bookingRepository.findById(p.bookingId, conn);
    if (!booking) throw new NotFoundError('Booking');

    if (isTerminal(booking.booking_status as BookingStatus)) {
      throw new Error(`Booking is already in terminal state: ${booking.booking_status}`);
    }

    const transition = planTransition({
      fromStatus: booking.booking_status as BookingStatus,
      toStatus: 'cancelled',
      currentVersion: booking.aggregate_version || 1,
    });

    await bookingRepository.persistTransition(p.bookingId, 'cancelled', undefined, booking.aggregate_version || 1, conn);
    log.info({ bookingId: p.bookingId, version: transition.newVersion }, 'booking.cancelled');
    return { bookingId: p.bookingId, aggregateVersion: transition.newVersion };
  },

  events: (command, result) => {
    const p = command.payload as unknown as CancelBookingPayload;
    return [{
      eventName: 'booking.cancelled',
      payload: { bookingId: result.bookingId, reason: p.reason || null, aggregateVersion: result.aggregateVersion },
      context: {
        aggregateType: 'booking', aggregateId: String(result.bookingId),
        aggregateVersion: result.aggregateVersion || 1,
        correlationId: command.correlationId, causationId: command.commandId,
      },
    }];
  },
};
