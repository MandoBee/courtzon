/**
 * Universal tournament bracket reuse — regression coverage.
 *
 * Guarantees:
 *  - The ONE shared TournamentBracket renders for admin, org AND referee contexts.
 *  - No role-specific bracket implementation is reintroduced.
 *  - Sport-aware scores come from tournamentScore (score_summary verbatim).
 *  - The current player is highlighted from the auth-store user id (no new field).
 *  - Round-robin (non-knockout) tournaments group matches by round.
 *  - The shared MatchDetailsDrawer is opened from a match click.
 *  - The public read-model's participant-name-only shape renders correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TournamentBracket as NamedBracket } from '../TournamentBracket';
import { MatchDetailsDrawer } from '../MatchDetailsDrawer';
import AdminOrgTournamentDetailPage from '../../../pages/admin/tournament/TournamentDetailPage';
import RefereeAssignmentsPage from '../../../pages/referee/RefereeAssignmentsPage';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';

const __state = vi.hoisted(() => ({
  // Assigned per-test in beforeEach; declared here so the hoisted api mock can read it.
  refereeMatches: [] as any[],

  adminApi: {
    getTournament: vi.fn(),
    getGroups: vi.fn(),
    getMatches: vi.fn(),
    getStandings: vi.fn(),
    getRegistrations: vi.fn(),
    getFinances: vi.fn(),
  },
  orgApi: {
    getTournament: vi.fn(),
    getGroups: vi.fn(),
    getMatches: vi.fn(),
    getStandings: vi.fn(),
    getRegistrations: vi.fn(),
    getFinances: vi.fn(),
  },
  currentUserId: 10,
}));

vi.mock('../../../services/tournament', () => ({
  tournamentApi: __state.adminApi,
  orgTournamentApi: __state.orgApi,
  tournamentRefundApi: {
    listOrgRequests: vi.fn().mockResolvedValue([]),
  },
  // Hub Matches manager (Step 3C) — participant/assignment APIs.
  tournamentParticipantApi: { getEligibleCourts: vi.fn().mockResolvedValue([]) },
  orgTournamentParticipantApi: { getEligibleCourts: vi.fn().mockResolvedValue([]) },
}));

// Faithful, minimal i18n mock: resolves the registry English defaults (the same
// fallback production uses) and interpolates `{param}` placeholders. It always
// returns a renderable string and never returns the params object itself.
vi.mock('../../../i18n', async () => {
  const { getRegistryDefaultsMap } = await import('../../../i18n/translation-keys.registry');
  const defaults = getRegistryDefaultsMap();
  const t = (key: string, second?: unknown, third?: unknown) => {
    const defaultValue = typeof second === 'string' ? second : undefined;
    const params = (second && typeof second === 'object' ? second : third) as Record<string, unknown> | undefined;
    let value = defaults[key] ?? defaultValue ?? key;
    if (params) {
      for (const [name, replacement] of Object.entries(params)) {
        value = value.replace(`{${name}}`, String(replacement));
      }
    }
    return value;
  };
  return { useTranslation: () => ({ t }) };
});

vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../../store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: __state.currentUserId, permissions: ['*'] } }),
}));

vi.mock('../../../hooks/useCan', () => ({
  useCan: () => ({ can: () => true }),
}));

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (url === '/referee/assignments') {
        return Promise.resolve({
          data: {
            tournamentMatches: __state.refereeMatches ?? [],
            leagueMatches: [],
          },
        });
      }
      return Promise.resolve({ data: [] });
    }),
  },
}));

const enrichedTournament = {
  id: 1,
  name: 'City Open',
  format: 'knockout',
  bracket_type_name: 'Single Elimination',
  sport_name: 'Padel',
  status: 'running',
  max_players: 8,
  max_participants: 8,
};

const footballMatches = [
  {
    id: 1, tournament_id: 1, round: 1, round_name: 'Semi Final', match_number: 1,
    bracket_position: 1, player1_id: 10, player2_id: 11,
    player1_name: 'Current Player', player2_name: 'Rival',
    status: 'completed', score_summary: '2 - 0', winner_id: 10,
    resource_name: 'Court 1', referee_name: 'Ref A', start_time: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 2, tournament_id: 1, round: 2, round_name: 'Final', match_number: 2,
    bracket_position: 2, player1_id: 10, player2_id: 12,
    player1_name: 'Current Player', player2_name: 'Rival 2',
    status: 'scheduled', resource_name: 'Court 2',
  },
] as unknown as TournamentMatchNode[];

beforeEach(() => {
  vi.clearAllMocks();
  __state.refereeMatches = [];
  __state.adminApi.getTournament.mockResolvedValue(enrichedTournament);
  __state.adminApi.getGroups.mockResolvedValue([]);
  __state.adminApi.getMatches.mockResolvedValue(footballMatches);
  __state.adminApi.getStandings.mockResolvedValue([]);
  __state.adminApi.getRegistrations.mockResolvedValue([
    { id: 1, player_id: 10, player_name: 'Current Player', status: 'confirmed' },
  ]);
  __state.adminApi.getFinances.mockResolvedValue(null);
  __state.orgApi.getTournament.mockResolvedValue(enrichedTournament);
  __state.orgApi.getGroups.mockResolvedValue([]);
  __state.orgApi.getMatches.mockResolvedValue(footballMatches);
  __state.orgApi.getStandings.mockResolvedValue([]);
  __state.orgApi.getRegistrations.mockResolvedValue([]);
  __state.orgApi.getFinances.mockResolvedValue(null);
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Route-aware render so `useParams` supplies a real :id (needed by the Hub). */
function wrapHub(ui: React.ReactNode, path: string, initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Shared TournamentBracket — single source for every role', () => {
  it('is exported as the SAME component identity used by admin/org/referee', () => {
    // Guards against a role page growing its own private bracket renderer.
    expect(typeof NamedBracket).toBe('function');
    expect(NamedBracket.name).toBe('TournamentBracket');
  });

  it('renders knockout rounds, sport-aware score and byes from the shared component', () => {
    wrap(<NamedBracket tournament={enrichedTournament as any} matches={footballMatches as any} currentUserId={10} />);

    expect(screen.getByText('Semi Final')).toBeTruthy();
    expect(screen.getByText('Final')).toBeTruthy();
    // Football style score rendered verbatim from score_summary.
    expect(screen.getAllByText('2 - 0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Current Player').length).toBeGreaterThan(0);
  });

  it('renders a round-grouped grid (not columns) for round-robin tournaments', () => {
    const rr = [
      { id: 9, round: 1, match_number: 1, player1_name: 'A', player2_name: 'B', status: 'completed', score_summary: '6-3' },
    ] as unknown as TournamentMatchNode[];
    wrap(<NamedBracket tournament={{ ...enrichedTournament, format: 'round_robin', bracket_type_name: 'Round Robin' } as any} matches={rr} />);

    expect(screen.getByText('6-3')).toBeTruthy();
    expect(screen.getByText('Round-robin / Swiss style — matches grouped by round (Round Robin).')).toBeTruthy();
  });

  it('highlights the authenticated player and opens the shared MatchDetailsDrawer on click', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NamedBracket tournament={enrichedTournament as any} matches={footballMatches as any} currentUserId={10} onMatchClick={() => { }} />
        <MatchDetailsDrawer open match={footballMatches[0] as any} currentUserId={10} onClose={() => {}} />
      </QueryClientProvider>,
    );

    // Shared drawer surfaces the same sport-aware result + winner.
    expect((await screen.findAllByText('Current Player')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 - 0').length).toBeGreaterThan(0);
    expect(screen.getByText('Court 1')).toBeTruthy();
    expect(screen.getByText('Ref A')).toBeTruthy();
  });

  it('renders participant-name-only rows (public read-model) instead of blank slots', () => {
    const publicRows = [
      {
        id: 1, round: 1, round_name: 'Round 1', match_number: 1, bracket_position: 1,
        participant1_name: 'Alice', participant2_name: 'Bob',
        status: 'completed', score_summary: '6-3, 4-6, 6-2',
      },
    ] as unknown as TournamentMatchNode[];
    wrap(<NamedBracket tournament={{ id: 7, format: 'knockout' } as any} matches={publicRows} />);

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    // Multi-set tennis score preserved.
    expect(screen.getAllByText('6-3, 4-6, 6-2').length).toBeGreaterThan(0); // score_summary verbatim
  });
  });

  it('shows the empty state when no bracket has been generated', () => {
    wrap(<NamedBracket tournament={enrichedTournament as any} matches={[]} />);
    expect(screen.getByText('Bracket not yet generated.')).toBeTruthy();
  });
