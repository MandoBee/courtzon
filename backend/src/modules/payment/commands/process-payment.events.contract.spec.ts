import { describe, it, expect, vi } from 'vitest';
import { processPaymentHandler } from './process-payment.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

describe('Event contract: payment.processed', () => {
  it('emits correct event name', () => {
    const e = processPaymentHandler.events!(
      { commandId: 'ec1', commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '42', payload: { paymentId: 42 }, correlationId: 'corr-001' } as Command,
      { paymentId: 42, aggregateVersion: 2 },
    );
    expect(e[0].eventName).toBe('payment.processed');
  });

  it('contains all required fields', () => {
    const e = processPaymentHandler.events!(
      { commandId: 'ec2', commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '42', payload: { paymentId: 42 } } as Command,
      { paymentId: 42, aggregateVersion: 2 },
    );
    expect(e[0].payload.paymentId).toBe(42);
    expect(e[0].payload.aggregateVersion).toBe(2);
    expect(e[0].context.aggregateType).toBe('payment');
    expect(e[0].context.aggregateVersion).toBe(2);
  });
});
