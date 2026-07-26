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
    const _cmdStart = Date.now();
    const p = command.payload as unknown as ConfirmBookingPayload;
    console.log(`[TRACE][ConfirmBookingCmd][+0ms][${new Date(_cmdStart).toISOString()}] [booking:${p.bookingId}] EXECUTE START commandId=${command.commandId}`);
    const booking = await bookingRepository.findById(p.bookingId, conn);
    console.log(`[TRACE][ConfirmBookingCmd][+${Date.now() - _cmdStart}ms][${new Date(Date.now()).toISOString()}] [booking:${p.bookingId}] findById done current_status=${booking?.booking_status}`);
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
    console.log(`[TRACE][ConfirmBookingCmd][+${Date.now() - _cmdStart}ms][${new Date(Date.now()).toISOString()}] [booking:${p.bookingId}] persistTransition DONE → confirmed`);
    log.info({ bookingId: p.bookingId, version: transition.newVersion }, 'booking.confirmed');
    return { bookingId: p.bookingId, aggregateVersion: transition.newVersion };
  },

  events: (command, result) => {
    console.log(`[TRACE][ConfirmBookingCmd][+0ms][${new Date().toISOString()}] [booking:${result.bookingId}] EVENTS CALLED — will emit booking:confirmed`);
    return [{
      eventName: 'booking:confirmed',
      payload: { bookingId: result.bookingId, aggregateVersion: result.aggregateVersion },
      context: {
        aggregateType: 'booking',
        aggregateId: String(result.bookingId),
        aggregateVersion: result.aggregateVersion || 1,
        correlationId: command.correlationId,
        causationId: command.commandId,
      },
    }];
  },
};
