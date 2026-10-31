import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-05 — B27: notification delivery outcomes and dead-letter persistence.
 *
 * Worker-level tests with mocked delivery repository/provider:
 *  • provider failure (`success:false`) is treated as FAILED, not success;
 *  • retryable failures do not dead-letter before exhaustion;
 *  • the terminal attempt persists exactly one dead letter and marks the delivery;
 *  • a successful delivery never dead-letters (old code did this when attempts ≥ max);
 *  • a retried job for an already-delivered notification is suppressed.
 */

const repo = vi.hoisted(() => ({
  createDelivery: vi.fn(),
  updateDeliveryStatus: vi.fn(),
  recordAnalytics: vi.fn(),
  sendToDeadLetter: vi.fn(),
  getFailedDeliveries: vi.fn(),
  retryFromDeadLetter: vi.fn(),
  getDelivery: vi.fn(),
  findDeliveredDelivery: vi.fn(),
}));
const deliver = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn());
const queueAdd = vi.hoisted(() => vi.fn());
const pool = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../infrastructure/repositories/delivery.repository.js', () => repo);
vi.mock('../infrastructure/repositories/notification.repository.js', () => ({
  notificationRepository: { create: vi.fn(async () => 1) },
}));
vi.mock('../application/template.service.js', () => ({
  getTemplate: vi.fn(async () => ({ id: 1, version: 1, type: 'info' })),
  resolveTemplate: vi.fn(() => ({ title: 'Title', body: 'Body' })),
}));
vi.mock('../application/presence.service.js', () => ({ isOnline: vi.fn(async () => false), queueForReconnect: vi.fn() }));
vi.mock('../infrastructure/providers/provider.interface.js', () => ({ deliverToChannel: deliver }));
vi.mock('../application/quiet-hours.service.js', () => ({
  isInQuietHours: vi.fn(async () => ({ inQuietHours: false })),
  shouldBypassQuietHours: vi.fn(async () => false),
}));
vi.mock('../application/audit.service.js', () => ({ recordAuditEvent: audit }));
vi.mock('../application/ab-testing.service.js', () => ({ selectVariant: vi.fn(async () => ({ templateId: null })), recordAbResult: vi.fn() }));
vi.mock('../application/feature-flags.service.js', () => ({ isFeatureEnabled: vi.fn(async () => false) }));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({ queueService: { add: queueAdd } }));

import { handleProcessNotification } from '../infrastructure/notification.worker.js';

const JOB = {
  notificationId: 11,
  userId: 5,
  channel: 'email',
  deliveryId: 0,
  templateId: 1,
  locale: 'en',
  eventName: 'booking:confirmed',
  categorySlug: 'bookings',
  title: 'Title',
  body: 'Body',
  priority: 'normal',
} as const;

beforeEach(() => {
  Object.values(repo).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset());
  deliver.mockReset();
  audit.mockReset();
  queueAdd.mockReset();

  repo.createDelivery.mockResolvedValue(101);
  repo.findDeliveredDelivery.mockResolvedValue(null);
  repo.getDelivery.mockResolvedValue({ id: 101, attempts: 1, maxRetries: 3 });
  repo.sendToDeadLetter.mockResolvedValue(900);
  deliver.mockResolvedValue({ success: true, provider: 'email' });
});

describe('notification worker — delivery outcome', () => {
  it('marks a successful delivery as delivered and never dead-letters it', async () => {
    // Even if the row reports a high attempt count, success must not dead-letter.
    repo.getDelivery.mockResolvedValue({ id: 101, attempts: 9, maxRetries: 3 });

    await handleProcessNotification({ ...JOB });

    expect(repo.updateDeliveryStatus).toHaveBeenCalledWith(101, 'delivered');
    expect(repo.sendToDeadLetter).not.toHaveBeenCalled();
  });

  it('treats a provider result with success:false as a failed delivery (throws for retry)', async () => {
    deliver.mockResolvedValue({ success: false, provider: 'email', error: 'smtp down' });

    await expect(handleProcessNotification({ ...JOB })).rejects.toThrow(/smtp down/);
    expect(repo.updateDeliveryStatus).toHaveBeenCalledWith(101, 'failed', 'smtp down');
    expect(repo.sendToDeadLetter).not.toHaveBeenCalled();
  });

  it('does not dead-letter before the retry budget is exhausted', async () => {
    deliver.mockRejectedValue(new Error('timeout'));
    repo.getDelivery.mockResolvedValue({ id: 101, attempts: 2, maxRetries: 3 });

    await expect(handleProcessNotification({ ...JOB })).rejects.toThrow(/timeout/);
    expect(repo.sendToDeadLetter).not.toHaveBeenCalled();
  });

  it('persists exactly one dead letter on the terminal attempt and marks the delivery', async () => {
    deliver.mockRejectedValue(new Error('permanent failure'));
    repo.getDelivery.mockResolvedValue({ id: 101, attempts: 3, maxRetries: 3 });

    await expect(handleProcessNotification({ ...JOB })).rejects.toThrow(/permanent failure/);

    expect(repo.sendToDeadLetter).toHaveBeenCalledTimes(1);
    expect(repo.sendToDeadLetter).toHaveBeenCalledWith(
      11, 5, 'email', 'permanent failure', 3, expect.objectContaining({ notificationId: 11, channel: 'email' }),
    );
    expect(repo.updateDeliveryStatus).toHaveBeenCalledWith(101, 'dead_letter', 'permanent failure');
  });

  it('suppresses a retried job whose notification/channel was already delivered', async () => {
    repo.findDeliveredDelivery.mockResolvedValue(77);

    await handleProcessNotification({ ...JOB });

    expect(repo.createDelivery).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(11, 5, 'duplicate_suppressed', expect.anything());
  });
});
