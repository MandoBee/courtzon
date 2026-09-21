import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDetailPage from '../TournamentDetailPage';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  user: { id: 42 } as any,
  tournament: {
    id: 1,
    name: 'Padel Open',
    status: 'registration_open',
    sport_id: 22,
    sport_name: 'Padel',
    bracket_type_name: 'Single Elimination',
    organisation_name: 'Padel Edge',
    format: 'knockout',
    max_participants: 16,
    entry_fee: 800,
    currency_code: 'EGP',
    registration_deadline: '2026-09-30T00:00:00.000Z',
    registration_closes: '2026-09-30T00:00:00.000Z',
    start_date: '2026-10-01T00:00:00.000Z',
    end_date: '2026-10-05T00:00:00.000Z',
    rules: 'Single Elimination. Best of 3 sets.',
    prize_description: 'Trophy + 5000 EGP',
  },
  matches: [
    {
      id: 11, round: 1, match_number: 1, bracket_position: 0,
      player1_id: 42, player1_name: 'Ali', player2_id: 43, player2_name: 'Sara',
      winner_id: 42, status: 'completed', score_summary: '6-4 6-3', match_id: 77,
    },
  ],
  standings: [
    { id: 1, rank_position: 1, registration_id: 10, player_name: 'Ali', points: 3, wins: 1, losses: 0, games_won: 2, games_lost: 0 },
  ],
  participants: [
    { id: 10, player_id: 42, player_name: 'Ali', seed_rank: 1, status: 'registered', registered_at: '2026-09-01T00:00:00.000Z' },
    { id: 11, player_id: 43, player_name: 'Sara', seed_rank: 2, status: 'confirmed', registered_at: '2026-09-02T00:00:00.000Z' },
  ],
}));

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../../../permissions/Can', () => ({
  Can: ({ permission, children }: any) => {
    const perms = __state.userPermissions;
    if (perms.includes('*') || perms.includes(permission)) return <>{children}</>;
    return null;
  },
}));

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: __state.user }),
}));

import api from '../../../services/api';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tournaments/1']}>
        <Routes>
          <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
          <Route path="/tournaments" element={<div>list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockDetailApi() {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/tournaments/1') return Promise.resolve({ data: __state.tournament });
    if (url === '/tournaments/1/matches') return Promise.resolve({ data: { data: __state.matches } });
    if (url === '/tournaments/1/standings') return Promise.resolve({ data: { data: __state.standings } });
    if (url === '/tournaments/1/participants') return Promise.resolve({ data: { data: __state.participants } });
    return Promise.resolve({ data: {} });
  });
}

function clickTab(label: string) {
  const tab = screen.getAllByText(label).find((el) => el.tagName === 'BUTTON') ?? screen.getByText(label);
  fireEvent.click(tab);
  return waitFor(() => expect(tab).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.userPermissions = ['*'];
  __state.user = { id: 42 };
  mockDetailApi();
});

describe('TournamentDetailPage — player detail authoritative contract (Group 1B)', () => {
  it('renders authoritative fields (sport_name, bracket_type_name, organisation, fee, deadline)', async () => {
    renderPage();

    expect(await screen.findByText('Padel Open')).toBeTruthy();
    expect(screen.getAllByText(/Single Elimination/).length).toBeGreaterThan(0);
    expect(screen.getByText('Padel Edge')).toBeTruthy();
    expect(screen.getByText(/Fee:/)).toBeTruthy();
    expect(screen.getByText(/Registration deadline:/)).toBeTruthy();
  });

  it('renders the authoritative status (registration_open) — never the obsolete open/in_progress', async () => {
    renderPage();

    await screen.findByText('Padel Open');
    expect(screen.getByText('registration_open')).toBeTruthy();
    expect(screen.queryByText('open')).toBeNull();
    expect(screen.queryByText('in_progress')).toBeNull();
  });

  it('shows the current player registration status and seed', async () => {
    renderPage();

    await screen.findByText('Padel Open');
    expect(screen.getByText(/registered/)).toBeTruthy();
    expect(screen.getByText(/Seed 1/)).toBeTruthy();
  });

  it('renders standings with rank_position, player_name, games_won/games_lost', async () => {
    renderPage();

    await screen.findByText('Padel Open');
    await clickTab('Standings');
    expect(await screen.findByText('Ali')).toBeTruthy();
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1); // rank_position + wins
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1); // games_won
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2); // games_lost + losses
  });

  it('renders participants with player_id, seed_rank and status', async () => {
    renderPage();

    await screen.findByText('Padel Open');
    await clickTab('Players');
    expect(await screen.findByText('Ali')).toBeTruthy();
    expect(screen.getByText('Sara')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
    expect(screen.getByText('confirmed')).toBeTruthy();
  });

  it('renders the bracket with player names and score_summary', async () => {
    renderPage();

    await screen.findByText('Padel Open');
    await clickTab('Bracket');
    expect(await screen.findByText('Ali')).toBeTruthy();
    expect(screen.getByText('Sara')).toBeTruthy();
    expect(screen.getByText('6-4 6-3')).toBeTruthy();
  });

  it('does NOT render the Generate Bracket button for a completed tournament', async () => {
    __state.tournament = { ...__state.tournament, status: 'completed' };
    __state.matches = [];
    mockDetailApi();

    renderPage();
    await screen.findByText('Padel Open');
    expect(screen.queryByText('Generate Bracket & Start')).toBeNull();
  });

  it('renders generated Tournament Rules', async () => {
    renderPage();

    await screen.findByText('Padel Open');
    expect(screen.getByText('Single Elimination. Best of 3 sets.')).toBeTruthy();
  });
});