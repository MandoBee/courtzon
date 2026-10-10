import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDetailPage from '../TournamentDetailPage';

function lifecycleApi() {
  return {
    getTournament: vi.fn(),
    getGroups: vi.fn(),
    getStages: vi.fn(),
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
    qualifyGsk: vi.fn(),
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
  toast: { showToast: vi.fn() },
  userPermissions: ['*'] as string[],
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
  Can: ({ permission, children }: any) => {
    const perms: string[] = __state.userPermissions;
    return perms.includes('*') || perms.includes(permission) ? <>{children}</> : null;
  },
}));

vi.mock('../../../../store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 1, permissions: __state.userPermissions } }),
}));

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => __state.toast,
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
  __state.userPermissions = ['*'];
  setApis();
  for (const api of [__state.adminApi, __state.orgApi] as any[]) {
    api.getTournament.mockResolvedValue(__state.enrichedTournament);
    api.getGroups.mockResolvedValue([]);
    api.getStages.mockResolvedValue([]);
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

  it('renders the draft status pill with a readable foreground (F-01 regression)', async () => {
    // gray-100 AND gray-700 both resolve to var(--color-border), so the old
    // `text-gray-700` draft pill was invisible on its `bg-gray-100` background.
    // gray-600 resolves to var(--color-text) — readable in light and dark themes.
    const { container } = renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);

    await screen.findByText('Padel Test Tournament');
    const pill = Array.from(container.querySelectorAll<HTMLElement>('span'))
      .find((el) => el.textContent === 'tournaments.status.draft');
    expect(pill).toBeTruthy();
    expect(pill!.className).toContain('text-gray-600');
    expect(pill!.className).not.toContain('text-gray-700');
  });
});

/** Read a Hub KPI value from its label (label <p> + value <p> share one container). */
function kpiValue(label: string): string | null {
  const labelEl = screen.getByText(label);
  const container = labelEl.parentElement as HTMLElement;
  return container.querySelectorAll('p')[1]?.textContent ?? null;
}

