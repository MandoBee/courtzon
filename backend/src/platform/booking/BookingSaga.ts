import type mysql from 'mysql2/promise';
import { bookingAggregate, type ConfirmContext } from './BookingAggregate.js';
import { getPool } from '../../database/mysql.js';
import { eventBus } from '../../shared/event-bus/index.js';
import type { BookingStatus } from '../shared/booking-types.js';
import type { IBookingRepository } from '../contracts/IBookingRepository.js';

let _bookingRepo: IBookingRepository | null = null;

export function initBooking(repo: IBookingRepository): void {
  _bookingRepo = repo;
}

function getRepo(): IBookingRepository {
  if (!_bookingRepo) throw new Error('BookingSaga not initialized. Call initBooking() first.');
  return _bookingRepo;
}

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

async function releaseBookingSlots(bookingId: number, conn?: mysql.PoolConnection): Promise<void> {
  const pool = conn || getPool();
  await pool.execute(
    'UPDATE booking_slots SET is_available = TRUE WHERE booking_id = ? AND is_available = FALSE',
    [bookingId],
  );
}

export async function confirmBooking(
  bookingId: number,
  context: ConfirmContext,
  conn?: mysql.PoolConnection,
): Promise<BookingEventPayload> {
  const repo = getRepo();
  const booking = await repo.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.confirm(booking.booking_status as BookingStatus, context);

  const paymentStatus = context.paymentMethod === 'cash' || context.paymentMethod === 'cod'
    ? 'pending' : 'paid';
  await repo.persistTransition(bookingId, nextStatus, paymentStatus, undefined, conn);

  const pool = conn || getPool();
  await pool.execute(
    'UPDATE booking_slots SET is_available = FALSE WHERE booking_id = ? AND is_available = TRUE',
    [bookingId],
  );

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
  const repo = getRepo();
  const booking = await repo.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.cancel(booking.booking_status as BookingStatus);

  const newPaymentStatus = paymentStatusOverride ?? (feeAmount > 0 ? 'refunded' : booking.payment_status);

  const db = conn || getPool();
  await db.execute(
    `INSERT INTO booking_cancellations (booking_id, cancelled_by, reason, refund_amount)
     VALUES (?, ?, ?, ?)`,
    [bookingId, actorId, reason, feeAmount],
  );
  await repo.persistTransition(bookingId, 'cancelled', newPaymentStatus, undefined, conn);

  await releaseBookingSlots(bookingId, conn);

  const payload = buildPayload(booking, nextStatus);
  emit('booking:cancelled', payload);
  return payload;
}

export async function expireBooking(
  bookingId: number,
  conn?: mysql.PoolConnection,
): Promise<BookingEventPayload> {
  const repo = getRepo();
  const booking = await repo.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.expire(booking.booking_status as BookingStatus);

  await repo.persistTransition(bookingId, nextStatus, 'expired', undefined, conn);

  await releaseBookingSlots(bookingId, conn);

  const payload = buildPayload(booking, nextStatus);
  emit('booking:expired', payload);
  return payload;
}

export async function checkInBooking(
  bookingId: number,
  conn?: mysql.PoolConnection,
): Promise<BookingEventPayload> {
  const repo = getRepo();
  const booking = await repo.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.checkIn(booking.booking_status as BookingStatus);

  await repo.persistTransition(bookingId, 'checked_in', undefined, undefined, conn);

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
  const repo = getRepo();
  const booking = await repo.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.noShow(booking.booking_status as BookingStatus);

  const effectivePaymentStatus = paymentStatusOverride
    ?? (booking.payment_status === 'paid' ? 'penalty' : booking.payment_status);

  const db = conn || getPool();
  await db.execute(
    `INSERT INTO booking_cancellations (booking_id, cancelled_by, reason, refund_amount)
     VALUES (?, ?, ?, ?)`,
    [bookingId, actorId, reason, feeAmount],
  );
  await repo.persistTransition(bookingId, 'no_show', effectivePaymentStatus, undefined, conn);

  await releaseBookingSlots(bookingId, conn);

  const payload = buildPayload(booking, nextStatus);
  emit('booking:no-show', payload);
  return payload;
}

export async function completeBooking(
  bookingId: number,
  paymentStatus?: string,
  conn?: mysql.PoolConnection,
): Promise<BookingEventPayload> {
  const repo = getRepo();
  const booking = await repo.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.complete(booking.booking_status as BookingStatus);

  if (paymentStatus) {
    await repo.persistTransition(bookingId, nextStatus, paymentStatus, undefined, conn);
  } else {
    await repo.persistTransition(bookingId, nextStatus, undefined, undefined, conn);
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
  const repo = getRepo();
  const booking = await repo.findById(bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const nextStatus = bookingAggregate.cancelWithFee(booking.booking_status as BookingStatus);

  const newPaymentStatus = feeAmount > 0 ? 'partially_refunded' : 'penalty';

  const db = conn || getPool();
  await db.execute(
    `INSERT INTO booking_cancellations (booking_id, cancelled_by, reason, refund_amount)
     VALUES (?, ?, ?, ?)`,
    [bookingId, actorId, reason, feeAmount],
  );
  await repo.persistTransition(bookingId, 'cancelled_with_fee', newPaymentStatus, undefined, conn);

  await releaseBookingSlots(bookingId, conn);

  const payload = buildPayload(booking, nextStatus);
  emit('booking:cancelled', payload);
  return payload;
}

export async function updateBookingPaymentStatus(
  bookingId: number,
  paymentStatus: string,
  conn?: mysql.PoolConnection,
): Promise<void> {
  await getRepo().persistPaymentStatus(bookingId, paymentStatus, conn);
}
