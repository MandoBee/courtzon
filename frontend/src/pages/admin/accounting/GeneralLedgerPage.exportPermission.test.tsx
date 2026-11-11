import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();

vi.mock('../../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a) },
}));
vi.mock('../../../components/ui', () => ({
  Spinner: () => <div data-testid="spinner">Loading…</div>,
  Pagination: () => null,
}));
vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// D4 — the journal export button requires both accounting.journal.view (the
// data prerequisite enforced by the backend) and accounting.export (the
// dedicated egress key). The page itself stays gated by accounting.gl.view.
const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: [] },
};
vi.mock('../../../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));

import GeneralLedgerPage from './GeneralLedgerPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GeneralLedgerPage />
    </QueryClientProvider>,
  );
}

describe('D4 — GeneralLedgerPage journal export permission', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation((url: string) => {
      if (url === '/organisations?limit=200') return Promise.resolve({ data: { data: [] } });
      if (url === '/admin/accounting/periods') return Promise.resolve({ data: { data: [] } });
      if (url === '/admin/accounting/journal') return Promise.resolve({ data: { data: [], total: 0 } });
      return Promise.resolve({ data: [] });
    });
    mockAuth.user = { permissions: [] };
  });

  it('hides the journal Export button when accounting.export is missing', async () => {
    mockAuth.user = { permissions: ['accounting.gl.view', 'accounting.journal.view'] };
    renderPage();
    await waitFor(() => expect(screen.getByText('General Ledger')).toBeTruthy());
    expect(screen.queryByText('Export CSV')).toBeNull();
  });

  it('hides the journal Export button when accounting.journal.view is missing', async () => {
    mockAuth.user = { permissions: ['accounting.gl.view', 'accounting.export'] };
    renderPage();
    await waitFor(() => expect(screen.getByText('General Ledger')).toBeTruthy());
    expect(screen.queryByText('Export CSV')).toBeNull();
  });

  it('shows the journal Export button when accounting.journal.view and accounting.export are held', async () => {
    mockAuth.user = { permissions: ['accounting.gl.view', 'accounting.journal.view', 'accounting.export'] };
    renderPage();
    await waitFor(() => expect(screen.getByText('Export CSV')).toBeTruthy());
  });

  it('keeps the page itself gated by accounting.gl.view', async () => {
    mockAuth.user = { permissions: ['accounting.journal.view', 'accounting.export'] };
    renderPage();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByText('General Ledger')).toBeNull();
  });
});
