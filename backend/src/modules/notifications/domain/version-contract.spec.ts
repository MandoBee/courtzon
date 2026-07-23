import { describe, it, expect, vi } from 'vitest';
import { categorizeEvent, shouldDispatch } from '../domain/notification-aggregate.js';
import { dispatchNotificationHandler } from '../commands/dispatch-notification.command.js';
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

describe('Notification Version Contract', () => {
  describe('categorization stability', () => {
    it('booking events always map to bookings', () => {
      expect(categorizeEvent('booking:created')).toBe('bookings');
      expect(categorizeEvent('booking:confirmed')).toBe('bookings');
      expect(categorizeEvent('booking:cancelled')).toBe('bookings');
    });

    it('payment/wallet events always map to payments', () => {
      expect(categorizeEvent('payment:completed')).toBe('payments');
      expect(categorizeEvent('wallet:deposit')).toBe('payments');
    });
  });

  describe('dispatch decision is deterministic', () => {
    it('shouldDispatch returns true when allowed', () => {
      expect(shouldDispatch({ allowed: true })).toBe(true);
    });

    it('shouldDispatch returns false when not allowed', () => {
      expect(shouldDispatch({ allowed: false })).toBe(false);
    });
  });

  describe('event structure is stable', () => {
    it('emitted event has consistent shape', () => {
      const events = dispatchNotificationHandler.events!(
        { commandId: 'v-test-1', commandType: 'DispatchNotification', aggregateType: 'notification', aggregateId: '42', payload: { userId: 42, eventName: 'booking:confirmed', data: {} } } as Command,
        { notificationId: 1, userId: 42, dispatched: true },
      );
      expect(events[0].eventName).toBe('notification.dispatched');
      expect(events[0].payload).toHaveProperty('notificationId');
      expect(events[0].payload).toHaveProperty('userId');
      expect(events[0].payload).toHaveProperty('eventName');
      expect(events[0].payload).toHaveProperty('dispatched');
      expect(events[0].context).toHaveProperty('aggregateType', 'notification');
    });
  });
});
