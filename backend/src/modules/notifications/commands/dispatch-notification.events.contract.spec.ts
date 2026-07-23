import { describe, it, expect, vi } from 'vitest';
import { dispatchNotificationHandler } from './dispatch-notification.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/notification.repository.js', () => ({
  NotificationRepository: vi.fn(),
  notificationRepository: { create: vi.fn() },
}));

vi.mock('../application/template.service.js', () => ({
  getTemplate: vi.fn(),
  resolveTemplate: vi.fn(),
}));

vi.mock('../application/rate-limiter.service.js', () => ({
  checkRateLimit: vi.fn(),
  incrementRateLimit: vi.fn(),
}));

vi.mock('../application/digest.service.js', () => ({
  accumulateDigest: vi.fn(),
}));

vi.mock('../application/presence.service.js', () => ({
  isOnline: vi.fn(),
  queueForReconnect: vi.fn(),
}));

vi.mock('../../../infrastructure/queue/queue.service.js', () => ({
  queueService: { add: vi.fn() },
}));

describe('Event contract: notification.dispatched', () => {
  const command: Command = {
    commandId: 'contract-001',
    commandType: 'DispatchNotification',
    aggregateType: 'notification',
    aggregateId: '42',
    payload: { userId: 42, eventName: 'booking:confirmed', data: { bookingId: 123 } },
    correlationId: 'corr-001',
    causationId: 'cause-001',
    actorId: 1,
  };

  const result = { notificationId: 99, userId: 42, dispatched: true };
  const events = dispatchNotificationHandler.events!(command, result);
  const event = events[0];

  it('emits event with correct name', () => {
    expect(event.eventName).toBe('notification.dispatched');
  });

  it('contains required payload fields', () => {
    expect(event.payload).toHaveProperty('notificationId');
    expect(event.payload).toHaveProperty('userId');
    expect(event.payload).toHaveProperty('eventName');
    expect(event.payload).toHaveProperty('dispatched');
    expect(event.payload.notificationId).toBe(99);
    expect(event.payload.eventName).toBe('booking:confirmed');
  });

  it('contains required context fields', () => {
    expect(event.context).toHaveProperty('aggregateType', 'notification');
    expect(event.context).toHaveProperty('correlationId', 'corr-001');
    expect(event.context).toHaveProperty('causationId', 'contract-001');
  });

  it('maintains schema stability', () => {
    const payloadKeys = Object.keys(event.payload);
    expect(payloadKeys).toEqual(expect.arrayContaining(['notificationId', 'userId', 'eventName', 'dispatched']));
  });
});
