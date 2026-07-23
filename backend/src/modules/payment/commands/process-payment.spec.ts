import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { processPaymentHandler } from './process-payment.command.js';
import { paymentRepository } from '../infrastructure/repositories/payment.repository.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: {
    findById: vi.fn(),
    persistTransition: vi.fn(),
  },
}));

const mockConn = {} as PoolConnection;

describe('ProcessPayment command', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('validates a valid command', async () => {
    const c: Command = { commandId: 't1', commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '42', payload: { paymentId: 42 } };
    await expect(processPaymentHandler.validate(c)).resolves.toBeUndefined();
  });

  it('rejects invalid payload', async () => {
    const c: Command = { commandId: 't2', commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '1', payload: {} };
    await expect(processPaymentHandler.validate(c)).rejects.toThrow('paymentId is required');
  });

  it('processes a pending payment (v1 → v2)', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue({ id: 42, payment_status: 'pending', aggregate_version: 1 });
    vi.mocked(paymentRepository.persistTransition).mockResolvedValue();
    const c: Command = { commandId: 't3', commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '42', payload: { paymentId: 42 } };
    const r = await processPaymentHandler.execute(c, mockConn);
    expect(r.paymentId).toBe(42);
    expect(r.aggregateVersion).toBe(2);
    expect(paymentRepository.persistTransition).toHaveBeenCalledWith(42, 'paid', undefined, 1, mockConn);
  });

  it('skips if already in final state (replay safety)', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue({ id: 42, payment_status: 'paid', aggregate_version: 2 });
    const c: Command = { commandId: 't4', commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '42', payload: { paymentId: 42 } };
    const r = await processPaymentHandler.execute(c, mockConn);
    expect(r.paymentId).toBe(42);
    expect(paymentRepository.persistTransition).not.toHaveBeenCalled();
  });

  it('rejects process for already failed payment', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue({ id: 42, payment_status: 'failed', aggregate_version: 2 });
    const c: Command = { commandId: 't5', commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '42', payload: { paymentId: 42 } };
    const r = await processPaymentHandler.execute(c, mockConn);
    expect(r.paymentId).toBe(42);
    expect(paymentRepository.persistTransition).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for unknown payment', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue(null);
    const c: Command = { commandId: 't6', commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '999', payload: { paymentId: 999 } };
    await expect(processPaymentHandler.execute(c, mockConn)).rejects.toThrow('Payment not found');
  });

  it('emits payment.processed event on success', () => {
    const events = processPaymentHandler.events!(
      { commandId: 't7', commandType: 'ProcessPayment', aggregateType: 'payment', aggregateId: '42', payload: { paymentId: 42 }, correlationId: 'corr-001' } as Command,
      { paymentId: 42, aggregateVersion: 2 },
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('payment.processed');
    expect(events[0].payload.paymentId).toBe(42);
    expect(events[0].payload.aggregateVersion).toBe(2);
    expect(events[0].context.aggregateVersion).toBe(2);
  });
});

import { assertValidTransition, planTransition } from '../domain/payment-aggregate.js';

describe('ProcessPayment — aggregate version contract', () => {
  it('pending → paid: version 1 → 2', () => {
    assertValidTransition('pending', 'paid');
    const r = planTransition({ fromStatus: 'pending', toStatus: 'paid', currentVersion: 1 });
    expect(r.newVersion).toBe(2);
  });

  it('paid → paid rejected (final state)', () => {
    expect(() => assertValidTransition('paid', 'paid')).toThrow();
  });

  it('failed → paid rejected', () => {
    expect(() => assertValidTransition('failed', 'paid')).toThrow();
  });
});
