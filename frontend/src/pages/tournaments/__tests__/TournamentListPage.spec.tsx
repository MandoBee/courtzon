import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentListPage from '../TournamentListPage';

const __state = vi.hoisted(() => ({
  listPayload: {
    data: [
      {
        id: 1,
        name: 'Padel Open',
        status: 'registration_open',
        sport_name: 'Padel',
        bracket_type_name: 'Single Elimination',
        max_participants: 16,
        entry_fee: 800,
        currency_code: 'EGP',
        start_date: '2026-10-01T00:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    limit: 50,
  },
}));

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../../components/ui', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Spinner: () => <div>Loading</div>,
}));

import api from '../../../services/api';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tournaments']}>
        <Routes>
          <Route path="/tournaments" element={<TournamentListPage />} />
          <Route path="/tournaments/:id" element={<div>detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (api.get as any).mockResolvedValue({ data: __state.listPayload });
});

describe('TournamentListPage — player list contract (Group 1B)', () => {
  it('renders sport_name and bracket_type_name from the authoritative API joins', async () => {
    renderPage();

    expect(await screen.findByText('Padel Open')).toBeTruthy();
    expect(screen.getByText(/Single Elimination/)).toBeTruthy();
    expect(screen.getByText(/Single Elimination • Padel/)).toBeTruthy();
  });

  it('renders the authoritative status (registration_open), fee and start date', async () => {
    renderPage();

    expect(await screen.findByText('registration_open')).toBeTruthy();
    expect(screen.getByText(/Fee:/)).toBeTruthy();
    expect(screen.getByText(/Start:/)).toBeTruthy();
  });

  it('shows the error state with Retry instead of the empty message when the request fails (F-02)', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('network down'));
    renderPage();

    expect(await screen.findByText('Unable to load tournaments.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText('No tournaments yet')).toBeNull();
  });

  it('recovers via Retry after a failed load and renders the tournament list (F-02)', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('network down'));
    renderPage();
    expect(await screen.findByText('Unable to load tournaments.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Padel Open')).toBeTruthy();
    expect(screen.queryByText('Unable to load tournaments.')).toBeNull();
  });

  it('renders the legitimate empty state when the request succeeds with no tournaments (F-02)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [], total: 0, page: 1, limit: 50 } });
    renderPage();

    expect(await screen.findByText('No tournaments yet')).toBeTruthy();
  });
});
