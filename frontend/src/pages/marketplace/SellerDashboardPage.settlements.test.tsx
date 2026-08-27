import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SellerDashboardPage from './SellerDashboardPage';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a), post: (...a: any[]) => mockPost(...a) },
}));
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));
vi.mock('../../hooks/useCan', () => ({
  useCan: () => ({ can: () => true }),
}));
vi.mock('../../store/auth.store', () => ({
  useAuthStore: () => ({ user: { id: 1 } }),
}));
vi.mock('../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)} ${_c || ''}`.trim(),
}));
vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d || k }),
}));
vi.mock('../../components/organisations/OrganisationForm', () => ({ default: () => null }));
vi.mock('../../components/marketplace/ProductVisibilityToggle', () => ({ ProductVisibilityToggle: () => null }));
vi.mock('../../components/marketplace/SellerProductFormModal', () => ({ default: () => null }));
vi.mock('../org/FinancialPositionPage', () => ({
  BalanceCard: () => null,
  CollectorInfoSection: () => null,
  BUCKET_BORDER_COLORS: {},
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SellerDashboardPage />
    </QueryClientProvider>,
  );
}

function seedApi(orgs: { id: number; name: string }[]) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/marketplace/player/status') return Promise.resolve({ data: { active: true, activeProductCount: 0, orgs } });
    if (url === '/marketplace/seller/settlements') return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20 } });
    if (url === '/marketplace/seller/settlements/balance') return Promise.resolve({ data: { available_balance: 500, pending_fee: 0, pending_settlements: 0, unsettled_orders: 0 } });
    if (url === '/marketplace/seller/stats') return Promise.resolve({ data: {} });
    if (url === '/marketplace/seller/products') return Promise.resolve({ data: { data: [], total: 0 } });
    if (url === '/marketplace/seller/orders') return Promise.resolve({ data: { data: [], total: 0 } });
    if (url === '/sports/marketplace') return Promise.resolve({ data: [] });
    if (url === '/marketplace/categories') return Promise.resolve({ data: [] });
    if (url === '/marketplace/brands') return Promise.resolve({ data: [] });
    if (url === '/marketplace/tags') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
}

describe('P2-5 — Seller settlements multi-org selector', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('shows an organisation selector for a multi-org seller', async () => {
    seedApi([{ id: 10, name: 'Org A' }, { id: 20, name: 'Org B' }]);
    renderPage();
    // Open the settlements tab (button text is the i18n key 'seller.settlements')
    await waitFor(() => expect(screen.getByText('seller.settlements')).toBeTruthy());
    screen.getByText('seller.settlements').click();
    await waitFor(() => expect(screen.getByText('Select organisation…')).toBeTruthy());
  });

  it('passes the selected organisationId when requesting settlement', async () => {
    seedApi([{ id: 10, name: 'Org A' }, { id: 20, name: 'Org B' }]);
    mockPost.mockResolvedValue({ data: { id: 1 } });
    renderPage();
    await waitFor(() => expect(screen.getByText('seller.settlements')).toBeTruthy());
    screen.getByText('seller.settlements').click();
    await waitFor(() => expect(screen.getByText('Select organisation…')).toBeTruthy());
    const select = screen.getByText('Select organisation…').closest('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '20' } });
    await waitFor(() => expect(screen.getByText('Request Settlement')).toBeTruthy());
    screen.getByText('Request Settlement').click();
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/marketplace/seller/settlements', { organisationId: 20 }));
  });
});