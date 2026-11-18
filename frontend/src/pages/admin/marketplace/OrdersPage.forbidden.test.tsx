import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/** UR-01/UR-04 — forbidden marketplace data must not become "No orders found". */
const mockGet = vi.fn();
vi.mock('../../../services/api', () => ({ default: { get: (...args: any[]) => mockGet(...args) } }));

import OrdersPage from './OrdersPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter><QueryClientProvider client={qc}><OrdersPage /></QueryClientProvider></MemoryRouter>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((url: string) =>
    Promise.resolve({ data: url.includes('/sellers') ? { data: [] } : { data: [], total: 0 } }),
  );
});

describe('OrdersPage — 403 vs genuine empty state', () => {
  it('shows access denied when the orders API returns 403', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/marketplace/admin/orders') return Promise.reject({ response: { status: 403 } });
      return Promise.resolve({ data: { data: [] } });
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Access denied')).toBeTruthy());
    expect(screen.queryByText('No orders found.')).toBeNull();
  });

  it('shows access denied when only the sellers API returns 403', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/sellers')) return Promise.reject({ response: { status: 403 } });
      return Promise.resolve({ data: { data: [], total: 0 } });
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Access denied')).toBeTruthy());
    expect(screen.queryByText('No orders found.')).toBeNull();
  });

  it('keeps the real empty state for successful 200 responses', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('No orders found.')).toBeTruthy());
    expect(screen.queryByText('Access denied')).toBeNull();
  });
});
