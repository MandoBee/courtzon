import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn() },
}));
vi.mock('../../../components/ui/ExportCsvButton', () => ({
  ExportCsvButton: ({ endpoint, params, filename, label }: any) => (
    <button data-testid="export-btn" data-endpoint={endpoint} data-filename={filename} data-params={JSON.stringify(params)}>
      {label}
    </button>
  ),
}));
vi.mock('../../../hooks/useCan', () => ({
  useCan: () => ({ can: (k: string) => k === 'settlements.view' || k === 'settlements.request' }),
}));
vi.mock('../../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)} ${_c || ''}`.trim(),
}));

import api from '../../../services/api';
import UnifiedSettlementListPage from './UnifiedSettlementListPage';

const mockGet = vi.mocked(api.get);

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UnifiedSettlementListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UnifiedSettlementListPage — export', () => {
  it('renders an Export CSV button wired to the settlements export endpoint', async () => {
    mockGet.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } });
    renderPage();
    const btn = await screen.findByTestId('export-btn');
    expect(btn.getAttribute('data-endpoint')).toBe('/unified-settlements/export');
    expect(btn.getAttribute('data-filename')).toBe('settlements');
    expect(btn.textContent).toBe('Export CSV');
  });

  it('passes the current status filter to the export endpoint', async () => {
    mockGet.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } });
    renderPage();
    const btn = await screen.findByTestId('export-btn');
    // Default status is '' → undefined, so export params are empty
    expect(JSON.parse(btn.getAttribute('data-params') || '{}')).toEqual({ status: undefined });
  });
});