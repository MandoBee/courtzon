import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-05 — B27: dead-letter replay + delivery-attempt accounting.
 * Real `delivery.repository` functions against a scripted pool; queue mocked.
 */

const pool = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
const queueAdd = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({ queueService: { add: queueAdd } }));

import { retryFromDeadLetter, updateDeliveryStatus, findDeliveredDelivery } from '../infrastructure/repositories/delivery.repository.js';

const DEAD_LETTER = {
  id: 9,
  notification_id: 11,
  user_id: 5,
  channel: 'email',
  payload: JSON.stringify({ notificationId: 11, userId: 5, channel: 'email', title: 'Title', body: 'Body' }),
  error_message: 'smtp down',
  failed_attempts: 3,
  last_error_at: new Date(),
};

let deadRowPresent: boolean;
let claimSucceeds: boolean;
let reinserted: unknown[][];
let sqlLog: string[];

function installPool() {
  pool.execute.mockImplementation(async (sql: string, params: unknown[] = []) => {
    sqlLog.push(sql);
    if (/SELECT \* FROM notification_dead_letter_queue WHERE id/.test(sql)) {
      return [deadRowPresent ? [DEAD_LETTER] : []];
    }
    if (/DELETE FROM notification_dead_letter_queue WHERE id/.test(sql)) {
      return [{ affectedRows: claimSucceeds ? 1 : 0 }];
    }
    if (/INSERT INTO notification_delivery/.test(sql)) {
      return [{ insertId: 555 }];
    }
    if (/INSERT INTO notification_dead_letter_queue/.test(sql)) {
      reinserted.push(params);
      return [{ insertId: 10 }];
    }
    return [{ affectedRows: 1 }];
  });
}

beforeEach(() => {
  deadRowPresent = true;
  claimSucceeds = true;
  reinserted = [];
  sqlLog = [];
  pool.execute.mockReset();
  queueAdd.mockReset();
  queueAdd.mockResolvedValue('job-1');
  installPool();
});

describe('dead-letter replay', () => {
  it('re-enqueues a replay job and removes the claimed dead letter', async () => {
    await expect(retryFromDeadLetter(9)).resolves.toBe(true);

    expect(queueAdd).toHaveBeenCalledWith(
      'process_notification',
      expect.objectContaining({ notificationId: 11, userId: 5, channel: 'email', deliveryId: 555 }),
      { attempts: 3 },
    );
    expect(sqlLog.some((s) => /DELETE FROM notification_dead_letter_queue WHERE id/.test(s))).toBe(true);
  });

  it('is a no-op when the dead letter no longer exists (already replayed)', async () => {
    deadRowPresent = false;
    await expect(retryFromDeadLetter(9)).resolves.toBe(false);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('does not replay when another worker won the claim', async () => {
    claimSucceeds = false;
    await expect(retryFromDeadLetter(9)).resolves.toBe(false);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('restores the dead letter when enqueueing the replay fails', async () => {
    queueAdd.mockRejectedValue(new Error('redis down'));
    await expect(retryFromDeadLetter(9)).rejects.toThrow(/redis down/);
    expect(reinserted).toHaveLength(1);
  });
});

describe('delivery attempt accounting / idempotency lookup', () => {
  it('increments attempts for a failed attempt (drives retry exhaustion)', async () => {
    await updateDeliveryStatus(101, 'failed', 'smtp down');
    const sql = sqlLog.find((s) => /UPDATE notification_delivery/.test(s));
    expect(sql).toContain('attempts = attempts + 1');
    expect(sql).toContain('error_message = ?');
  });

  it('returns the delivered delivery id for the notification/channel pair', async () => {
    pool.execute.mockResolvedValue([[{ id: 77 }]]);
    await expect(findDeliveredDelivery(11, 5, 'email')).resolves.toBe(77);
    await expect(findDeliveredDelivery(11, 5, 'sms')).resolves.toBe(77);
  });

  it('returns null when nothing was delivered yet', async () => {
    pool.execute.mockResolvedValue([[]]);
    await expect(findDeliveredDelivery(11, 5, 'email')).resolves.toBeNull();
  });
});
