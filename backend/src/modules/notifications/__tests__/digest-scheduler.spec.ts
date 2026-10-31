import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-05 — digest job payload contract.
 *
 * `processDigest` must enqueue the canonical `ProcessNotificationDigestJob`
 * (`count`, `categorySlug`, `eventName`, `windowId`). The previous payload used
 * `notificationCount`/`frequency`, so the worker rendered "undefined" counts and
 * an undefined category.
 */

const pool = vi.hoisted(() => ({ execute: vi.fn() }));
const queueAdd = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({ queueService: { add: queueAdd } }));

import { processDigest } from '../application/digest-scheduler.service.js';

describe('digest scheduler — canonical job payload', () => {
  beforeEach(() => {
    pool.execute.mockReset();
    queueAdd.mockReset();
    queueAdd.mockResolvedValue('job-1');
    pool.execute.mockResolvedValue([[{ user_id: 5, notification_count: 4, categories: 'bookings,payments' }]]);
  });

  it('enqueues one canonical digest job per user with the unread count', async () => {
    await processDigest('daily');

    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      'process_notification_digest',
      { userId: 5, categorySlug: 'system', eventName: 'system:digest', windowId: 0, count: 4 },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('does not leak the legacy payload fields the worker cannot read', async () => {
    await processDigest('hourly');
    const payload = queueAdd.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('notificationCount');
    expect(payload).not.toHaveProperty('frequency');
    expect(payload.count).toBe(4);
  });

  it('keeps processing other users when one enqueue fails', async () => {
    pool.execute.mockResolvedValue([[
      { user_id: 5, notification_count: 1, categories: null },
      { user_id: 6, notification_count: 2, categories: null },
    ]]);
    queueAdd.mockRejectedValueOnce(new Error('redis down')).mockResolvedValueOnce('job-2');

    await processDigest('weekly');

    expect(queueAdd).toHaveBeenCalledTimes(2);
  });
});
