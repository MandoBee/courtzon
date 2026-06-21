import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Can } from './Can';

const mockState = {
  user: { permissions: ['bookings.view'] } as { permissions: string[] },
};

vi.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

describe('Can', () => {
  beforeEach(() => {
    mockState.user = { permissions: ['bookings.view'] };
  });

  it('renders children when the user has the permission', () => {
    render(
      <Can permission="bookings.view">
        <button type="button">Book</button>
      </Can>
    );
    expect(screen.getByRole('button', { name: 'Book' })).toBeInTheDocument();
  });

  it('renders fallback when permission is missing', () => {
    render(
      <Can permission="admin.only" fallback={<span>Hidden</span>}>
        <button type="button">Admin</button>
      </Can>
    );
    expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('renders children when user has wildcard permission', () => {
    mockState.user = { permissions: ['*'] };
    render(
      <Can permission="anything.here">
        <span>Allowed</span>
      </Can>
    );
    expect(screen.getByText('Allowed')).toBeInTheDocument();
  });
});
