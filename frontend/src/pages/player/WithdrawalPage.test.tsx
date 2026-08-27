import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WithdrawalPage from './WithdrawalPage';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...a: any[]) => mockGet(...a),
    post: (...a: any[]) => mockPost(...a),
  },
}));
vi.mock('../../components/ui', () => ({
  Button: ({ children, disabled, onClick }: any) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  Card: ({ children }: any) => <div>{children}</div>,
  Modal: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  Spinner: () => <div>Loading…</div>,
}));
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WithdrawalPage />
    </QueryClientProvider>,
  );
}

describe('F-13 — WithdrawalPage uses canonical available_balance', () => {
  it('renders backend available_balance directly (reserved funds excluded)', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/wallets/me') {
        return Promise.resolve({ data: { id: 1, balance: 1000, reserved_balance: 200, available_balance: 800, currencyCode: 'EGP', isLocked: false } });
      }
      if (url === '/withdrawals/me') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/800\.00/)).toBeTruthy());
    expect(screen.getByText(/Reserved:.*200\.00/)).toBeTruthy();
  });

  it('disables the withdrawal button when available_balance is 0', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/wallets/me') {
        return Promise.resolve({ data: { id: 1, balance: 500, reserved_balance: 500, available_balance: 0, currencyCode: 'EGP', isLocked: false } });
      }
      if (url === '/withdrawals/me') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    renderPage();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Request Withdrawal' }) as HTMLButtonElement).disabled).toBe(true));
  });
});