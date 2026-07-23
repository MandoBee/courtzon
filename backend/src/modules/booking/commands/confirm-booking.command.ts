import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { planTransition } from '../domain/booking-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { BookingStatus } from '../domain/booking-aggregate.js';

const log = createModuleLogger('booking');

export interface ConfirmBookingPayload { bookingId: number }

export interface ConfirmBookingResult {
  bookingId: number;
  aggregateVersion?: number;
}

export const confirmBookingHandler: CommandHandler<Command, ConfirmBookingResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as ConfirmBookingPayload;
    if (!p.bookingId || p.bookingId <= 0) throw new Error('bookingId is required and must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as ConfirmBookingPayload;
    const booking = await bookingRepository.findById(p.bookingId, conn);
    if (!booking) throw new NotFoundError('Booking');

    if (booking.booking_status === 'confirmed') {
      log.warn({ bookingId: p.bookingId }, 'booking.already_confirmed');
      return { bookingId: p.bookingId };
    }

    const transition = planTransition({
      fromStatus: booking.booking_status as BookingStatus,
      toStatus: 'confirmed',
      currentVersion: booking.aggregate_version || 1,
    });

    await bookingRepository.persistTransition(p.bookingId, 'confirmed', undefined, booking.aggregate_version || 1, conn);
    log.info({ bookingId: p.bookingId, version: transition.newVersion }, 'booking.confirmed');
    return { bookingId: p.bookingId, aggregateVersion: transition.newVersion };
  },

  events: (command, result) => [{
    eventName: 'booking.confirmed',
    payload: { bookingId: result.bookingId, aggregateVersion: result.aggregateVersion },
    context: {
      aggregateType: 'booking',
      aggregateId: String(result.bookingId),
      aggregateVersion: result.aggregateVersion || 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
