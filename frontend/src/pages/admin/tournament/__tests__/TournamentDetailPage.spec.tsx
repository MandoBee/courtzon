import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDetailPage from '../TournamentDetailPage';

const __state = vi.hoisted(() => ({
  adminApi: {
    getTournament: vi.fn(),
    getGroups: vi.fn(),
    getMatches: vi.fn(),
    getStandings: vi.fn(),
    getRegistrations: vi.fn(),
    register: vi.fn(),
    cancelRegistration: vi.fn(),
    confirmRegistration: vi.fn(),
    generateGroups: vi.fn(),
    publish: vi.fn(),
    openRegistration: vi.fn(),
    closeRegistration: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    archive: vi.fn(),
  },
  orgApi: {
    getTournament: vi.fn(),
    getGroups: vi.fn(),
    getMatches: vi.fn(),
    getStandings: vi.fn(),
    getRegistrations: vi.fn(),
    register: vi.fn(),
    cancelRegistration: vi.fn(),
    confirmRegistration: vi.fn(),
    generateGroups: vi.fn(),
    publish: vi.fn(),
    openRegistration: vi.fn(),
    closeRegistration: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    archive: vi.fn(),
  },
  enrichedTournament: {
    id: 1,
    name: 'Padel Test Tournament',
    format: 'knockout',
    sport_id: 22,
    sport_name: 'Padel',
    organisation_id: null,
    organisation_name: null,
    max_players: 16,
    max_participants: 16,
    type: 'platform',
    tournament_type: 'platform',
    status: 'draft',
    start_date: '2026-10-01T00:00:00.000Z',
    end_date: '2026-10-05T00:00:00.000Z',
  },
}));

vi.mock('../../../../services/tournament', () => ({
  tournamentApi: __state.adminApi,
  orgTournamentApi: __state.orgApi,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../../../store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: { permissions: ['*'] } }),
}));

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function renderPage(initialPath: string, routePath: string, element: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.adminApi.getTournament.mockResolvedValue(__state.enrichedTournament);
  __state.adminApi.getGroups.mockResolvedValue([]);
  __state.adminApi.getMatches.mockResolvedValue([]);
  __state.adminApi.getStandings.mockResolvedValue([]);
  __state.adminApi.getRegistrations.mockResolvedValue([]);
  __state.orgApi.getTournament.mockResolvedValue(__state.enrichedTournament);
  __state.orgApi.getGroups.mockResolvedValue([]);
  __state.orgApi.getMatches.mockResolvedValue([]);
  __state.orgApi.getStandings.mockResolvedValue([]);
  __state.orgApi.getRegistrations.mockResolvedValue([]);
});

describe('TournamentDetailPage — management detail contract (UAT crash regression)', () => {
  it('admin mode renders the enriched fields with RAW array responses (no .map crash)', async () => {
    renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);

    expect(await screen.findByText('Padel Test Tournament')).toBeTruthy();
    expect(screen.getByText('Padel')).toBeTruthy(); // sport_name
    expect(screen.getByText('16')).toBeTruthy(); // max_players
    expect(screen.getByText('platform')).toBeTruthy(); // type

    // Switch to Matches tab — raw array → renders the empty table, no crash.
    fireEvent.click(screen.getByText('tournaments.tab.matches'));
    await waitFor(() => expect(__state.adminApi.getMatches).toHaveBeenCalled());

    // Switch to Groups tab with a populated raw array → renders group names.
    __state.adminApi.getGroups.mockResolvedValue([{ id: 1, name: 'Group A', players: [] }]);
    fireEvent.click(screen.getByText('tournaments.tab.groups'));
    expect(await screen.findByText('Group A')).toBeTruthy();
  });

  it('org mode renders the same enriched shape with RAW array responses (no regression)', async () => {
    renderPage('/org/6/tournaments/1', '/org/:orgId/tournaments/:id', <TournamentDetailPage mode="org" orgId="6" />);

    expect(await screen.findByText('Padel Test Tournament')).toBeTruthy();
    expect(screen.getByText('Padel')).toBeTruthy();
    expect(screen.getByText('16')).toBeTruthy();

    __state.orgApi.getGroups.mockResolvedValue([{ id: 2, name: 'Group B', players: [] }]);
    fireEvent.click(screen.getByText('tournaments.tab.groups'));
    expect(await screen.findByText('Group B')).toBeTruthy();
  });

  it('registration table uses the authoritative status enum (registered/confirmed/withdrawn/disqualified)', async () => {
    __state.adminApi.getRegistrations.mockResolvedValue([
      { id: 1, player_id: 10, player_name: 'Ali', status: 'registered' },
      { id: 2, player_id: 11, player_name: 'Sara', status: 'confirmed' },
      { id: 3, player_id: 12, player_name: 'Omar', status: 'withdrawn' },
      { id: 4, player_id: 13, player_name: 'Lina', status: 'disqualified' },
    ]);
    renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);

    expect(await screen.findByText('Ali')).toBeTruthy();
    expect(screen.getByText('tournaments.reg_status.registered')).toBeTruthy();
    expect(screen.getByText('tournaments.reg_status.confirmed')).toBeTruthy();
    expect(screen.getByText('tournaments.reg_status.withdrawn')).toBeTruthy();
    expect(screen.getByText('tournaments.reg_status.disqualified')).toBeTruthy();

    // Confirm button only on 'registered'; cancel only on registered/confirmed.
    const confirmButtons = screen.getAllByText('tournaments.confirm');
    expect(confirmButtons).toHaveLength(1);
    const cancelButtons = screen.getAllByText('tournaments.cancel');
    expect(cancelButtons).toHaveLength(2);
  });

  it('matches table renders player1_name / resource_name / referee_name / score_summary', async () => {
    __state.adminApi.getMatches.mockResolvedValue([
      {
        id: 1, round: 1, match_number: 1, status: 'completed',
        player1_name: 'Ali', player2_name: 'Sara', resource_name: 'Court 1', referee_name: 'Ref A',
        score_summary: '6-4 6-3',
      },
    ]);
    renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);

    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByText('tournaments.tab.matches'));
    expect(await screen.findByText('Ali')).toBeTruthy();
    expect(screen.getByText('Sara')).toBeTruthy();
    expect(screen.getByText('Court 1')).toBeTruthy();
    expect(screen.getByText('Ref A')).toBeTruthy();
    expect(screen.getByText('6-4 6-3')).toBeTruthy();
  });

  it('standings table renders player_name / wins / losses / points', async () => {
    __state.adminApi.getStandings.mockResolvedValue([
      { id: 1, rank_position: 1, registration_id: 10, player_name: 'Ali', wins: 1, losses: 0, draws: 0, points: 3 },
    ]);
    renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);

    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByText('tournaments.tab.standings'));
    expect(await screen.findByText('Ali')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy(); // points
  });
});