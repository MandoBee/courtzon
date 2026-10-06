import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDetailPage from '../TournamentDetailPage';

function lifecycleApi() {
  return {
    getTournament: vi.fn(),
    getGroups: vi.fn(),
    getMatches: vi.fn(),
    getStandings: vi.fn(),
    getRegistrations: vi.fn(),
    getFinances: vi.fn(),
    updateTournament: vi.fn(),
    listCompetitions: vi.fn(),
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
  };
}

function participantApi() {
  return {
    getParticipants: vi.fn(),
    getCurrentDraw: vi.fn(),
    getWaitlist: vi.fn(),
    listReplacementRequests: vi.fn(),
    generateDraw: vi.fn(),
    approveDraw: vi.fn(),
    lockDraw: vi.fn(),
    validateDraw: vi.fn(),
    moveParticipant: vi.fn(),
    assignSeed: vi.fn(),
    withdrawParticipant: vi.fn(),
    promoteNextWaitlisted: vi.fn(),
    replaceParticipant: vi.fn(),
    createPairParticipant: vi.fn(),
    createTeamParticipant: vi.fn(),
    getParticipantMembers: vi.fn(),
    addParticipantMember: vi.fn(),
    removeParticipantMember: vi.fn(),
    createReplacementRequest: vi.fn(),
    approveReplacementRequest: vi.fn(),
    rejectReplacementRequest: vi.fn(),
    cancelReplacementRequest: vi.fn(),
  };
}

const __state = vi.hoisted(() => ({
  adminApi: {} as any,
  orgApi: {} as any,
  participantApi: {} as any,
  orgParticipantApi: {} as any,
  refundApi: {} as any,
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
  tournamentParticipantApi: __state.participantApi,
  orgTournamentParticipantApi: __state.orgParticipantApi,
  tournamentRefundApi: __state.refundApi,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../../../store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 1, permissions: ['*'] } }),
}));

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function setApis() {
  Object.assign(__state.adminApi, lifecycleApi());
  Object.assign(__state.orgApi, lifecycleApi());
  Object.assign(__state.participantApi, participantApi());
  Object.assign(__state.orgParticipantApi, participantApi());
  Object.assign(__state.refundApi, { listOrgRequests: vi.fn(), approve: vi.fn(), reject: vi.fn() });
}

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
  setApis();
  for (const api of [__state.adminApi, __state.orgApi] as any[]) {
    api.getTournament.mockResolvedValue(__state.enrichedTournament);
    api.getGroups.mockResolvedValue([]);
    api.getMatches.mockResolvedValue([]);
    api.getStandings.mockResolvedValue([]);
    api.getRegistrations.mockResolvedValue([]);
    api.getFinances.mockResolvedValue({});
    api.listCompetitions.mockResolvedValue([]);
    api.updateTournament.mockResolvedValue({});
  }
  for (const api of [__state.participantApi, __state.orgParticipantApi] as any[]) {
    api.getParticipants.mockResolvedValue([]);
    api.getCurrentDraw.mockResolvedValue(null);
    api.getWaitlist.mockResolvedValue([]);
    api.listReplacementRequests.mockResolvedValue([]);
  }
  (__state.refundApi as any).listOrgRequests.mockResolvedValue([]);
});

describe('Tournament Hub — detail contract (UAT crash regression)', () => {
  it('admin mode renders the enriched fields with RAW array responses (no .map crash)', async () => {
    renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);

    expect(await screen.findByText('Padel Test Tournament')).toBeTruthy();
    expect(screen.getAllByText('Padel').length).toBeGreaterThan(0); // sport_name (hero + overview)
    expect(screen.getAllByText('16').length).toBeGreaterThan(0); // max_players / capacity KPI
    expect(screen.getByText('platform')).toBeTruthy(); // type

    // Switch to Matches tab — raw array → renders the empty table, no crash.
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.matches' }));
    await waitFor(() => expect(__state.adminApi.getMatches).toHaveBeenCalled());

    // Switch to Competition tab with a populated raw array → renders group names.
    __state.adminApi.getGroups.mockResolvedValue([{ id: 1, name: 'Group A', players: [] }]);
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    expect(await screen.findByText('Group A')).toBeTruthy();
  });

  it('org mode renders the same enriched shape with RAW array responses (no regression)', async () => {
    renderPage('/org/6/tournaments/1', '/org/:orgId/tournaments/:id', <TournamentDetailPage mode="org" orgId="6" />);

    expect(await screen.findByText('Padel Test Tournament')).toBeTruthy();
    expect(screen.getAllByText('Padel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('16').length).toBeGreaterThan(0);

    __state.orgApi.getGroups.mockResolvedValue([{ id: 2, name: 'Group B', players: [] }]);
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
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

    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.participants' }));

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
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.matches' }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.standings' }));
    expect(await screen.findByText('Ali')).toBeTruthy();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0); // points (progress dots also render numbers)
  });

  it('overview renders structured prizes (Group 2)', async () => {
    __state.adminApi.getTournament.mockResolvedValue({
      ...__state.enrichedTournament,
      prize_description: 'Legacy trophy text',
      prizes: [
        { id: 1, placement: 1, prize_type: 'cash', amount: 10000, currency_code: 'EGP', display_order: 0 },
        { id: 2, placement: 2, prize_type: 'silver', description: 'Silver medal', display_order: 1 },
      ],
    });
    renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);

    await screen.findByText('Padel Test Tournament');
    expect(screen.getAllByText(/1st Place/).length).toBeGreaterThan(0);
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText(/2nd Place/)).toBeTruthy();
    expect(screen.getByText('Silver medal')).toBeTruthy();
    expect(screen.queryByText('Legacy trophy text')).toBeNull(); // structured wins
  });

  it('overview falls back to legacy prize_description when no structured prizes (Group 2)', async () => {
    __state.adminApi.getTournament.mockResolvedValue({
      ...__state.enrichedTournament,
      prize_description: 'Legacy trophy text',
      prizes: [],
    });
    renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);

    await screen.findByText('Padel Test Tournament');
    expect(screen.getByText(/Legacy trophy text/)).toBeTruthy();
  });
});
