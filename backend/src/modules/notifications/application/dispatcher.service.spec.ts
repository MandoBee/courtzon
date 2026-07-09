import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.fn();
const queueAdd = vi.fn();
const accumulateDigest = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute }),
}));

vi.mock('../../../infrastructure/queue/queue.service.js', () => ({
  queueService: { add: queueAdd },
}));

vi.mock('./rate-limiter.service.js', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  incrementRateLimit: vi.fn(async () => undefined),
}));

vi.mock('./digest.service.js', () => ({
  accumulateDigest,
}));

vi.mock('./presence.service.js', () => ({
  isOnline: vi.fn(async () => true),
  queueForReconnect: vi.fn(async () => undefined),
}));

vi.mock('./template.service.js', () => ({
  getTemplate: vi.fn(async () => ({
    id: 10,
    eventName: 'booking:confirmed',
    locale: 'en',
    categorySlug: 'bookings',
    type: 'success',
    priority: 'high',
    titleTemplate: 'Booking Confirmed',
    bodyTemplate: 'Booking #{{bookingId}} has been confirmed.',
    actionKey: 'view_booking',
    routePattern: '/bookings/:bookingId',
    imageUrl: null,
    actions: null,
    version: 1,
  })),
  resolveTemplate: vi.fn((_template, data) => ({
    title: 'Booking Confirmed',
    body: `Booking #${data.bookingId} has been confirmed.`,
  })),
}));

describe('dispatchToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM notification_actions')) return [[{ id: 7 }]];
      if (sql.includes('INSERT INTO notifications')) return [{ insertId: 123 }];
      return [{}];
    });
  });

  it('creates notification and compatibility queue rows immediately by default', async () => {
    const { dispatchToUser } = await import('./dispatcher.service.js');

    await dispatchToUser({
      userId: 1,
      eventName: 'booking:confirmed',
      categorySlug: 'bookings',
      data: { bookingId: 55 },
      relatedEntityType: 'booking',
      relatedEntityId: '55',
      actionPayload: { bookingId: 55 },
    });

    expect(accumulateDigest).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining([1, 'success', 'Booking Confirmed']),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      'process_notification',
      expect.objectContaining({ notificationId: 123, userId: 1, eventName: 'booking:confirmed' }),
      expect.objectContaining({ priority: 1, attempts: 3 }),
    );
  });

  it('uses digest accumulation only when explicitly requested', async () => {
    accumulateDigest.mockResolvedValueOnce(true);
    const { dispatchToUser } = await import('./dispatcher.service.js');

    await dispatchToUser({
      userId: 1,
      eventName: 'booking:confirmed',
      categorySlug: 'bookings',
      data: { bookingId: 56 },
      digestable: true,
    });

    expect(accumulateDigest).toHaveBeenCalledWith(1, 'bookings', 'booking:confirmed');
    expect(execute).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.anything());
  });
});
