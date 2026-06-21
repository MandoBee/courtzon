import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCan } from './useCan';

const mockState = {
  user: { permissions: ['marketplace.view'] } as { permissions: string[] },
};

vi.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

describe('useCan', () => {
  beforeEach(() => {
    mockState.user = { permissions: ['marketplace.view'] };
  });

  it('returns true when permission is granted', () => {
    const { result } = renderHook(() => useCan());
    expect(result.current.can('marketplace.view')).toBe(true);
    expect(result.current.can('admin.only')).toBe(false);
  });

  it('returns true for any key when wildcard is present', () => {
    mockState.user = { permissions: ['*'] };
    const { result } = renderHook(() => useCan());
    expect(result.current.can('organisations.delete')).toBe(true);
  });

  it('returns false when user has no permissions', () => {
    mockState.user = { permissions: [] };
    const { result } = renderHook(() => useCan());
    expect(result.current.can('bookings.view')).toBe(false);
  });
});
