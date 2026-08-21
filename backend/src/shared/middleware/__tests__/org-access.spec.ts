import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../database/mysql.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../database/mysql.js';
import { isPlatformAdmin, canAccessOrganisation } from '../../../shared/middleware/org-access.js';

const mockPool = getPool as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('org-access helper', () => {
  describe('isPlatformAdmin', () => {
    it('returns true for super_admin role holders', async () => {
      mockPool.mockReturnValue({
        execute: vi.fn().mockResolvedValue([[{ '1': 1 }], []]),
      });
      await expect(isPlatformAdmin(10)).resolves.toBe(true);
    });

    it('returns false for non-admin users', async () => {
      mockPool.mockReturnValue({
        execute: vi.fn().mockResolvedValue([[], []]),
      });
      await expect(isPlatformAdmin(10)).resolves.toBe(false);
    });
  });

  describe('canAccessOrganisation', () => {
    it('returns false for missing user or org id', async () => {
      await expect(canAccessOrganisation(0, 5)).resolves.toBe(false);
      await expect(canAccessOrganisation(5, 0)).resolves.toBe(false);
    });

    it('returns true for the org owner / platform admin', async () => {
      mockPool.mockReturnValue({
        execute: vi.fn().mockResolvedValue([[{ '1': 1 }], []]),
      });
      await expect(canAccessOrganisation(7, 100)).resolves.toBe(true);
    });

    it('returns true when the user has an org role-scope', async () => {
      const execute = vi.fn()
        .mockResolvedValueOnce([[], []]) // owner/admin query: no match
        .mockResolvedValueOnce([[{ '1': 1 }], []]); // role-scope query: match
      mockPool.mockReturnValue({ execute });
      await expect(canAccessOrganisation(7, 100)).resolves.toBe(true);
      expect(execute).toHaveBeenCalledTimes(2);
    });

    it('returns false when the user has no relationship to the org', async () => {
      const execute = vi.fn()
        .mockResolvedValueOnce([[], []]) // owner/admin query
        .mockResolvedValueOnce([[], []]); // role-scope query
      mockPool.mockReturnValue({ execute });
      await expect(canAccessOrganisation(7, 100)).resolves.toBe(false);
    });
  });
});