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
    const _trace = (label: string, extra?: string) => {
      const now = Date.now();
      console.log(`[TRACE][ConfirmBookingCmd][+${now - _cmdStart}ms][${new Date(now).toISOString()}] [booking:${p.bookingId}] ${label}${extra ? ' ' + extra : ''}`);
    };

    _trace('EXECUTE START', `commandId=${command.commandId}`);

    _trace('LOADING BOOKING', `bookingId=${p.bookingId}`);
    let booking: any;
    try {
      booking = await bookingRepository.findById(p.bookingId, conn);
    } catch (dbErr: any) {
      _trace('DB ERROR on findById', `error=${dbErr?.message}`);
      console.log(`[TRACE][ConfirmBookingCmd][+${Date.now() - _cmdStart}ms][${new Date().toISOString()}] [booking:${p.bookingId}] DB_STACK: ${dbErr?.stack}`);
      throw dbErr;
    }
    _trace('BOOKING LOADED', `found=${!!booking} status=${booking?.booking_status} aggregate_version=${booking?.aggregate_version}`);

    if (!booking) {
      _trace('THROW NotFoundError', `bookingId=${p.bookingId} — booking does not exist in DB`);
      throw new NotFoundError('Booking');
    }

    if (booking.booking_status === 'confirmed') {
      _trace('ALREADY CONFIRMED — returning early', `bookingId=${p.bookingId} status=confirmed`);
      log.warn({ bookingId: p.bookingId }, 'booking.already_confirmed');
      return { bookingId: p.bookingId };
    }

    _trace('BEFORE planTransition', `from=${booking.booking_status} to=confirmed version=${booking.aggregate_version || 1}`);
    let transition: any;
    try {
      transition = planTransition({
        fromStatus: booking.booking_status as BookingStatus,
        toStatus: 'confirmed',
        currentVersion: booking.aggregate_version || 1,
      });
    } catch (transErr: any) {
      _trace('planTransition THREW', `error=${transErr?.message}`);
      console.log(`[TRACE][ConfirmBookingCmd][+${Date.now() - _cmdStart}ms][${new Date().toISOString()}] [booking:${p.bookingId}] TRANSITION_STACK: ${transErr?.stack}`);
      throw transErr;
    }
    _trace('AFTER planTransition', `newVersion=${transition.newVersion} valid=true`);

    _trace('BEFORE persistTransition', `bookingId=${p.bookingId} newStatus=confirmed currentVersion=${booking.aggregate_version || 1}`);
    try {
      await bookingRepository.persistTransition(p.bookingId, 'confirmed', undefined, booking.aggregate_version || 1, conn);
    } catch (persistErr: any) {
      _trace('persistTransition THREW', `error=${persistErr?.message}`);
      console.log(`[TRACE][ConfirmBookingCmd][+${Date.now() - _cmdStart}ms][${new Date().toISOString()}] [booking:${p.bookingId}] PERSIST_STACK: ${persistErr?.stack}`);
      throw persistErr;
    }
    _trace('AFTER persistTransition', `bookingId=${p.bookingId} status=confirmed`);

    _trace('EXECUTE RETURNING', `bookingId=${p.bookingId} aggregateVersion=${transition.newVersion}`);
    log.info({ bookingId: p.bookingId, version: transition.newVersion }, 'booking.confirmed');
    return { bookingId: p.bookingId, aggregateVersion: transition.newVersion };
  },

  events: (command, result) => {
    const _evStart = Date.now();
    console.log(`[TRACE][ConfirmBookingCmd][+0ms][${new Date().toISOString()}] [booking:${result.bookingId}] EVENTS CALLED — will emit booking:confirmed aggregateVersion=${result.aggregateVersion}`);
    const events = [{
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
    console.log(`[TRACE][ConfirmBookingCmd][+${Date.now() - _evStart}ms][${new Date().toISOString()}] [booking:${result.bookingId}] EVENTS RETURNING — eventName=booking:confirmed`);
    return events;
  },
};
