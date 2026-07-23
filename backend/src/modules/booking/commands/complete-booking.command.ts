import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { planTransition, isTerminal } from '../domain/booking-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { BookingStatus } from '../domain/booking-aggregate.js';

const log = createModuleLogger('booking');

export interface CompleteBookingPayload { bookingId: number }
export interface CompleteBookingResult { bookingId: number; aggregateVersion?: number }

export const completeBookingHandler: CommandHandler<Command, CompleteBookingResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as CompleteBookingPayload;
    if (!p.bookingId || p.bookingId <= 0) throw new Error('bookingId is required and must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as CompleteBookingPayload;
    const booking = await bookingRepository.findById(p.bookingId, conn);
    if (!booking) throw new NotFoundError('Booking');

    if (booking.booking_status === 'completed') {
      log.warn({ bookingId: p.bookingId }, 'booking.already_completed');
      return { bookingId: p.bookingId };
    }

    if (isTerminal(booking.booking_status as BookingStatus) && booking.booking_status !== 'completed') {
      throw new Error(`Cannot complete a booking in terminal state: ${booking.booking_status}`);
    }

    const transition = planTransition({
      fromStatus: booking.booking_status as BookingStatus,
      toStatus: 'completed',
      currentVersion: booking.aggregate_version || 1,
    });

    await bookingRepository.persistTransition(p.bookingId, 'completed', undefined, booking.aggregate_version || 1, conn);
    log.info({ bookingId: p.bookingId, version: transition.newVersion }, 'booking.completed');
    return { bookingId: p.bookingId, aggregateVersion: transition.newVersion };
  },

  events: (command, result) => [{
    eventName: 'booking.completed',
    payload: { bookingId: result.bookingId, aggregateVersion: result.aggregateVersion },
    context: {
      aggregateType: 'booking', aggregateId: String(result.bookingId),
      aggregateVersion: result.aggregateVersion || 1,
      correlationId: command.correlationId, causationId: command.commandId,
    },
  }],
};
