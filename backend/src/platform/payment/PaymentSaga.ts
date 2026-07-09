import type mysql from 'mysql2/promise';
import { paymentAggregate, type PaymentContext } from './PaymentAggregate.js';
import { paymentRepository } from '../../modules/payment/infrastructure/repositories/payment.repository.js';
import { eventBus } from '../../shared/event-bus/index.js';
import type { PaymentStatus } from '../shared/payment-types.js';

export interface PaymentEventPayload {
  paymentId: number;
  transactionId: number;
  bookingId: number | null;
  userId: number;
  organisationId: number | null;
  branchId: number | null;
  amount: number;
  paymentMethod: string;
  status: string;
  gatewayReference: string | null;
  timestamp: string;
}

function buildPayload(r: any, status: PaymentStatus): PaymentEventPayload {
  return {
    paymentId: r.id,
    transactionId: r.id,
    bookingId: r.booking_id ?? null,
    userId: r.user_id,
    organisationId: null,
    branchId: null,
    amount: r.amount,
    paymentMethod: r.payment_method,
    status,
    gatewayReference: r.gateway_reference ?? null,
    timestamp: new Date().toISOString(),
  };
}

function emit(eventName: string, payload: PaymentEventPayload): void {
  eventBus.emit(eventName as any, payload);
}

async function loadPayment(paymentId: number): Promise<any> {
  const record = await paymentRepository.findById(paymentId);
  if (!record) throw new Error(`Payment ${paymentId} not found`);
  return record;
}

async function persistAndEmit(
  paymentId: number,
  status: string,
  eventName: string,
  updateFn: (c?: mysql.PoolConnection) => Promise<any>,
  conn?: mysql.PoolConnection,
): Promise<PaymentEventPayload> {
  await updateFn(conn);
  const updated = await paymentRepository.findById(paymentId);
  const payload = buildPayload(updated, status as PaymentStatus);
  emit(eventName, payload);
  return payload;
}

export async function createPayment(
  data: {
    userId: number; amount: number; paymentMethod: string;
    gatewayProvider: string; gatewayReference?: string;
    bookingId?: number; referenceType?: string;
  },
  _conn?: mysql.PoolConnection,
): Promise<PaymentEventPayload> {
  const result = await paymentRepository.create({
    userId: data.userId, amount: data.amount,
    paymentMethod: data.paymentMethod, gatewayProvider: data.gatewayProvider,
    gatewayReference: data.gatewayReference || '',
    status: 'created', bookingId: data.bookingId, referenceType: data.referenceType,
  });

  const record = await paymentRepository.findById(result.id);
  const payload = buildPayload(record, 'created');
  emit('payment:created', payload);
  return payload;
}

export async function startProcessing(
  paymentId: number,
  gatewayReference?: string,
  conn?: mysql.PoolConnection,
): Promise<PaymentEventPayload> {
  const record = await loadPayment(paymentId);
  paymentAggregate.startProcessing(record.payment_status);
  return persistAndEmit(paymentId, 'processing', 'payment:processing',
    (c) => paymentRepository.updateStatus(paymentId, 'processing', gatewayReference, c), conn);
}

/**
 * Emit payment:completed for a payment already in 'paid' status.
 * Used by wallet path where payment is created as 'paid' directly.
 * Skips aggregate validation since no transition occurs.
 */
export async function emitPaymentCompleted(
  paymentId: number,
): Promise<PaymentEventPayload> {
  const record = await paymentRepository.findById(paymentId);
  if (!record) throw new Error(`Payment ${paymentId} not found`);
  const payload = buildPayload(record, 'paid');
  emit('payment:completed', payload);
  return payload;
}

export async function confirmPayment(
  paymentId: number,
  context: PaymentContext,
  conn?: mysql.PoolConnection,
): Promise<PaymentEventPayload> {
  const record = await loadPayment(paymentId);
  paymentAggregate.markPaid(record.payment_status, context);
  return persistAndEmit(paymentId, 'paid', 'payment:completed',
    (c) => paymentRepository.updateStatus(paymentId, 'paid', context.gatewayReference, c), conn);
}

export async function failPayment(
  paymentId: number,
  conn?: mysql.PoolConnection,
): Promise<PaymentEventPayload> {
  const record = await loadPayment(paymentId);
  paymentAggregate.markFailed(record.payment_status);
  return persistAndEmit(paymentId, 'failed', 'payment:failed',
    (c) => paymentRepository.updateStatus(paymentId, 'failed', undefined, c), conn);
}

export async function cancelPayment(
  paymentId: number,
  conn?: mysql.PoolConnection,
): Promise<PaymentEventPayload> {
  const record = await loadPayment(paymentId);
  paymentAggregate.markCancelled(record.payment_status);
  return persistAndEmit(paymentId, 'cancelled', 'payment:cancelled',
    (c) => paymentRepository.updateStatus(paymentId, 'cancelled', undefined, c), conn);
}

export async function expirePayment(
  paymentId: number,
  conn?: mysql.PoolConnection,
): Promise<PaymentEventPayload> {
  const record = await loadPayment(paymentId);
  paymentAggregate.markExpired(record.payment_status);
  return persistAndEmit(paymentId, 'expired', 'payment:expired', () =>
    paymentRepository.expirePayment(paymentId, conn));
}

export async function refundPayment(
  paymentId: number,
  refundAmount: number,
  conn?: mysql.PoolConnection,
): Promise<PaymentEventPayload> {
  const record = await loadPayment(paymentId);
  paymentAggregate.refund(record.payment_status, { refundAmount });
  return persistAndEmit(paymentId, 'refunded', 'payment:refunded',
    (c) => paymentRepository.updateStatus(paymentId, 'refunded', undefined, c), conn);
}

export async function partialRefundPayment(
  paymentId: number,
  refundAmount: number,
  totalPaid: number,
  conn?: mysql.PoolConnection,
): Promise<PaymentEventPayload> {
  const record = await loadPayment(paymentId);
  paymentAggregate.partialRefund(record.payment_status, { refundAmount, totalPaid });
  return persistAndEmit(paymentId, 'refunded', 'payment:refunded',
    (c) => paymentRepository.updateStatus(paymentId, 'refunded', undefined, c), conn);
}