describe('Tournament Hub — F-02 query error states (UX-13)', () => {
  // The i18n mock returns the KEY for t(); Retry buttons therefore render 'common.retry'.
  const RETRY = 'common.retry';

  function renderAdmin() {
    return renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);
  }

  it('tournament failure (non-404): error + Retry, never a blank Hub shell', async () => {
    __state.adminApi.getTournament.mockRejectedValue(new Error('Network Error'));
    renderAdmin();

    expect(await screen.findByText('Unable to load tournament.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
    expect(screen.queryByText('Tournament not found.')).toBeNull();
    // The empty shell (tabs) must not render on a failed load.
    expect(screen.queryByRole('tab', { name: 'tournaments.hub.matches' })).toBeNull();
  });

  it('tournament failure (HTTP 404): genuine not-found preserved, no Retry', async () => {
    __state.adminApi.getTournament.mockRejectedValue({ response: { status: 404 } });
    renderAdmin();

    expect(await screen.findByText('Tournament not found.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
    expect(screen.queryByText('Unable to load tournament.')).toBeNull();
  });

  it('tournament failure recovers via Retry', async () => {
    __state.adminApi.getTournament.mockRejectedValueOnce(new Error('Network Error'));
    renderAdmin();

    expect(await screen.findByText('Unable to load tournament.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    expect(await screen.findByText('Padel Test Tournament')).toBeTruthy();
  });

  it('registrations failure: error + Retry and the participant KPI is not fabricated to 0', async () => {
    __state.adminApi.getRegistrations.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');

    expect(kpiValue('tournaments.hub.kpi.participants')).toBe('—');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.participants' }));
    expect(await screen.findByText('Unable to load registrations.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
  });

  it('registrations failure recovers via Retry', async () => {
    __state.adminApi.getRegistrations.mockRejectedValueOnce(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.participants' }));

    expect(await screen.findByText('Unable to load registrations.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    await waitFor(() => expect(screen.queryByText('Unable to load registrations.')).toBeNull());
  });

  it('standings failure: error + Retry in the Standings tab', async () => {
    __state.adminApi.getStandings.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.standings' }));

    expect(await screen.findByText('Unable to load standings.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
  });

  it('groups failure (non-GSK): error + Retry and Generate Groups is fail-closed', async () => {
    __state.adminApi.getGroups.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));

    expect(await screen.findByText('Unable to load groups.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
    const generate = screen.getByText('tournaments.generate_groups').closest('button') as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
  });

  it('groups failure (GSK): error + Retry, no false empty state, Generate Groups is fail-closed', async () => {
    __state.adminApi.getTournament.mockResolvedValue({ ...__state.enrichedTournament, format: 'group_stage_knockout' });
    __state.adminApi.getGroups.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));

    expect(await screen.findByText('Unable to load groups.')).toBeTruthy();
    expect(screen.queryByTestId('gsk-groups-empty')).toBeNull();
    expect((screen.getByTestId('gsk-generate-groups') as HTMLButtonElement).disabled).toBe(true);
  });

  it('stages failure (GSK): qualification + knockout show error + Retry, never the false "not generated" panels', async () => {
    __state.adminApi.getTournament.mockResolvedValue({ ...__state.enrichedTournament, format: 'group_stage_knockout' });
    __state.adminApi.getStages.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));

    // Generate groups is fail-closed while the stage configuration is unknown.
    expect((screen.getByTestId('gsk-generate-groups') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.qualification' }));
    expect(await screen.findByText('Unable to load stages.')).toBeTruthy();
    expect(screen.queryByTestId('gsk-qual-pending')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.knockout' }));
    expect(await screen.findByText('Unable to load stages.')).toBeTruthy();
    expect(screen.queryByTestId('gsk-knockout-pending')).toBeNull();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
  });

  it('stages failure recovers via Retry (GSK knockout renders the real panel)', async () => {
    __state.adminApi.getTournament.mockResolvedValue({ ...__state.enrichedTournament, format: 'group_stage_knockout' });
    __state.adminApi.getStages
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue([
        { id: 5, progression_format: 'round_robin', config: {} },
        { id: 6, progression_format: 'knockout', config: {} },
      ]);
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.knockout' }));

    expect(await screen.findByText('Unable to load stages.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    expect(await screen.findByTestId('gsk-knockout')).toBeTruthy();
    expect(screen.queryByText('Unable to load stages.')).toBeNull();
  });

  it('finances failure: error + Retry in the Finances tab', async () => {
    __state.adminApi.getFinances.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.finances' }));

    expect(await screen.findByText('Unable to load finances.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
  });

  it('refund-requests failure (org): error + Retry in Finances', async () => {
    __state.refundApi.listOrgRequests.mockRejectedValue(new Error('Network Error'));
    renderPage('/org/6/tournaments/1', '/org/:orgId/tournaments/:id', <TournamentDetailPage mode="org" orgId="6" />);
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.finances' }));

    expect(await screen.findByText('Unable to load refund requests.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
  });

  it('preserves the existing matches error + Retry contract (MatchesManager)', async () => {
    __state.adminApi.getMatches.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.matches' }));

    expect(await screen.findByText('tournaments.match.load_error')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'tournaments.match.retry' })).toBeTruthy();
  });

  it('genuine empty registrations are preserved (no error)', async () => {
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.participants' }));

    expect(screen.queryByText('Unable to load registrations.')).toBeNull();
    expect(await screen.findByText('tournaments.player')).toBeTruthy();
  });
});

describe('Tournament Hub — bracket/GSK-groups error dependencies (UX-13 follow-up)', () => {
  // The i18n mock returns the KEY for t(); Retry buttons therefore render 'common.retry'.
  const RETRY = 'common.retry';

  function renderAdmin() {
    return renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);
  }
  function gskTournament() {
    return { ...__state.enrichedTournament, format: 'group_stage_knockout' };
  }

  it('registrations failure gates the non-GSK bracket with error + Retry (no empty-slot bracket)', async () => {
    __state.adminApi.getRegistrations.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.bracket' }));

    expect(await screen.findByText('Unable to load registrations.')).toBeTruthy();
    // The bracket (empty or otherwise) must not render on a registrations failure.
    expect(screen.queryByText('tournamentBracket.empty')).toBeNull();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
  });

  it('registrations failure recovers via Retry in the non-GSK bracket', async () => {
    __state.adminApi.getRegistrations.mockRejectedValueOnce(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.bracket' }));

    expect(await screen.findByText('Unable to load registrations.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    await waitFor(() => expect(screen.queryByText('Unable to load registrations.')).toBeNull());
    // Genuine empty bracket resumes (matches fixture is empty).
    expect(await screen.findByText('tournamentBracket.empty')).toBeTruthy();
  });

  it('registrations failure gates the GSK knockout view (stages OK) with error + Retry', async () => {
    __state.adminApi.getTournament.mockResolvedValue(gskTournament());
    __state.adminApi.getStages.mockResolvedValue([
      { id: 5, progression_format: 'round_robin', config: {} },
      { id: 6, progression_format: 'knockout', config: {} },
    ]);
    __state.adminApi.getRegistrations.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.knockout' }));

    expect(await screen.findByText('Unable to load registrations.')).toBeTruthy();
    expect(screen.queryByTestId('gsk-knockout')).toBeNull();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
  });

  it('standings failure gates the GSK Groups sub-tab with error + Retry (not a pending empty state)', async () => {
    __state.adminApi.getTournament.mockResolvedValue(gskTournament());
    __state.adminApi.getGroups.mockResolvedValue([{ id: 10, name: 'A', advance_count: 2 }]);
    __state.adminApi.getStandings.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));

    expect(await screen.findByText('Unable to load standings.')).toBeTruthy();
    expect(screen.queryByTestId('gsk-groups')).toBeNull();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
  });

  it('standings failure recovers via Retry in GSK Groups', async () => {
    __state.adminApi.getTournament.mockResolvedValue(gskTournament());
    __state.adminApi.getGroups.mockResolvedValue([{ id: 10, name: 'A', advance_count: 2 }]);
    __state.adminApi.getStandings
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue([{ id: 1, group_id: 10, rank_position: 1, player_name: 'Ali', points: 3, wins: 1, losses: 0 }]);
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));

    expect(await screen.findByText('Unable to load standings.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    expect(await screen.findByTestId('gsk-groups')).toBeTruthy();
    expect(screen.queryByText('Unable to load standings.')).toBeNull();
  });

  it('GSK Groups keeps the normal empty-standings behavior when the query succeeds', async () => {
    __state.adminApi.getTournament.mockResolvedValue(gskTournament());
    __state.adminApi.getGroups.mockResolvedValue([{ id: 10, name: 'A', advance_count: 2 }]);
    __state.adminApi.getStandings.mockResolvedValue([]);
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));

    expect(await screen.findByTestId('gsk-groups')).toBeTruthy();
    expect(screen.queryByText('Unable to load standings.')).toBeNull();
  });
});

describe('Tournament Hub — TUX-04 GSK dependent sub-tab matches error', () => {
  const RETRY = 'common.retry';

  function renderAdmin() {
    return renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);
  }

  function gskTournament() {
    return { ...__state.enrichedTournament, format: 'group_stage_knockout' };
  }

  function gskStages() {
    return [
      { id: 5, progression_format: 'round_robin', config: {} },
      { id: 6, progression_format: 'knockout', config: {} },
    ];
  }

  it('qualification: rejected matches query shows error + Retry, never the incomplete state', async () => {
    __state.adminApi.getTournament.mockResolvedValue(gskTournament());
    __state.adminApi.getStages.mockResolvedValue(gskStages());
    __state.adminApi.getMatches.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.qualification' }));

    expect(await screen.findByText('Unable to load matches.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
    expect(screen.queryByTestId('gsk-qual-incomplete')).toBeNull();
    expect(screen.queryByTestId('gsk-qualification')).toBeNull();
  });

  it('qualification: Retry recovers and restores the qualification view', async () => {
    __state.adminApi.getTournament.mockResolvedValue(gskTournament());
    __state.adminApi.getStages.mockResolvedValue(gskStages());
    __state.adminApi.getMatches
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce([{ id: 1, stage_id: 5, status: 'completed' }]);
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.qualification' }));

    expect(await screen.findByText('Unable to load matches.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    expect(await screen.findByTestId('gsk-qualification')).toBeTruthy();
    expect(screen.queryByText('Unable to load matches.')).toBeNull();
    expect(screen.queryByTestId('gsk-qual-incomplete')).toBeNull();
  });

  it('knockout: rejected matches query shows error + Retry, never the "not generated" state', async () => {
    __state.adminApi.getTournament.mockResolvedValue(gskTournament());
    __state.adminApi.getStages.mockResolvedValue(gskStages());
    __state.adminApi.getMatches.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.knockout' }));

    expect(await screen.findByText('Unable to load matches.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
    expect(screen.queryByTestId('gsk-knockout-pending')).toBeNull();
    expect(screen.queryByTestId('gsk-knockout')).toBeNull();
  });

  it('knockout: Retry recovers and restores the knockout view', async () => {
    __state.adminApi.getTournament.mockResolvedValue(gskTournament());
    __state.adminApi.getStages.mockResolvedValue(gskStages());
    __state.adminApi.getMatches
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce([
        { id: 200, stage_id: 6, round: 1, round_name: 'Semi-final', bracket_position: 0, match_number: 1, player1_name: 'Ali', player2_name: 'Nour', status: 'scheduled' },
      ]);
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.knockout' }));

    expect(await screen.findByText('Unable to load matches.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    expect(await screen.findByTestId('gsk-knockout')).toBeTruthy();
    expect(screen.queryByText('Unable to load matches.')).toBeNull();
  });
});

describe('Tournament Hub — TUX-03 GSK qualification result persistence (Phase 1)', () => {
  function renderAdmin() {
    return renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);
  }

  function gskTournament() {
    return { ...__state.enrichedTournament, format: 'group_stage_knockout' };
  }

  function gskStages() {
    return [
      {
        id: 5,
        progression_format: 'round_robin',
        config: {
          format: 'group_stage_knockout',
          groupStage: { groupCount: 2, participantsPerGroup: 2, qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } },
        },
      },
      { id: 6, progression_format: 'knockout', config: {} },
    ];
  }

  it('keeps the qualified rows visible after switching Competition sub-tabs and back', async () => {
    __state.adminApi.getTournament.mockResolvedValue(gskTournament());
    __state.adminApi.getStages.mockResolvedValue(gskStages());
    __state.adminApi.getMatches.mockResolvedValue([{ id: 1, stage_id: 5, status: 'completed' }]);
    __state.adminApi.qualifyGsk.mockResolvedValue({
      tournamentId: 1,
      stageId: 5,
      qualified: [
        { participantId: 10, qualificationRank: 1, qualificationType: 'group_position', groupRank: 1 },
        { participantId: 11, qualificationRank: 2, qualificationType: 'group_position', groupRank: 1 },
      ],
      totalQualified: 2,
    });
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.qualification' }));

    // Run qualification and render the authoritative server rows.
    fireEvent.click(screen.getByTestId('gsk-qualify-button'));
    expect(await screen.findByTestId('gsk-qualified')).toBeTruthy();
    expect(screen.getByText('#1 · 10')).toBeTruthy();
    expect(screen.getByText('#2 · 11')).toBeTruthy();
    expect(__state.adminApi.qualifyGsk).toHaveBeenCalledTimes(1);

    // Switch away from Qualification, then back — the result must survive the
    // unmount of GskQualificationView because it now lives at the hub.
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.knockout' }));
    await screen.findByTestId('gsk-knockout');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.qualification' }));

    expect(await screen.findByTestId('gsk-qualified')).toBeTruthy();
    expect(screen.getByText('#1 · 10')).toBeTruthy();
    expect(screen.getByText('#2 · 11')).toBeTruthy();
    // The server result is reused, not recomputed.
    expect(__state.adminApi.qualifyGsk).toHaveBeenCalledTimes(1);
  });
});

describe('Tournament Hub — TUX-05 status badge contrast', () => {
  function renderAdmin() {
    return renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);
  }

  it('renders the disqualified registration badge with a readable foreground (not bg==fg)', async () => {
    // gray-100 and gray-700 BOTH resolve to var(--color-border), so the old
    // `text-gray-700` disqualified pill was invisible on its `bg-gray-100`
    // background. gray-600 resolves to var(--color-text) — theme-safe.
    __state.adminApi.getRegistrations.mockResolvedValue([
      { id: 1, player_id: 10, player_name: 'Ali', status: 'registered' },
      { id: 4, player_id: 13, player_name: 'Lina', status: 'disqualified' },
    ]);
    const { container } = renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.participants' }));
    await screen.findByText('tournaments.reg_status.disqualified');

    const pill = Array.from(container.querySelectorAll<HTMLElement>('span'))
      .find((el) => el.textContent === 'tournaments.reg_status.disqualified');
    expect(pill).toBeTruthy();
    expect(pill!.className).toContain('text-gray-600');
    expect(pill!.className).not.toContain('text-gray-700');
  });
});

describe('Tournament Hub — R2-b competition-aware prizes (Finances tab)', () => {
  // The i18n mock returns the KEY for t(); Retry buttons therefore render 'common.retry'.
  const RETRY = 'common.retry';

  const DUAL_COMPETITIONS = [
    { id: 10, name: 'Singles', is_default: 1 },
    { id: 11, name: 'Doubles', is_default: 0 },
  ];

  function tournamentWithPrizes() {
    return {
      ...__state.enrichedTournament,
      currency_code: 'EGP',
      prizes: [
        { id: 1, placement: 1, competition_id: 10, prize_type: 'cash', amount: 10000, currency_code: 'EGP', display_order: 0 },
        { id: 2, placement: 2, competition_id: 11, prize_type: 'silver', description: 'Silver medal', display_order: 1 },
      ],
    };
  }

  function renderAdmin() {
    return renderPage('/admin/tournament/list/1', '/admin/tournament/list/:id', <TournamentDetailPage mode="admin" />);
  }
  function renderOrg() {
    return renderPage('/org/6/tournaments/1', '/org/:orgId/tournaments/:id', <TournamentDetailPage mode="org" orgId="6" />);
  }

  it('admin: renders the prizes card and saves the full collection preserving competition_id', async () => {
    __state.adminApi.getTournament.mockResolvedValue(tournamentWithPrizes());
    __state.adminApi.listCompetitions.mockResolvedValue(DUAL_COMPETITIONS);
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.finances' }));

    expect(await screen.findByTestId('tournament-prizes-card')).toBeTruthy();
    // Scope selector appears only when >1 competition exists.
    expect(await screen.findByLabelText('Prize #1 competition')).toBeTruthy();

    const getCallsBefore = __state.adminApi.getTournament.mock.calls.length;
    fireEvent.click(screen.getByTestId('prizes-save'));

    await waitFor(() => expect(__state.adminApi.updateTournament).toHaveBeenCalledTimes(1));
    const [id, payload] = __state.adminApi.updateTournament.mock.calls[0];
    expect(id).toBe(1);
    expect(payload.prizes).toHaveLength(2);
    // Cash prize keeps its competition scope + amount; currency is server-resolved (omitted).
    expect(payload.prizes[0]).toMatchObject({ placement: 1, competition_id: 10, prize_type: 'cash', amount: 10000 });
    expect(payload.prizes[0].currency_code).toBeUndefined();
    // Non-cash prize keeps its scope/description and never sends amount/currency.
    expect(payload.prizes[1]).toMatchObject({ placement: 2, competition_id: 11, prize_type: 'silver', description: 'Silver medal' });
    expect(payload.prizes[1].amount).toBeUndefined();
    expect(payload.prizes[1].currency_code).toBeUndefined();

    // Success toast + cache invalidation (active tournament query refetches).
    expect(__state.toast.showToast).toHaveBeenCalledWith('tournaments.prizes.saved', 'success');
    await waitFor(() => expect(__state.adminApi.getTournament.mock.calls.length).toBeGreaterThan(getCallsBefore));
  });

  it('org: loads competitions via orgTournamentApi and saves through the org update endpoint', async () => {
    __state.orgApi.getTournament.mockResolvedValue(tournamentWithPrizes());
    __state.orgApi.listCompetitions.mockResolvedValue(DUAL_COMPETITIONS);
    renderOrg();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.finances' }));

    expect(await screen.findByTestId('tournament-prizes-card')).toBeTruthy();
    expect(__state.orgApi.listCompetitions).toHaveBeenCalledWith('6', 1);
    // Wait until categories have loaded (Save is disabled while the query is pending).
    expect(await screen.findByLabelText('Prize #1 competition')).toBeTruthy();

    fireEvent.click(screen.getByTestId('prizes-save'));
    await waitFor(() => expect(__state.orgApi.updateTournament).toHaveBeenCalledTimes(1));
    const [orgIdArg, idArg, payload] = __state.orgApi.updateTournament.mock.calls[0];
    expect(orgIdArg).toBe('6');
    expect(idArg).toBe(1);
    expect(payload.prizes).toHaveLength(2);
    expect(payload.prizes[1].competition_id).toBe(11);
    expect(__state.adminApi.updateTournament).not.toHaveBeenCalled();
  });

  it('permission denial: without the update permission the prizes card is not rendered', async () => {
    __state.userPermissions = ['admin-tournaments.view', 'financial.reconcile'];
    __state.adminApi.getTournament.mockResolvedValue(tournamentWithPrizes());
    __state.adminApi.listCompetitions.mockResolvedValue(DUAL_COMPETITIONS);
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.finances' }));

    // The read-only finances surface still renders…
    expect(await screen.findByText('tournaments.finances')).toBeTruthy();
    // …but the prize editor/save are denied.
    expect(screen.queryByTestId('tournament-prizes-card')).toBeNull();
    expect(screen.queryByTestId('prizes-save')).toBeNull();
  });

  it('competition load failure fails closed: error + retry, no save, no write', async () => {
    __state.adminApi.getTournament.mockResolvedValue(tournamentWithPrizes());
    __state.adminApi.listCompetitions.mockRejectedValue(new Error('Network Error'));
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.finances' }));

    expect(await screen.findByTestId('prizes-competitions-error')).toBeTruthy();
    expect(screen.getByText('tournaments.prizes.competitions_error')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
    expect(screen.queryByTestId('prizes-save')).toBeNull();
    expect(__state.adminApi.updateTournament).not.toHaveBeenCalled();
  });

  it('competition load failure recovers via Retry and restores the editor', async () => {
    __state.adminApi.getTournament.mockResolvedValue(tournamentWithPrizes());
    __state.adminApi.listCompetitions
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue(DUAL_COMPETITIONS);
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.finances' }));

    expect(await screen.findByTestId('prizes-competitions-error')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));

    expect(await screen.findByTestId('prizes-save')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('prizes-competitions-error')).toBeNull());
  });

  it('single competition: no scope selector is rendered (legacy editor behavior preserved)', async () => {
    __state.adminApi.getTournament.mockResolvedValue(tournamentWithPrizes());
    __state.adminApi.listCompetitions.mockResolvedValue([{ id: 10, name: 'Singles', is_default: 1 }]);
    renderAdmin();
    await screen.findByText('Padel Test Tournament');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.finances' }));

    expect(await screen.findByTestId('tournament-prizes-card')).toBeTruthy();
    expect(screen.queryByLabelText('Prize #1 competition')).toBeNull();
  });
});
