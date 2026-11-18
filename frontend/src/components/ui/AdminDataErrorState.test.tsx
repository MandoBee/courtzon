import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminDataErrorState, getAdminDataError } from './AdminDataErrorState';

describe('AdminDataErrorState — shared admin 403 handling (UR-01/UR-04)', () => {
  it('maps 403 to a clear access-denied state with no retry', () => {
    render(<AdminDataErrorState error={{ response: { status: 403 } }} resource="booking data" />);

    const alert = screen.getByTestId('admin-data-error');
    expect(alert.getAttribute('data-error-kind')).toBe('forbidden');
    expect(screen.getByText('Access denied')).toBeTruthy();
    expect(screen.getByText(/don't have permission to view booking data/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('never echoes backend error details', () => {
    render(
      <AdminDataErrorState
        error={{ response: { status: 403, data: { message: 'SECRET permission key: financial.reconcile /admin/withdrawals' } } }}
      />,
    );

    expect(screen.queryByText(/SECRET/i)).toBeNull();
    expect(document.body.textContent).not.toContain('financial.reconcile');
  });

  it('keeps 5xx and network failures distinct from 403 and offers retry', () => {
    const retry = vi.fn();
    const { unmount } = render(<AdminDataErrorState error={{ response: { status: 500 } }} onRetry={retry} />);
    expect(screen.getByText('Unable to load data')).toBeTruthy();
    expect(screen.getByTestId('admin-data-error').getAttribute('data-error-kind')).toBe('server');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
    unmount();

    render(<AdminDataErrorState error={new Error('network down')} />);
    expect(screen.getByTestId('admin-data-error').getAttribute('data-error-kind')).toBe('network');
    expect(screen.queryByText('Access denied')).toBeNull();
  });

  it('treats 401 as a session problem, not a permission problem', () => {
    expect(getAdminDataError({ response: { status: 401 } }).kind).toBe('unauthenticated');
    expect(getAdminDataError(undefined).kind).toBe('network');
  });
});
