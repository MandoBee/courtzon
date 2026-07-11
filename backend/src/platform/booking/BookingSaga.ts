import type mysql from 'mysql2/promise';
import { bookingAggregate, type ConfirmContext } from './BookingAggregate.js';
import { bookingRepository } from '../../modules/booking/infrastructure/repositories/booking.repository.js';
import { eventBus } from '../../shared/event-bus/index.js';
import type { BookingStatus } from '../shared/booking-types.js';

export interface BookingEventPayload {
  bookingId: number;
  userId: number;
  organisationId: number | null;
  branchId: number | null;
  courtId: number;
  bookingType?: string;
  status: string;
  timestamp: string;
}

interface BookingRecord {
  id: number;
  user_id: number;
  organisation_id: number | null;
  branch_id: number | null;
  resource_id: number;
  booking_status: string;
  payment_status: string;
  payment_method: string | null;
  booking_type?: string;
}

function buildPayload(booking: BookingRecord, status: BookingStatus): BookingEventPayload {
  return {
    bookingId: booking.id,
    userId: booking.user_id,
    organisationId: booking.organisation_id ?? null,
    branchId: booking.branch_id ?? null,
    courtId: booking.resource_id,
    bookingType: booking.booking_type,
    status,
    timestamp: new Date().toISOString(),
  };
}

function emit(eventName: string, payload: BookingEventPayload): void {
  eventBus.emit(eventName as any, payload);
}

export async function confirmBooking(
  bookingId: number,
  context: ConfirmContext,
  conn?: mysql.PoolConnection,
): Promise<BookingEventPayload> {
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.confirm(booking.booking_status, context);

  const paymentStatus = context.paymentMethod === 'cash' || context.paymentMethod === 'cod'
    ? 'pending' : 'paid';
  await bookingRepository.updateBookingStatus(bookingId, nextStatus, paymentStatus, conn);

  const payload = buildPayload(booking, nextStatus);
  emit('booking:confirmed', payload);
  return payload;
}

export async function cancelBooking(
  bookingId: number,
  actorId: number,
  reason: string,
  feeAmount: number = 0,
  conn?: mysql.PoolConnection,
  paymentStatusOverride?: string,
): Promise<BookingEventPayload> {
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.cancel(booking.booking_status);

  const newPaymentStatus = paymentStatusOverride ?? (feeAmount > 0 ? 'refunded' : booking.payment_status);
  await bookingRepository.cancelWithRefund(bookingId, actorId, reason, feeAmount, newPaymentStatus, conn);

  const payload = buildPayload(booking, nextStatus);
  emit('booking:cancelled', payload);
  return payload;
}

export async function expireBooking(
  bookingId: number,
  conn?: mysql.PoolConnection,
): Promise<BookingEventPayload> {
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.expire(booking.booking_status);

  await bookingRepository.updateBookingStatus(bookingId, nextStatus, 'expired', conn);

  const payload = buildPayload(booking, nextStatus);
  emit('booking:expired', payload);
  return payload;
}

export async function checkInBooking(
  bookingId: number,
  conn?: mysql.PoolConnection,
): Promise<BookingEventPayload> {
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.checkIn(booking.booking_status);

  await bookingRepository.checkIn(bookingId, conn);

  const payload = buildPayload(booking, nextStatus);
  emit('booking:check-in', payload);
  return payload;
}

export async function noShowBooking(
  bookingId: number,
  actorId: number,
  reason: string,
  conn?: mysql.PoolConnection,
  paymentStatusOverride?: string,
  feeAmount: number = 0,
): Promise<BookingEventPayload> {
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.noShow(booking.booking_status);

  if (paymentStatusOverride) {
    await bookingRepository.markNoShowWithRefund(bookingId, actorId, reason, feeAmount, paymentStatusOverride, conn);
  } else if (booking.payment_status === 'paid') {
    await bookingRepository.markNoShowWithRefund(bookingId, actorId, reason, 0, 'penalty', conn);
  } else {
    await bookingRepository.markNoShow(bookingId, conn);
  }

  const payload = buildPayload(booking, nextStatus);
  emit('booking:no-show', payload);
  return payload;
}

export async function completeBooking(
  bookingId: number,
  paymentStatus?: string,
  conn?: mysql.PoolConnection,
): Promise<BookingEventPayload> {
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.complete(booking.booking_status);

  if (paymentStatus) {
    await bookingRepository.updateBookingStatus(bookingId, nextStatus, paymentStatus, conn);
  } else {
    await bookingRepository.updateStatus(bookingId, nextStatus, conn);
  }

  const payload = buildPayload(booking, nextStatus);
  emit('booking:completed', payload);
  return payload;
}

export async function cancelWithFeeBooking(
  bookingId: number,
  actorId: number,
  reason: string,
  feeAmount: number,
  conn?: mysql.PoolConnection,
): Promise<BookingEventPayload> {
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.cancelWithFee(booking.booking_status);

  const newPaymentStatus = feeAmount > 0 ? 'partially_refunded' : 'penalty';
  await bookingRepository.cancelWithRefund(bookingId, actorId, reason, feeAmount, newPaymentStatus, conn);

  const payload = buildPayload(booking, nextStatus);
  emit('booking:cancelled', payload);
  return payload;
}
