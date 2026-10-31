import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';

/**
 * P3-03 regression coverage — MessagesPage returned its permission message in
 * the middle of the render, before the promote/demote `useMutation` hooks. A
 * permission change while mounted therefore changed the hook count.
 */

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../hooks/useCan', () => ({
  useCan: () => ({
    can: (permission: string) => allowed.has('*') || allowed.has(permission),
    permissions: [...allowed],
  }),
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 1 } }),
}));

vi.mock('../../components/ui/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(actual.useQuery),
    useMutation: vi.fn(actual.useMutation),
  };
});

let allowed = new Set<string>();
const setPerms = (...permissions: string[]) => { allowed = new Set(permissions); };

import api from '../../services/api';
import MessagesPage from './MessagesPage';

const useMutationMock = vi.mocked(useMutation);

function Host({ Page }: { Page: React.ComponentType }) {
  const [, setEpoch] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setEpoch((n) => n + 1)}>force-rerender</button>
      <Page />
    </>
  );
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={['/messages']}>
      <QueryClientProvider client={qc}>
        <Host Page={MessagesPage} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('P3-03 — MessagesPage permission gate is after every hook', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
    setPerms();
  });

  it('runs the same number of hooks whether or not chat permission is held', () => {
    setPerms('community.chat.view');
    useMutationMock.mockClear();
    const granted = renderPage();
    const grantedMutationCalls = useMutationMock.mock.calls.length;
    expect(grantedMutationCalls).toBeGreaterThan(0);
    granted.unmount();

    // Denied render must declare the same mutation hooks (the old mid-render
    // return skipped the promote/demote hooks → fewer calls).
    setPerms();
    useMutationMock.mockClear();
    const denied = renderPage();
    const deniedMutationCalls = useMutationMock.mock.calls.length;
    expect(deniedMutationCalls).toBe(grantedMutationCalls);
    expect(screen.getByText(/do not have permission to view messages/i)).toBeTruthy();
    denied.unmount();
  });

  it('renders the page when chat permission is granted while mounted', async () => {
    setPerms();
    renderPage();
    expect(screen.getByText(/do not have permission to view messages/i)).toBeTruthy();
    expect(api.get).not.toHaveBeenCalled();

    setPerms('community.chat.view');
    fireEvent.click(screen.getByRole('button', { name: 'force-rerender' }));

    await waitFor(() => {
      expect(screen.queryByText(/do not have permission to view messages/i)).toBeNull();
    });
  });
});
