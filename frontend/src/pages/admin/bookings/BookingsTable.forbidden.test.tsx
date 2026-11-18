import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/** UR-01/UR-04 — a forbidden booking list must not look like an empty list. */
const mockGet = vi.fn();
vi.mock('../../../services/api', () => ({ default: { get: (...args: any[]) => mockGet(...args) } }));

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'booking.search_placeholder': 'Search bookings',
      'booking.empty_table': 'No bookings found.',
      'common.loading': 'Loading...',
    }[key] ?? key),
  }),
}));

vi.mock('../../../store/auth.store', () => {
  const useAuthStore = () => ({ user: { permissions: ['admin.bookings.view'] } });
  return { useAuthStore: Object.assign(useAuthStore, { getState: () => ({ user: { permissions: ['admin.bookings.view'] } }) }) };
});

vi.mock('../../../components/ui', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

import BookingsTable from '../../../components/booking/BookingsTable';
import { ToastProvider } from '../../../components/ui/Toast';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider><BookingsTable context="admin" /></ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((url: string) => {
    if (url === '/admin/bookings') return Promise.resolve({ data: { data: [], total: 0 } });
    return Promise.resolve({ data: { data: [] } });
  });
});

describe('BookingsTable — 403 vs genuine empty state', () => {
  it('shows access denied instead of zero KPIs and "No bookings found" on 403', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/admin/bookings') return Promise.reject({ response: { status: 403 } });
      return Promise.resolve({ data: { data: [] } });
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Access denied')).toBeTruthy());
    expect(screen.queryByText('No bookings found.')).toBeNull();
    expect(screen.queryByText('Total')).toBeNull();
    expect(screen.queryByText('Revenue')).toBeNull();
  });

  it('keeps the real empty state for a 200 response with no rows', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('No bookings found.')).toBeTruthy());
    expect(screen.queryByText('Access denied')).toBeNull();
    expect(screen.getByText('Total')).toBeTruthy();
  });
});
