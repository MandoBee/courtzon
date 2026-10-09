import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PublicTournamentDetailPage from './PublicTournamentDetailPage';

const __state = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('../../services/api', () => ({
  default: { get: __state.getMock, post: vi.fn().mockResolvedValue({ data: {} }) },
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }),
}));

const PUBLIC_TOURNAMENT = {
  id: 1,
  name: 'Public Cup',
  format: 'knockout',
  status: 'registration_open',
  bracket_type: 'Single Elimination',
  sport: { name: 'Padel' },
  organisation: 'Padel Edge',
  start_date: null,
  end_date: null,
  registration_opens: null,
  registration_closes: null,
  max_participants: 8,
  description: null,
  venue: null,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tournaments/public/1']}>
        <Routes>
          <Route path="/tournaments/public/:id" element={<PublicTournamentDetailPage />} />
          <Route path="/tournaments/public" element={<div>PUBLIC_LIST</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.getMock.mockResolvedValue({ data: { data: PUBLIC_TOURNAMENT } });
});

describe('PublicTournamentDetailPage — F-02 error handling (UX-15B)', () => {
  it('network/server error: explicit error + Retry, never the not-found state', async () => {
    __state.getMock.mockRejectedValue(new Error('Network Error'));
    renderPage();

    expect(await screen.findByText('Unable to load this tournament. Please try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    // A transient failure must not masquerade as a genuine not-found.
    expect(screen.queryByText('This tournament is unavailable or not public.')).toBeNull();
  });

  it('recovers via Retry (successful refetch renders the detail)', async () => {
    __state.getMock.mockRejectedValueOnce(new Error('Network Error'));
    renderPage();

    expect(await screen.findByText('Unable to load this tournament. Please try again.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Public Cup')).toBeTruthy();
    expect(screen.queryByText('Unable to load this tournament. Please try again.')).toBeNull();
  });

  it('genuine 404: keeps the existing "unavailable or not public" state with no Retry', async () => {
    __state.getMock.mockRejectedValue({ response: { status: 404 } });
    renderPage();

    expect(await screen.findByText('This tournament is unavailable or not public.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByText('Unable to load this tournament. Please try again.')).toBeNull();
  });

  it('success with no tournament data: keeps the unavailable state (no Retry)', async () => {
    __state.getMock.mockResolvedValue({ data: null });
    renderPage();

    expect(await screen.findByText('This tournament is unavailable or not public.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('renders the public detail on success', async () => {
    renderPage();

    expect(await screen.findByText('Public Cup')).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getByText('Padel')).toBeTruthy();
    expect(screen.getByText('Padel Edge')).toBeTruthy();
    // Back link + sign-in CTA preserved.
    expect(screen.getByText('← Back to public tournaments')).toBeTruthy();
  });
});
