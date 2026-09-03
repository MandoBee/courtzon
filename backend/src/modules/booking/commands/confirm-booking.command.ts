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
  bookingType: string;
  userId: number;
  organisationId?: number | null;
  branchId?: number | null;
  resourceId?: number | null;
}

export const confirmBookingHandler: CommandHandler<Command, ConfirmBookingResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as ConfirmBookingPayload;
    if (!p.bookingId || p.bookingId <= 0) throw new Error('bookingId is required and must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as ConfirmBookingPayload;

    let booking: any;
    try {
      booking = await bookingRepository.findById(p.bookingId, conn);
    } catch (dbErr: any) {
      throw dbErr;
    }

    if (!booking) {
      throw new NotFoundError('Booking');
    }

    if (booking.booking_status === 'confirmed') {
      log.warn({ bookingId: p.bookingId }, 'booking.already_confirmed');
      return {
        bookingId: p.bookingId, bookingType: booking.booking_type, userId: booking.user_id,
        organisationId: booking.organisation_id ?? null,
        branchId: booking.branch_id ?? null,
        resourceId: booking.resource_id ?? null,
      };
    }

    let transition: any;
    try {
      transition = planTransition({
        fromStatus: booking.booking_status as BookingStatus,
        toStatus: 'confirmed',
        currentVersion: booking.aggregate_version || 1,
      });
    } catch (transErr: any) {
      throw transErr;
    }

    try {
      await bookingRepository.persistTransition(p.bookingId, 'confirmed', undefined, booking.aggregate_version || 1, conn);
    } catch (persistErr: any) {
      throw persistErr;
    }

    log.info({ bookingId: p.bookingId, version: transition.newVersion }, 'booking.confirmed');
    return {
      bookingId: p.bookingId, aggregateVersion: transition.newVersion,
      bookingType: booking.booking_type, userId: booking.user_id,
      organisationId: booking.organisation_id ?? null,
      branchId: booking.branch_id ?? null,
      resourceId: booking.resource_id ?? null,
    };
  },

  events: (command, result) => {
    return [{
      eventName: 'booking:confirmed',
      payload: {
        bookingId: result.bookingId, aggregateVersion: result.aggregateVersion,
        bookingType: result.bookingType, userId: result.userId,
        organisationId: result.organisationId ?? undefined,
        branchId: result.branchId ?? undefined,
        resourceId: result.resourceId ?? undefined,
        courtId: result.resourceId ?? undefined,
      },
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
