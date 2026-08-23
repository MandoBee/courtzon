import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductVisibilityToggle } from './ProductVisibilityToggle';

const mockPut = vi.fn();

vi.mock('../../services/api', () => ({
  default: { put: (...a: any[]) => mockPut(...a) },
}));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: any) => unknown) =>
    selector({ user: { permissions: ['*'] } }),
}));

function renderToggle(product: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductVisibilityToggle product={product} />
    </QueryClientProvider>,
  );
}

describe('ProductVisibilityToggle badge', () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockPut.mockResolvedValue({ data: {} });
  });

  it('renders a clear Visible badge for a visible Active product', async () => {
    renderToggle({ id: 1, status: 'active', marketplace_visible: 1 });
    await waitFor(() => {
      expect(screen.getByText('Visible')).toBeTruthy();
    });
  });

  it('renders a clear Hidden badge for a hidden Active product', async () => {
    renderToggle({ id: 2, status: 'active', marketplace_visible: 0 });
    await waitFor(() => {
      expect(screen.getByText('Hidden')).toBeTruthy();
    });
  });

  it('shows an awaiting-approval hint (not a visibility badge) for pending products', async () => {
    renderToggle({ id: 3, status: 'pending', marketplace_visible: 1 });
    await waitFor(() => {
      expect(screen.getByText('Awaiting approval')).toBeTruthy();
    });
  });
});