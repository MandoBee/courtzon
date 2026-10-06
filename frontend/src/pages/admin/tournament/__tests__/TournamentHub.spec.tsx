import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  permissions: ['*'],
  adminApi: {} as any,
  orgApi: {} as any,
  participantApi: {} as any,
  orgParticipantApi: {} as any,
  refundApi: {} as any,
  tournament: {
    id: 9,
    name: 'Hub Draft Cup',
    format: 'knockout',
    sport_name: 'Tennis',
    category: 'Open',
    status: 'draft',
    max_participants: 32,
    start_date: '2026-11-01T00:00:00.000Z',
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
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }),
}));

vi.mock('../../../../store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 1, permissions: __state.permissions } }),
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/tournament/list/9']}>
        <Routes>
          <Route path="/admin/tournament/list/:id" element={<TournamentDetailPage mode="admin" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setApis();
  __state.permissions = ['*'];
  __state.tournament.status = 'draft';
  __state.tournament.name = 'Hub Draft Cup';
  for (const api of [__state.adminApi, __state.orgApi] as any[]) {
    api.getTournament.mockResolvedValue(__state.tournament);
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

describe('Tournament Hub — shell, lifecycle awareness and RBAC', () => {
  it('renders the hero, all seven sections and a lifecycle-aware primary action (draft → Publish)', async () => {
    renderPage();
    expect(await screen.findByText('Hub Draft Cup')).toBeTruthy();
    expect(screen.getByText('Publish')).toBeTruthy();

    for (const label of ['Overview', 'Participants', 'Competition', 'Matches', 'Standings', 'Finances', 'Settings']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    }

    // Invalid lifecycle actions must not be exposed in the draft state.
    expect(screen.queryByText('Cancel Tournament')).toBeNull();
    expect(screen.queryByText('Close Registration')).toBeNull();
    expect(screen.queryByText('Archive')).toBeNull();
  });

  it('registration_open exposes Close Registration only (no Publish, no Cancel)', async () => {
    __state.tournament.status = 'registration_open';
    __state.tournament.name = 'Reg Open Cup';
    renderPage();
    expect(await screen.findByText('Reg Open Cup')).toBeTruthy();
    expect(screen.getByText('Close Registration')).toBeTruthy();
    expect(screen.queryByText('Publish')).toBeNull();
    expect(screen.queryByText('Cancel Tournament')).toBeNull();
  });

  it('running exposes Manage Live Tournament plus the valid Complete/Cancel secondary actions', async () => {
    __state.tournament.status = 'running';
    __state.tournament.name = 'Live Cup';
    renderPage();
    expect(await screen.findByText('Live Cup')).toBeTruthy();
    expect(screen.getByText('Manage Live Tournament')).toBeTruthy();
    expect(screen.getByText('Complete Tournament')).toBeTruthy();
    expect(screen.getByText('Cancel Tournament')).toBeTruthy();
    expect(screen.queryByText('Start Tournament')).toBeNull();
  });

  it('hides actions and gated sections the user is not permitted to use', async () => {
    __state.permissions = ['admin-tournaments.view'];
    renderPage();
    expect(await screen.findByText('Hub Draft Cup')).toBeTruthy();
    // No publish permission → primary action not rendered.
    expect(screen.queryByText('Publish')).toBeNull();
    // No financial.reconcile / tournament.update → those tabs are not offered.
    expect(screen.queryByRole('tab', { name: 'Finances' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Settings' })).toBeNull();
    // Organizational sections remain available to a page viewer.
    expect(screen.getByRole('tab', { name: 'Matches' })).toBeTruthy();
  });

  it('tabs support keyboard navigation (ArrowRight moves selection)', async () => {
    renderPage();
    const overview = await screen.findByRole('tab', { name: 'Overview' });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Participants' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows standings content inside the Standings section', async () => {
    __state.adminApi.getStandings.mockResolvedValue([
      { id: 1, rank_position: 1, player_name: 'Nadal', wins: 2, losses: 0, draws: 0, points: 6 },
    ]);
    renderPage();
    await screen.findByText('Hub Draft Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(await screen.findByText('Nadal')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });
});
