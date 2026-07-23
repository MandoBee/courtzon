import { describe, it, expect, vi, beforeEach } from 'vitest';
import { changeOrderStatusHandler } from '../commands/change-order-status.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../../../database/mysql.js', () => ({
  getPool: vi.fn(() => ({
    execute: vi.fn(),
  })),
}));

function makeCommand(overrides: Record<string, unknown> = {}): Command {
  return {
    commandId: 'order-test-1',
    commandType: 'ChangeOrderStatus',
    aggregateType: 'order',
    aggregateId: '1',
    payload: { orderId: 1, toStatus: 'confirmed', role: 'admin', ...overrides },
    correlationId: 'corr-1',
  };
}

const mockConn = {
  execute: vi.fn(),
} as any;

describe('ChangeOrderStatus command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates a valid command', async () => {
    await expect(changeOrderStatusHandler.validate(makeCommand())).resolves.not.toThrow();
  });

  it('rejects missing orderId', async () => {
    await expect(changeOrderStatusHandler.validate(makeCommand({ orderId: 0 }))).rejects.toThrow('orderId is required');
  });

  it('rejects missing toStatus', async () => {
    await expect(changeOrderStatusHandler.validate(makeCommand({ toStatus: '' }))).rejects.toThrow('toStatus is required');
  });

  it('rejects missing role', async () => {
    await expect(changeOrderStatusHandler.validate(makeCommand({ role: '' }))).rejects.toThrow('role is required');
  });

  it('transitions pending → confirmed by admin', async () => {
    mockConn.execute.mockResolvedValueOnce([[{ id: 1, status: 'pending' }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await changeOrderStatusHandler.execute(makeCommand(), mockConn);

    expect(result.orderId).toBe(1);
    expect(result.status).toBe('confirmed');
    expect(mockConn.execute).toHaveBeenCalledWith(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ? AND status = ?',
      ['confirmed', 1, 'pending'],
    );
  });

  it('skips if already in target status', async () => {
    mockConn.execute.mockResolvedValueOnce([[{ id: 1, status: 'confirmed' }], []]);

    const result = await changeOrderStatusHandler.execute(makeCommand(), mockConn);
    expect(result.status).toBe('confirmed');
    expect(mockConn.execute).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundError for unknown order', async () => {
    mockConn.execute.mockResolvedValueOnce([[], []]);
    await expect(changeOrderStatusHandler.execute(makeCommand(), mockConn)).rejects.toThrow();
  });

  it('rejects invalid transition', async () => {
    mockConn.execute.mockResolvedValueOnce([[{ id: 1, status: 'pending' }], []]);
    await expect(changeOrderStatusHandler.execute(makeCommand({ toStatus: 'shipped' }), mockConn)).rejects.toThrow('Illegal order state transition');
  });

  it('emits order event on success', () => {
    const events = changeOrderStatusHandler.events!(
      makeCommand({ toStatus: 'confirmed' }),
      { orderId: 1, status: 'confirmed' },
    );

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('order.confirmed');
    expect(events[0].payload).toMatchObject({ orderId: 1, status: 'confirmed', role: 'admin' });
    expect(events[0].context).toMatchObject({ aggregateType: 'order', aggregateId: '1' });
  });
});