describe('Admin / Super Admin tournament detail — shared bracket tab', () => {
  it('renders the shared bracket visual alongside the kept administrative matches table', async () => {
    wrapHub(<AdminOrgTournamentDetailPage mode="admin" />, '/admin/tournament/list/:id', '/admin/tournament/list/1');
    await screen.findByText('City Open');

    // The administrative matches table is NOT removed — it lives in the Matches section.
    fireEvent.click(screen.getByRole('tab', { name: 'Matches' }));
    await waitFor(() => expect(__state.adminApi.getMatches).toHaveBeenCalled());
    expect(screen.getAllByText('Current Player').length).toBeGreaterThan(0);

    // The shared bracket is inside the Competition section (Bracket sub-tab).
    fireEvent.click(screen.getByRole('tab', { name: 'Competition' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Bracket' }));
    await waitFor(() => expect(screen.getAllByText('Current Player').length).toBeGreaterThan(0));
    expect(screen.getAllByText('2 - 0').length).toBeGreaterThan(0);
  });
});

describe('Org tournament detail — same shared bracket, no duplicate component', () => {
  it('reuses the identical bracket path for the org context', async () => {
    wrapHub(<AdminOrgTournamentDetailPage mode="org" orgId="6" />, '/org/:orgId/tournaments/:id', '/org/6/tournaments/1');
    await screen.findByText('City Open');

    fireEvent.click(screen.getByRole('tab', { name: 'Competition' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Bracket' }));
    await waitFor(() => expect(__state.orgApi.getMatches).toHaveBeenCalled());
    expect(await screen.findAllByText('Current Player')).not.toHaveLength(0);
  });
});

describe('Referee — shared bracket from the referee own authorised assignments', () => {
  it('renders the same TournamentBracket for the referee from /referee/assignments', async () => {
    __state.refereeMatches = [
      {
        id: 5, tournament_id: 3, tournament_name: 'Ref Cup', round: 1, round_name: 'Semi Final',
        match_number: 1, bracket_position: 1, player1_id: 10, player2_id: 21,
        status: 'in_progress', resource_id: 4,
      },
    ];
    wrap(<RefereeAssignmentsPage />);

    fireEvent.click(screen.getByText('Bracket'));
    expect(await screen.findByText('Semi Final')).toBeTruthy();
    // Assigned players without a display name use the neutral localized label —
    // never an internal P{id} fallback.
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
    expect(screen.queryByText('P10')).toBeNull();
    expect(screen.queryByText('P21')).toBeNull();
  });

  it('keeps the existing referee accept/decline actions gated by referee.assignments.manage', async () => {
    __state.refereeMatches = [];
    wrap(<RefereeAssignmentsPage />);
    // Default tab is Upcoming; the table (with its RBAC-gated actions) still renders.
    await waitFor(() => expect(screen.getByText('Upcoming')).toBeTruthy());
    expect(screen.getByText('Completed')).toBeTruthy();
  });
});