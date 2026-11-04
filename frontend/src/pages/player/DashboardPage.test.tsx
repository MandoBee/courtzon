import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The dashboard must read the unread counter from the notifications store
 * (single server-authoritative source) instead of issuing its own
 * `GET /notifications/unread-count` query.
 */

const h = vi.hoisted(() => ({
  apiGet: vi.fn(() => Promise.resolve({ data: {} })),
  storeState: { unreadCount: 7, initialized: true },
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: any) => selector({ user: { id: 1, fullName: 'Player One' } }),
}));

vi.mock('../../store/notification.store', () => ({
  useNotificationStore: (selector: any) => selector(h.storeState),
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: { children: any }) => children,
}));

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => h.apiGet(...(args as [])),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

// Imported after the mocks above.
import PlayerDashboardPage from './DashboardPage';

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlayerDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PlayerDashboardPage — unread count source', () => {
  it('renders the store unread count without querying the unread-count endpoint', () => {
    renderDashboard();

    const label = screen.getByText('player.dashboard.unread_notifications');
    expect(label.parentElement?.textContent).toContain('7');

    const requested = h.apiGet.mock.calls.map((call: any[]) => String(call[0]));
    expect(requested).not.toContain('/notifications/unread-count');
  });

  it('shows the placeholder until the notifications store is initialized', () => {
    h.storeState.unreadCount = 0;
    h.storeState.initialized = false;
    try {
      renderDashboard();
      const label = screen.getByText('player.dashboard.unread_notifications');
      expect(label.parentElement?.textContent).toContain('—');
    } finally {
      h.storeState.unreadCount = 7;
      h.storeState.initialized = true;
    }
  });
});
