import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...a: any[]) => mockGet(...a),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// D4 Expanded — webhooks export requires the dedicated
// notifications.webhooks.export key (not the .manage administration key).
const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: [] },
};
vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));

import WebhooksPage from './WebhooksPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WebhooksPage />
    </QueryClientProvider>,
  );
}

describe('D4 — WebhooksPage export permission', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockAuth.user = { permissions: [] };
  });

  it('hides the Export control when notifications.webhooks.manage is missing', () => {
    mockAuth.user = { permissions: ['notifications.view'] };
    renderPage();
    expect(screen.getByText('Webhooks')).toBeInTheDocument();
    expect(screen.queryByText('Export ▾')).toBeNull();
  });

  it('hides the Export control when only notifications.webhooks.manage is held', () => {
    mockAuth.user = { permissions: ['notifications.webhooks.manage'] };
    renderPage();
    expect(screen.getByText('Webhooks')).toBeInTheDocument();
    expect(screen.queryByText('Export ▾')).toBeNull();
  });

  it('shows the Export control when notifications.webhooks.export is held', () => {
    mockAuth.user = { permissions: ['notifications.webhooks.export'] };
    renderPage();
    expect(screen.getByText('Export ▾')).toBeInTheDocument();
  });

  it('hides the Export control when signed out', () => {
    mockAuth.user = null;
    renderPage();
    expect(screen.queryByText('Export ▾')).toBeNull();
  });
});
