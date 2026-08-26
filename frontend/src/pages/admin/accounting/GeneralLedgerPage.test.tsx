import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GeneralLedgerPage from './GeneralLedgerPage';

const mockGet = vi.fn();

vi.mock('../../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a) },
}));
vi.mock('../../../components/ui', () => ({
  Spinner: () => <div data-testid="spinner">Loading…</div>,
  Pagination: () => null,
}));
vi.mock('../../../components/ui/ExportCsvButton', () => ({
  ExportCsvButton: ({ endpoint, params, filename, label }: any) => (
    <button data-testid="gl-export" data-endpoint={endpoint} data-filename={filename} data-params={JSON.stringify(params)}>
      {label}
    </button>
  ),
}));
vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: { children: any }) => <>{children}</>,
}));
vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GeneralLedgerPage />
    </QueryClientProvider>,
  );
}

describe('GeneralLedgerPage — journal export', () => {
  it('renders an Export CSV button on the journal tab wired to the journal export endpoint', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/organisations?limit=200') return Promise.resolve({ data: { data: [] } });
      if (url === '/admin/accounting/periods') return Promise.resolve({ data: { data: [] } });
      if (url === '/admin/accounting/journal') return Promise.resolve({ data: { data: [], total: 0 } });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('gl-export')).toBeTruthy());
    const btn = screen.getByTestId('gl-export');
    expect(btn.getAttribute('data-endpoint')).toBe('/admin/accounting/journal/export');
    expect(btn.getAttribute('data-filename')).toBe('general-ledger');
    expect(btn.textContent).toBe('Export CSV');
  });
});