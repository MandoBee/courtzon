import { describe, it, expect } from 'vitest';
import { changeOrderStatusHandler } from './change-order-status.command.js';
import type { Command } from '../../../shared/command/command-base.js';

describe('Event contract: order status change', () => {
  it('emits correct event name for confirmed', () => {
    const events = changeOrderStatusHandler.events!(
      { commandId: 'ec1', commandType: 'ChangeOrderStatus', aggregateType: 'order', aggregateId: '1', payload: { orderId: 1, toStatus: 'confirmed', role: 'admin' } } as Command,
      { orderId: 1, status: 'confirmed' },
    );
    expect(events[0].eventName).toBe('order.confirmed');
  });

  it('emits correct event name for shipped', () => {
    const events = changeOrderStatusHandler.events!(
      { commandId: 'ec2', commandType: 'ChangeOrderStatus', aggregateType: 'order', aggregateId: '1', payload: { orderId: 1, toStatus: 'shipped', role: 'seller' } } as Command,
      { orderId: 1, status: 'shipped' },
    );
    expect(events[0].eventName).toBe('order.shipped');
  });

  it('contains required payload fields', () => {
    const events = changeOrderStatusHandler.events!(
      { commandId: 'ec3', commandType: 'ChangeOrderStatus', aggregateType: 'order', aggregateId: '1', payload: { orderId: 1, toStatus: 'delivered', role: 'buyer' } } as Command,
      { orderId: 1, status: 'delivered' },
    );
    expect(events[0].payload).toHaveProperty('orderId', 1);
    expect(events[0].payload).toHaveProperty('status', 'delivered');
    expect(events[0].payload).toHaveProperty('role', 'buyer');
  });

  it('contains required context fields', () => {
    const events = changeOrderStatusHandler.events!(
      { commandId: 'ec4', commandType: 'ChangeOrderStatus', aggregateType: 'order', aggregateId: '1', payload: { orderId: 1, toStatus: 'cancelled', role: 'buyer' }, correlationId: 'corr-1' } as Command,
      { orderId: 1, status: 'cancelled' },
    );
    expect(events[0].context).toHaveProperty('aggregateType', 'order');
    expect(events[0].context).toHaveProperty('aggregateId', '1');
    expect(events[0].context).toHaveProperty('correlationId', 'corr-1');
  });
});
