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


