import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();

vi.mock('../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a) },
}));

// D4 — the audit export reads permissions from the auth store (via useCan).
const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: [] },
};
vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));

import AuditLogPage from './AuditLogPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuditLogPage />
    </QueryClientProvider>,
  );
}

describe('D4 — AuditLogPage export permission', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [], total: 0 } });
    mockAuth.user = { permissions: [] };
  });

  it('hides the Export control when audit.export is missing', () => {
    mockAuth.user = { permissions: ['audit.view'] };
    renderPage();
    expect(screen.getByText('Audit Center')).toBeInTheDocument();
    expect(screen.queryByText('Export ▾')).toBeNull();
  });

  it('shows the Export control when audit.export is held', () => {
    mockAuth.user = { permissions: ['audit.view', 'audit.export'] };
    renderPage();
    expect(screen.getByText('Export ▾')).toBeInTheDocument();
  });

  it('hides the Export control when signed out', () => {
    mockAuth.user = null;
    renderPage();
    expect(screen.queryByText('Export ▾')).toBeNull();
  });
});
