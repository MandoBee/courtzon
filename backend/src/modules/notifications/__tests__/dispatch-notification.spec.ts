import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const { notificationRepository } = await import('../infrastructure/repositories/notification.repository.js');
const { getTemplate, resolveTemplate } = await import('../application/template.service.js');
const { checkRateLimit, incrementRateLimit } = await import('../application/rate-limiter.service.js');

function makeCommand(overrides: Record<string, unknown> = {}): Command {
  return {
    commandId: 'dispatch-test-1',
    commandType: 'DispatchNotification',
    aggregateType: 'notification',
    aggregateId: '1',
    payload: {
      userId: 42, eventName: 'booking:confirmed',
      data: { bookingId: 123, userId: 42 },
      categorySlug: 'bookings',
      ...overrides,
    },
    correlationId: 'corr-1',
  };
}

describe('DispatchNotification command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates a valid command', async () => {
    await expect(dispatchNotificationHandler.validate(makeCommand())).resolves.not.toThrow();
  });

  it('rejects missing userId', async () => {
    await expect(dispatchNotificationHandler.validate(makeCommand({ userId: 0 }))).rejects.toThrow('userId is required');
  });

  it('rejects missing eventName', async () => {
    await expect(dispatchNotificationHandler.validate(makeCommand({ eventName: '' }))).rejects.toThrow('eventName is required');
  });

  it('rejects missing data', async () => {
    await expect(dispatchNotificationHandler.validate(makeCommand({ data: undefined }))).rejects.toThrow('data is required');
  });

  it('executes dispatch and creates notification', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(getTemplate).mockResolvedValue({
      id: 1, eventName: 'booking:confirmed', locale: 'en',
      categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'Booking Confirmed', bodyTemplate: 'Your booking is confirmed',
      actionKey: 'view_booking', routePattern: null, imageUrl: null, actions: null, version: 1,
    } as any);
    vi.mocked(resolveTemplate).mockReturnValue({ title: 'Booking Confirmed', body: 'Your booking is confirmed' });
    vi.mocked(notificationRepository.create).mockResolvedValue(99);

    const { isOnline } = await import('../application/presence.service.js');
    const { queueService } = await import('../../../infrastructure/queue/queue.service.js');
    vi.mocked(isOnline).mockResolvedValue(true);

    const result = await dispatchNotificationHandler.execute(makeCommand(), {} as any);

    expect(result.notificationId).toBe(99);
    expect(result.userId).toBe(42);
    expect(result.dispatched).toBe(true);
    expect(notificationRepository.create).toHaveBeenCalled();
    expect(incrementRateLimit).toHaveBeenCalledWith(42, 'bookings', 'booking:confirmed');
    expect(queueService.add).toHaveBeenCalledWith('process_notification', expect.objectContaining({ notificationId: 99 }), expect.any(Object));
  });

  it('skips dispatch when rate limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false });

    const result = await dispatchNotificationHandler.execute(makeCommand(), {} as any);

    expect(result.dispatched).toBe(false);
    expect(notificationRepository.create).not.toHaveBeenCalled();
  });

  it('skips dispatch when no template found', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(getTemplate).mockResolvedValue(null);

    const result = await dispatchNotificationHandler.execute(makeCommand(), {} as any);

    expect(result.dispatched).toBe(false);
    expect(notificationRepository.create).not.toHaveBeenCalled();
  });

  it('emits notification.dispatched event on success', () => {
    const command = makeCommand();
    const result = { notificationId: 99, userId: 42, dispatched: true };
    const events = dispatchNotificationHandler.events!(command, result);

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('notification.dispatched');
    expect(events[0].payload).toMatchObject({
      notificationId: 99, userId: 42, eventName: 'booking:confirmed', dispatched: true,
    });
    expect(events[0].context).toMatchObject({
      aggregateType: 'notification', correlationId: 'corr-1',
    });
  });
});
