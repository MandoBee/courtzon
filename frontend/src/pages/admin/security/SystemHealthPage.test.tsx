import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import SystemHealthPage from './SystemHealthPage';
import api from '../../../services/api';

/**
 * CZ-RELEASE-BLOCKERS-26 — the admin System Health page must NOT fetch `/metrics`.
 *
 * `/metrics` is fail-closed in production (404 without METRICS_TOKEN, 401 without
 * a valid Bearer token) and the token must never reach the browser, so an
 * unauthenticated browser fetch could only ever fail. The page must render its
 * health panels while making no `/metrics` request and showing no Metrics Summary.
 */

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));

const mockGet = vi.mocked(api.get);

/** Minimal axios-shaped success response for the mocked client. */
const ok = (data: unknown): Promise<AxiosResponse> =>
  Promise.resolve({ data: { data } } as unknown as AxiosResponse);

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SystemHealthPage />
    </QueryClientProvider>,
  );
}

describe('SystemHealthPage — no unauthenticated /metrics fetch', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation((url: string) => {
      if (url === '/admin/security/system-health') {
        return ok({
          checks: {
            database: { status: 'ok', latencyMs: 5 },
            redis: { status: 'ok' },
            memory: { status: 'ok', usagePercent: 42 },
          },
          uptime: 7200,
        });
      }
      if (url === '/admin/security/redis') {
        return ok({ usedMemory: '1MB', connectedClients: 3, hitRate: '99%' });
      }
      return ok({});
    });
  });

  it('renders the health panels and never requests /metrics', async () => {
    renderPage();

    // The page renders once the health query resolves.
    expect(await screen.findByText('Platform Health')).toBeInTheDocument();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/admin/security/system-health'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/admin/security/redis'));

    // Preserved UI: health cards + Redis info panel.
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getAllByText('Redis').length).toBeGreaterThan(0);
    expect(await screen.findByText('1MB')).toBeInTheDocument();

    // Removed behavior: no Metrics Summary panel and no /metrics request.
    expect(screen.queryByText('Metrics Summary')).toBeNull();
    const requested = mockGet.mock.calls.map((c) => c[0]);
    expect(requested).not.toContain('/metrics');
    expect(requested).toEqual(
      expect.arrayContaining(['/admin/security/system-health', '/admin/security/redis']),
    );
  });
});
