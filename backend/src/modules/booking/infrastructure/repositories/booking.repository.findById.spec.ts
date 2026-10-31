import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';

const { poolExecute } = vi.hoisted(() => ({ poolExecute: vi.fn() }));

vi.mock('../../../../database/mysql.js', () => ({
  getPool: () => ({ execute: poolExecute }),
  createPool: vi.fn(),
  closePool: vi.fn(),
}));

import { BookingRepository } from './booking.repository.js';

const NORMALIZED = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('BookingRepository.findById — left-join tolerance (P8.7.14.5)', () => {
  beforeEach(() => {
    poolExecute.mockReset();
  });

  it('joins resources and branches with LEFT JOIN, keeping aliases and WHERE clause', async () => {
    poolExecute.mockResolvedValue([[]]);

    await new BookingRepository().findById(7);

    expect(poolExecute).toHaveBeenCalledTimes(1);
    const sql = NORMALIZED(String(poolExecute.mock.calls[0][0]));

    expect(sql).toContain('SELECT b.*, r.name as resource_name, br.name as branch_name');
    expect(sql).toContain(
      'FROM bookings b LEFT JOIN resources r ON r.id = b.resource_id LEFT JOIN branches br ON br.id = b.branch_id WHERE b.id = ?',
    );
    // No INNER JOIN may remain on this path.
    expect(sql).not.toMatch(/FROM bookings b (?!LEFT JOIN)/);
    expect(poolExecute.mock.calls[0][1]).toEqual([7]);
  });

  it('returns resource and branch names when both rows exist', async () => {
    const row = { id: 7, branch_id: 3, resource_id: 11, resource_name: 'Court 1', branch_name: 'Branch A' };
    poolExecute.mockResolvedValue([[row]]);

    const booking = await new BookingRepository().findById(7);

    expect(booking).toBe(row);
    expect(booking.resource_name).toBe('Court 1');
    expect(booking.branch_name).toBe('Branch A');
    expect(booking.id).toBe(7);
  });

  it('returns the booking with branch_name null when the branch row is missing', async () => {
    const row = { id: 7, branch_id: 3, resource_id: 11, resource_name: 'Court 1', branch_name: null };
    poolExecute.mockResolvedValue([[row]]);

    const booking = await new BookingRepository().findById(7);

    expect(booking).not.toBeNull();
    expect(booking.id).toBe(7);
    expect(booking.resource_name).toBe('Court 1');
    expect(booking.branch_name).toBeNull();
  });

  it('returns the booking with resource_name null when the resource row is missing', async () => {
    const row = { id: 7, branch_id: 3, resource_id: 99, resource_name: null, branch_name: 'Branch A' };
    poolExecute.mockResolvedValue([[row]]);

    const booking = await new BookingRepository().findById(7);

    expect(booking).not.toBeNull();
    expect(booking.id).toBe(7);
    expect(booking.resource_name).toBeNull();
    expect(booking.branch_name).toBe('Branch A');
  });

  it('returns the booking when both joined rows are missing', async () => {
    poolExecute.mockResolvedValue([[{ id: 7, resource_name: null, branch_name: null }]]);

    const booking = await new BookingRepository().findById(7);

    expect(booking).not.toBeNull();
    expect(booking.resource_name).toBeNull();
    expect(booking.branch_name).toBeNull();
  });

  it('still returns null for a non-existent booking', async () => {
    poolExecute.mockResolvedValue([[]]);

    await expect(new BookingRepository().findById(9999)).resolves.toBeNull();
  });

  it('uses the supplied transaction connection instead of the pool', async () => {
    const connExecute = vi.fn().mockResolvedValue([[{ id: 7, resource_name: null, branch_name: null }]]);
    const conn = { execute: connExecute } as unknown as PoolConnection;

    const booking = await new BookingRepository().findById(7, conn);

    expect(booking.id).toBe(7);
    expect(poolExecute).not.toHaveBeenCalled();
    expect(connExecute).toHaveBeenCalledTimes(1);
    expect(NORMALIZED(String(connExecute.mock.calls[0][0]))).toContain('LEFT JOIN branches br');
    expect(connExecute.mock.calls[0][1]).toEqual([7]);
  });
});
