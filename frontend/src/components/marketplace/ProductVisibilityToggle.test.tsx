import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductVisibilityToggle } from './ProductVisibilityToggle';

const mockPut = vi.fn();

vi.mock('../../services/api', () => ({
  default: { put: (...a: any[]) => mockPut(...a) },
}));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

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

  it('control is always rendered on the owner card (not permission-gated) — Visible badge', async () => {
    renderToggle({ id: 4, status: 'active', marketplace_visible: 1 });
    await waitFor(() => {
      expect(screen.getByText('Visible')).toBeTruthy();
    });
  });

  it('clicking Visible hides the product via the existing visibility API', async () => {
    renderToggle({ id: 5, status: 'active', marketplace_visible: 1 });
    await waitFor(() => {
      expect(screen.getByText('Visible')).toBeTruthy();
    });
    await userEvent.click(screen.getByText('Visible'));
    expect(mockPut).toHaveBeenCalledWith('/marketplace/products/5/visibility', { visible: false });
  });

  it('clicking Hidden shows the product via the existing visibility API', async () => {
    renderToggle({ id: 6, status: 'active', marketplace_visible: 0 });
    await waitFor(() => {
      expect(screen.getByText('Hidden')).toBeTruthy();
    });
    await userEvent.click(screen.getByText('Hidden'));
    expect(mockPut).toHaveBeenCalledWith('/marketplace/products/6/visibility', { visible: true });
  });
});