import { describe, it, expect, vi } from 'vitest';
import { processPaymentHandler } from './process-payment.command.js';
import { paymentRepository } from '../infrastructure/repositories/payment.repository.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

const cmd = (id = 42): Command => ({
  commandId: 'e2-' + id,
  commandType: 'ProcessPayment',
  aggregateType: 'payment',
  aggregateId: String(id),
  payload: { paymentId: id },
  correlationId: 'corr-e2',
});

describe('Exception 2: chargeV2 emits canonical payment:succeeded (no paid-without-GL)', () => {
  it('execute returns reference metadata used by the canonical accounting events', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue({
      id: 42,
      user_id: 7,
      reference_type: 'booking',
      booking_id: 900,
      order_id: null,
      reference_id: null,
      amount: '150.00',
      payment_method: 'bank_transfer',
      currency_code: 'EGP',
      payment_status: 'pending',
      aggregate_version: 1,
    });
    vi.mocked(paymentRepository.persistTransition).mockResolvedValue();
    const r = await processPaymentHandler.execute(cmd(), {} as any);
    expect(r.referenceType).toBe('booking');
    expect(r.referenceId).toBe(900); // booking_id fallback
    expect(r.amount).toBe(150);
    expect(r.paymentMethod).toBe('bank_transfer');
    expect(r.currency).toBe('EGP');
    expect(r.userId).toBe(7);
  });

  it('emits payment:succeeded + payment:completed (canonical accounting) after paid', () => {
    const events = processPaymentHandler.events!(cmd(), {
      paymentId: 42,
      aggregateVersion: 2,
      referenceType: 'booking',
      referenceId: 900,
      amount: 150,
      paymentMethod: 'bank_transfer',
      currency: 'EGP',
      userId: 7,
    });
    const names = events.map((e) => e.eventName);
    expect(names).toContain('payment.processed');
    expect(names).toContain('payment:succeeded');
    expect(names).toContain('payment:completed');

    const succeeded = events.find((e) => e.eventName === 'payment:succeeded')!;
    expect(succeeded.payload).toMatchObject({
      paymentId: 42,
      referenceType: 'booking',
      referenceId: 900,
      amount: 150,
    });
    expect(succeeded.payload.metadata).toMatchObject({
      paymentMethod: 'bank_transfer',
      currency: 'EGP',
      userId: 7,
      gateway: 'v2_pipeline',
    });
  });

  it('does NOT emit canonical events when reference data is missing (no false postings)', () => {
    const events = processPaymentHandler.events!(cmd(), { paymentId: 42, aggregateVersion: 2 });
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('payment.processed');
  });

  it('emits exactly one payment:succeeded (idempotent single post)', () => {
    const events = processPaymentHandler.events!(cmd(), {
      paymentId: 42, aggregateVersion: 2, referenceType: 'order', referenceId: 55, amount: 10,
    });
    expect(events.filter((e) => e.eventName === 'payment:succeeded')).toHaveLength(1);
    expect(events.filter((e) => e.eventName === 'payment:completed')).toHaveLength(1);
  });

  it('uses order_id fallback when booking_id is null', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue({
      id: 43, user_id: 8, reference_type: 'order', booking_id: null, order_id: 555,
      reference_id: null, amount: '20.00', payment_method: 'online', currency_code: 'EGP',
      payment_status: 'pending', aggregate_version: 1,
    });
    vi.mocked(paymentRepository.persistTransition).mockResolvedValue();
    const r = await processPaymentHandler.execute(cmd(43), {} as any);
    expect(r.referenceId).toBe(555);
  });
});