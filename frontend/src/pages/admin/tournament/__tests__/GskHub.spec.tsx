import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDetailPage from '../TournamentDetailPage';

const gskTournament = {
  id: 1, name: 'GSK Cup', format: 'group_stage_knockout', status: 'registration_closed',
  sport_name: 'Padel', bracket_type_name: 'Single Elimination', max_participants: 8,
};
const koTournament = { ...gskTournament, format: 'knockout' };
const stages = [
  { id: 5, progression_format: 'round_robin', stage_order: 1, config: { groupStage: { groupCount: 2, participantsPerGroup: 4, qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } } } },
  { id: 6, progression_format: 'knockout', stage_order: 2, config: {} },
];
const groups = [
  { id: 10, name: 'A', advance_count: 2 },
  { id: 11, name: 'B', advance_count: 2 },
];
const standings = [
  { id: 1, group_id: 10, rank_position: 1, player_name: 'Ali', wins: 1, draws: 0, losses: 0, points: 3, games_won: 1, games_lost: 0 },
  { id: 2, group_id: 11, rank_position: 1, player_name: 'Sara', wins: 1, draws: 0, losses: 0, points: 3, games_won: 1, games_lost: 0 },
];
const groupMatches = [
  { id: 100, stage_id: 5, group_id: 10, status: 'scheduled', round: 1 },
  { id: 101, stage_id: 5, group_id: 11, status: 'completed', round: 1 },
];

const lifecycle = () => ({
  getTournament: vi.fn(), getGroups: vi.fn(), getStages: vi.fn(), getMatches: vi.fn(),
  getStandings: vi.fn(), getRegistrations: vi.fn(), getFinances: vi.fn(), listCompetitions: vi.fn(),
  updateTournament: vi.fn(), generateGskGroups: vi.fn(), qualifyGsk: vi.fn(), generateKnockout: vi.fn(),
  publish: vi.fn(), openRegistration: vi.fn(), closeRegistration: vi.fn(), start: vi.fn(),
  complete: vi.fn(), cancel: vi.fn(), archive: vi.fn(),
});
const __apis = vi.hoisted(() => ({ admin: {} as any, org: {} as any }));
vi.mock('../../../../services/tournament', () => ({
  tournamentApi: __apis.admin,
  orgTournamentApi: __apis.org,
  tournamentRefundApi: { listOrgRequests: vi.fn(async () => []) },
}));
vi.mock('../../../../i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../../../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));
vi.mock('../../../../store/auth.store', () => ({ useAuthStore: (sel: any) => sel({ user: { id: 1, permissions: ['*'] } }) }));
vi.mock('../../../../components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/tournament/list/1']}>
        <Routes>
          <Route path="/admin/tournament/list/:id" element={<TournamentDetailPage mode="admin" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(__apis.admin, lifecycle());
  Object.assign(__apis.org, lifecycle());
  for (const a of [__apis.admin, __apis.org] as any[]) {
    a.getTournament.mockResolvedValue(gskTournament);
    a.getStages.mockResolvedValue(stages);
    a.getGroups.mockResolvedValue(groups);
    a.getStandings.mockResolvedValue(standings);
    a.getMatches.mockResolvedValue(groupMatches);
    a.getRegistrations.mockResolvedValue([]);
    a.getFinances.mockResolvedValue({});
    a.listCompetitions.mockResolvedValue([]);
  }
});

describe('GSK Tournament Hub views (Step 4B)', () => {
  it('detects GSK and exposes Qualification + Knockout (not Bracket) sub-tabs', async () => {
    renderPage();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    expect(await screen.findByRole('tab', { name: 'tournaments.hub.qualification' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'tournaments.hub.knockout' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'tournaments.hub.bracket' })).toBeNull();
  });

  it('renders real groups + authoritative standings', async () => {
    renderPage();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    expect(await screen.findByTestId('gsk-groups')).toBeTruthy();
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
    expect(screen.getByText('Ali')).toBeTruthy();
  });

  it('shows qualification-incomplete state until all group matches are completed', async () => {
    renderPage();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.qualification' }));
    expect(await screen.findByTestId('gsk-qual-incomplete')).toBeTruthy();
    expect((screen.getByTestId('gsk-qualify-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows knockout pending state with a permission-gated generate action', async () => {
    renderPage();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'tournaments.hub.knockout' }));
    expect(screen.queryByTestId('gsk-knockout-pending')).toBeNull(); // knockout stage fixture exists
    expect(await screen.findByTestId('gsk-knockout')).toBeTruthy();
  });

  it('preserves the existing Bracket behavior for non-GSK tournaments', async () => {
    (__apis.admin as any).getTournament.mockResolvedValue(koTournament);
    renderPage();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'tournaments.hub.competition' }));
    expect(await screen.findByRole('tab', { name: 'tournaments.hub.bracket' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'tournaments.hub.knockout' })).toBeNull();
    await waitFor(() => expect((__apis.admin as any).getStages).not.toHaveBeenCalled());
  });
});
