import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import PublicTournamentsPage from './PublicTournamentsPage';

const __state = vi.hoisted(() => ({
  listMock: vi.fn(),
}));

vi.mock('../../services/tournament', () => ({
  publicTournamentApi: { list: __state.listMock },
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PublicTournamentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PUBLIC_TOURNAMENT = {
  id: 1,
  name: 'Summer Open',
  format: 'knockout',
  status: 'registration_open',
  sport_name: 'Padel',
  bracket_type_name: 'Single Elimination',
  organisation_name: 'Padel Edge',
  start_date: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  __state.listMock.mockResolvedValue([PUBLIC_TOURNAMENT]);
});

describe('PublicTournamentsPage — F-02 query error handling (UX-15A)', () => {
  it('shows the existing error message + Retry (never the empty state) when the query fails', async () => {
    __state.listMock.mockRejectedValue(new Error('Network Error'));
    renderPage();

    expect(await screen.findByText(/Failed to load public tournaments/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    // A failed fetch must not fall through to the legitimate empty state.
    expect(screen.queryByText('No public tournaments right now.')).toBeNull();
  });

  it('recovers via Retry (successful refetch renders the public list)', async () => {
    __state.listMock.mockRejectedValueOnce(new Error('Network Error'));
    renderPage();

    expect(await screen.findByText(/Failed to load public tournaments/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Summer Open')).toBeTruthy();
    expect(screen.queryByText(/Failed to load public tournaments/)).toBeNull();
  });

  it('keeps the genuine empty state when the query succeeds with no public tournaments', async () => {
    __state.listMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No public tournaments right now.')).toBeTruthy();
    expect(screen.queryByText(/Failed to load public tournaments/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('renders the public list unchanged on success', async () => {
    renderPage();

    expect(await screen.findByText('Summer Open')).toBeTruthy();
    expect(screen.getByText(/Padel Edge/)).toBeTruthy();
    expect(screen.getByText('registration_open')).toBeTruthy();
  });
});
