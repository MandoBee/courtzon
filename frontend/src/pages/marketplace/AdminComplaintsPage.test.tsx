import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockGet = vi.fn();

vi.mock('../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a) },
}));
vi.mock('../../utils/currency', () => ({
  formatPrice: (n: number) => `${n.toFixed(2)}`,
}));

const useCanSpy = vi.fn();

vi.mock('../../permissions/Can', () => ({
  Can: ({ permission, children }: any) => (useCanSpy(permission) ? children : null),
}));

import AdminComplaintsPage from './AdminComplaintsPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/marketplace/complaints']}>
        <AdminComplaintsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('F-14 — AdminComplaintsPage listing authorization', () => {
  it('renders the refund-approvals listing only for marketplace.complaints.approve holders', async () => {
    useCanSpy.mockReturnValue(true);
    mockGet.mockResolvedValue({ data: { data: [{ id: 1, complaint_type: 'defective', reason: 'broken', order_id: 5, order_item_id: 9, created_at: '2026-08-26T10:00:00.000Z', refund_amount: 100, disputed_value: 80, refund_ratio: 1.25 }] } });
    renderPage();
    expect(await screen.findByText('Refund Approvals')).toBeTruthy();
    expect(await screen.findByText(/broken/i)).toBeTruthy();
  });

  it('renders nothing when the viewer lacks marketplace.complaints.approve', async () => {
    useCanSpy.mockReturnValue(false);
    mockGet.mockResolvedValue({ data: { data: [] } });
    const { container } = renderPage();
    expect(screen.queryByText('Refund Approvals')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });
});