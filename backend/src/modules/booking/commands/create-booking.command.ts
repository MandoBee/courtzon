import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { generateUlid } from '../../../shared/event-bus/event-envelope.js';
import type { Command, CommandHandler, CommandResult } from '../../../shared/command/command-base.js';

const log = createModuleLogger('booking');

export interface CreateBookingPayload {
  userId: number;
  branchId: number;
  organisationId: number;
  resourceId: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  startAtUtc: string;
  endAtUtc: string;
  bookingType: string;
  paymentMethod?: string;
  notes?: string;
}

export interface CreateBookingResult {
  bookingId: number;
  publicId: string;
}

export const createBookingHandler: CommandHandler<Command, CreateBookingResult> = {

  validate: async (command) => {
    const payload = command.payload as unknown as CreateBookingPayload;
    if (!payload.branchId) throw new Error('branchId is required');
    if (!payload.resourceId) throw new Error('resourceId is required');
    if (!payload.bookingDate) throw new Error('bookingDate is required');
    if (!payload.totalAmount || payload.totalAmount <= 0) throw new Error('totalAmount must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const payload = command.payload as unknown as CreateBookingPayload;

    const bookingId = await bookingRepository.create({
      userId: payload.userId,
      branchId: payload.branchId,
      organisationId: payload.organisationId,
      resourceId: payload.resourceId,
      bookingType: payload.bookingType || 'standard',
      bookingDate: payload.bookingDate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      totalAmount: payload.totalAmount,
      startAtUtc: payload.startAtUtc,
      endAtUtc: payload.endAtUtc,
      notes: payload.notes,
      bookingStatus: 'pending',
      paymentStatus: 'pending',
      paymentMethod: payload.paymentMethod || 'wallet',
    }, conn);

    const publicId = generateUlid();

    log.info({ bookingId, commandId: command.commandId }, 'booking.created');

    return { bookingId, publicId };
  },

  events: (command, result) => [{
    eventName: 'booking.created',
    payload: {
      bookingId: result.bookingId,
      publicId: result.publicId,
      ...(command.payload as Record<string, unknown>),
    },
    context: {
      aggregateType: 'booking',
      aggregateId: String(result.bookingId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
      actorId: (command.payload as any)?.userId || undefined,
    },
  }],
};
