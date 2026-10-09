import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDetailPage from '../TournamentDetailPage';
import PublicTournamentDetailPage from '../../player/PublicTournamentDetailPage';
import { GskQualificationPanel } from '../../../components/tournaments/hub/GskCompetitionViews';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  user: { id: 42 } as any,
  gsk: { format: 'group_stage_knockout' } as any,
  ko: { format: 'knockout' } as any,
}));

const gskTournament = {
  id: 1, name: 'GSK Cup', status: 'in_progress', format: 'group_stage_knockout',
  sport_name: 'Padel', bracket_type_name: 'Single Elimination', organisation_name: 'Padel Edge',
  max_participants: 8, entry_fee: 0, currency_code: 'EGP', prizes: [],
};
const koTournament = { ...gskTournament, format: 'knockout' };

const groups = [
  { id: 10, name: 'A', advance_count: 2 },
  { id: 11, name: 'B', advance_count: 2 },
];
const stages = [
  { id: 5, progression_format: 'round_robin', config: { groupStage: { groupCount: 2, participantsPerGroup: 2, qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } } } },
  { id: 6, progression_format: 'knockout', config: {} },
];
const matches = [
  { id: 100, stage_id: 5, group_id: 10, round: 1, round_name: 'Round 1', bracket_position: 0, match_number: 1, player1_id: 42, player1_name: 'Ali', player2_id: 43, player2_name: 'Sara', status: 'completed', score_summary: '6-4', match_id: 900 },
  { id: 101, stage_id: 5, group_id: 11, round: 1, round_name: 'Round 1', bracket_position: 0, match_number: 1, player1_name: 'Nour', player2_name: 'Hana', status: 'completed', match_id: 901 },
  { id: 200, stage_id: 6, group_id: null, round: 1, round_name: 'Semi-final', bracket_position: 0, match_number: 1, player1_name: 'Ali', player2_name: 'Nour', status: 'scheduled', match_id: 902 },
];
const standings = [
  { id: 1, group_id: 10, registration_id: 10, rank_position: 1, player_name: 'Ali', points: 3, wins: 1, losses: 0, draws: 0, games_won: 2, games_lost: 0 },
  { id: 2, group_id: 10, registration_id: 11, rank_position: 2, player_name: 'Sara', points: 0, wins: 0, losses: 1, draws: 0, games_won: 0, games_lost: 2 },
  { id: 3, group_id: 11, registration_id: 12, rank_position: 1, player_name: 'Nour', points: 3, wins: 1, losses: 0, draws: 0, games_won: 2, games_lost: 0 },
];
const participants = [
  { id: 10, player_id: 42, player_name: 'Ali', registration_id: 10, seed_rank: 1, status: 'registered' },
  { id: 11, player_id: 43, player_name: 'Sara', registration_id: 11, seed_rank: 2, status: 'registered' },
  { id: 12, player_id: 44, player_name: 'Nour', registration_id: 12, seed_rank: 3, status: 'registered' },
];
const publicShape = {
  id: 1, name: 'GSK Cup', format: 'group_stage_knockout', status: 'in_progress', is_public: 1,
  bracket_type: 'Single Elimination', sport: { name: 'Padel' }, venue: null,
  start_date: null, end_date: null, registration_opens: null, registration_closes: null, max_participants: 8,
  groups: [
    { id: 10, name: 'A' },
    { id: 11, name: 'B' },
  ],
  stages: [
    { id: 5, name: 'Group Stage', stage_order: 1, progression_format: 'round_robin', config: { groupStage: { groupCount: 2, participantsPerGroup: 2, qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } } } },
    { id: 6, name: 'Knockout', stage_order: 2, progression_format: 'knockout', config: { knockout: { startingRound: 'semifinals' } } },
  ],
  bracket: [
    { round: 1, round_name: 'Round 1', match_number: 1, bracket_position: 0, stage_id: 5, group_id: 10, participant1_name: 'Ali', participant2_name: 'Sara', status: 'completed', score_summary: '6-4', start_time: null, progression_state: null },
    { round: 1, round_name: 'Round 1', match_number: 1, bracket_position: 0, stage_id: 5, group_id: 11, participant1_name: 'Nour', participant2_name: 'Hana', status: 'completed', score_summary: '6-3', start_time: null, progression_state: null },
    { round: 1, round_name: 'Semi-final', match_number: 1, bracket_position: 0, stage_id: 6, group_id: null, participant1_name: 'Ali', participant2_name: 'Nour', status: 'scheduled', score_summary: null, start_time: null, progression_state: null },
  ],
  standings: [
    { rank_position: 1, group_id: 10, player_name: 'Ali', points: 3, wins: 1, losses: 0, draws: 0, games_won: 1, games_lost: 0 },
    { rank_position: 2, group_id: 10, player_name: 'Sara', points: 0, wins: 0, losses: 1, draws: 0, games_won: 0, games_lost: 1 },
    { rank_position: 1, group_id: 11, player_name: 'Nour', points: 3, wins: 1, losses: 0, draws: 0, games_won: 1, games_lost: 0 },
  ],
};

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn().mockResolvedValue({ data: {} }) },
}));
vi.mock('../../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string, d?: any, opts?: any) => {
      let s = typeof d === 'string' ? d : k;
      const params = (d && typeof d === 'object') ? d : opts;
      if (params && typeof params === 'object') {
        for (const [key, val] of Object.entries(params)) {
          s = s.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
        }
      }
      return s;
    },
  }),
}));
vi.mock('../../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../store/auth.store', () => ({ useAuthStore: (sel: any) => sel({ user: __state.user }) }));

import api from '../../../services/api';

/**
 * Stub the player/public API reads. `rejectFirstUrls` (optional) makes the
 * matched URL reject on its FIRST call only — subsequent calls fall through to
 * the real fixture, which is exactly the shape a Retry recovery takes.
 */
function mockApi(format: any = __state.gsk, rejectFirstUrls: string[] = []) {
  const tournament = format.format === 'group_stage_knockout' ? gskTournament : koTournament;
  (api.get as any).mockImplementation((url: string) => {
    if (rejectFirstUrls.includes(url)) {
      const idx = rejectFirstUrls.indexOf(url);
      rejectFirstUrls.splice(idx, 1);
      return Promise.reject(new Error('Network Error'));
    }
    if (url === '/tournaments/1') return Promise.resolve({ data: { data: tournament } });
    if (url === '/tournaments/1/competitions') return Promise.resolve({ data: { data: [] } });
    if (url === '/tournaments/1/matches') return Promise.resolve({ data: { data: matches } });
    if (url === '/tournaments/1/standings') return Promise.resolve({ data: { data: standings } });
    if (url === '/tournaments/1/participants') return Promise.resolve({ data: { data: participants } });
    if (url === '/admin/tournaments/1/groups') return Promise.resolve({ data: groups });
    if (url === '/admin/tournaments/1/stages') return Promise.resolve({ data: { data: stages } });
    if (url === '/public/tournaments/1') return Promise.resolve({ data: { data: publicShape } });
    return Promise.resolve({ data: {} });
  });
}

function renderPlayer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tournaments/1']}>
        <Routes>
          <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPublic() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tournaments/public/1']}>
        <Routes>
          <Route path="/tournaments/public/:id" element={<PublicTournamentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function clickTab(label: string) {
  const tab = screen.getAllByText(label).find((el) => el.tagName === 'BUTTON') ?? screen.getByText(label);
  fireEvent.click(tab);
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.userPermissions = ['*'];
  __state.user = { id: 42, permissions: ['*'] };
  mockApi();
});

describe('Step 4C — Player GSK views (read-only)', () => {
  it('detects GSK and exposes Groups / Qualification / Knockout tabs (not Bracket)', async () => {
    renderPlayer();
    await screen.findByText('GSK Cup');
    expect(screen.getByText('Groups')).toBeTruthy();
    expect(screen.getByText('Qualification')).toBeTruthy();
    expect(screen.getByText('Knockout')).toBeTruthy();
    expect(screen.queryByText('Bracket')).toBeNull();
  });

  it('renders real groups with authoritative per-group standings', async () => {
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Groups');
    expect(await screen.findByTestId('gsk-groups')).toBeTruthy();
    expect(screen.getByText('Ali')).toBeTruthy();
    expect(screen.getAllByText('Nour').length).toBeGreaterThan(0);
  });

  it('highlights the current player row without colour-only signalling', async () => {
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Groups');
    const badge = await screen.findByTestId('gsk-current-player');
    expect(badge).toBeTruthy();
    const row = badge.closest('tr') as HTMLElement;
    expect(row.getAttribute('data-current-player')).toBe('true');
    expect(row.getAttribute('aria-current')).toBe('true');
  });

  it('shows the qualification rule and an honest incomplete state (never fabricating qualifiers)', async () => {
    // One group match incomplete → qualification cannot be computed.
    const original = matches[0].status;
    matches[0].status = 'scheduled';
    mockApi();
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Qualification');
    expect(await screen.findByTestId('gsk-qual-incomplete')).toBeTruthy();
    expect(screen.queryByTestId('gsk-qualified')).toBeNull();
    matches[0].status = original;
  });

  it('renders the ONE shared TournamentBracket for the knockout stage', async () => {
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Knockout');
    expect(await screen.findByTestId('gsk-knockout')).toBeTruthy();
    expect(screen.getAllByText('Semi-final').length).toBeGreaterThan(0);
  });

  it('opens the existing MatchDetailsDrawer when a knockout match is clicked', async () => {
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Knockout');
    const ko = await screen.findByTestId('gsk-knockout');
    const btn = within(ko).getAllByRole('button')[0];
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  it('never exposes organizer mutation actions to the player', async () => {
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Groups');
    await screen.findByTestId('gsk-groups');
    clickTab('Qualification');
    await screen.findByTestId('gsk-qualification');
    clickTab('Knockout');
    await screen.findByTestId('gsk-knockout');
    expect(screen.queryByText('Generate Groups')).toBeNull();
    expect(screen.queryByText('Run Qualification')).toBeNull();
    expect(screen.queryByText('Generate Knockout')).toBeNull();
  });
});

describe('Step 4C — shared read-only qualification panel', () => {
  it('renders the configured rule and the pending state when no group stage exists', () => {
    render(<GskQualificationPanel groupStage={null} groupMatches={[]} />);
    expect(screen.getByTestId('gsk-qual-pending')).toBeTruthy();
  });

  it('renders qualified participants when the data is available', () => {
    render(
      <GskQualificationPanel
        groupStage={stages[0]}
        groupMatches={matches.filter((m) => m.stage_id === 5)}
        qualified={[
          { participantId: 42, qualificationRank: 1, qualificationType: 'group_winner', groupRank: 1 },
          { participantId: 44, qualificationRank: 2, qualificationType: 'runner_up', groupRank: 2 },
        ]}
      />,
    );
    expect(screen.getByTestId('gsk-qualified')).toBeTruthy();
    expect(screen.getAllByText(/group_winner/).length).toBeGreaterThan(0);
  });
});

describe('Step 4E — Public GSK UI (unauthenticated, read-only)', () => {
  it('detects GSK and exposes the read-only navigation tabs with no organizer controls', async () => {
    renderPublic();
    await screen.findByText('GSK Cup');
    for (const label of ['Overview', 'Matches', 'Groups', 'Qualification', 'Knockout', 'Standings']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    }
    expect(screen.queryByText('Generate Groups')).toBeNull();
    expect(screen.queryByText('Run Qualification')).toBeNull();
    expect(screen.queryByText('Generate Knockout')).toBeNull();
  });

  it('renders groups from the public groups[] with standings filtered by standings[].group_id', async () => {
    renderPublic();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Groups' }));
    expect(await screen.findByTestId('gsk-groups')).toBeTruthy();
    // Group A → Ali + Sara; Group B → Nour (filtered by group_id, not inferred).
    expect(screen.getByText('Ali')).toBeTruthy();
    expect(screen.getByText('Sara')).toBeTruthy();
    expect(screen.getByText('Nour')).toBeTruthy();
  });

  it('shows an honest empty state when no groups exist', async () => {
    (publicShape as any).groups = [];
    mockApi();
    renderPublic();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Groups' }));
    expect(await screen.findByTestId('gsk-groups-empty')).toBeTruthy();
    (publicShape as any).groups = [{ id: 10, name: 'A' }, { id: 11, name: 'B' }];
  });

  it('groups group-stage matches using the explicit bracket group_id filter', async () => {
    renderPublic();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Matches' }));
    expect(await screen.findByTestId('public-gsk-group-filter')).toBeTruthy();
    // Filter to Group A → the Group B match (Hana) disappears; the Group A match remains.
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    await waitFor(() => expect(screen.queryByText('Hana')).toBeNull());
    expect(screen.getByText('Sara')).toBeTruthy();
    // "All" restores every match.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(await screen.findByText('Hana')).toBeTruthy();
  });

  it('renders the configured qualification rule and never fabricates a qualified list', async () => {
    renderPublic();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Qualification' }));
    expect(await screen.findByTestId('gsk-qualification')).toBeTruthy();
    expect(screen.getByText(/Top 2 per group/)).toBeTruthy();
    expect(screen.queryByTestId('gsk-qualified')).toBeNull();
  });

  it('shows an honest qualification pending state when there is no group stage', async () => {
    (publicShape as any).stages = publicShape.stages.filter((s: any) => s.progression_format !== 'round_robin');
    mockApi();
    renderPublic();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Qualification' }));
    expect(await screen.findByTestId('gsk-qual-pending')).toBeTruthy();
    (publicShape as any).stages = [
      { id: 5, name: 'Group Stage', stage_order: 1, progression_format: 'round_robin', config: { groupStage: { groupCount: 2, participantsPerGroup: 2, qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } } } },
      { id: 6, name: 'Knockout', stage_order: 2, progression_format: 'knockout', config: { knockout: { startingRound: 'semifinals' } } },
    ];
  });

  it('identifies the knockout stage via progression_format/stage_id and renders the shared bracket', async () => {
    renderPublic();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Knockout' }));
    expect(await screen.findByTestId('gsk-knockout')).toBeTruthy();
    expect(screen.getAllByText('Semi-final').length).toBeGreaterThan(0);
    // The Group B group-stage name must NOT appear in the knockout bracket.
    expect(screen.queryByText('Hana')).toBeNull();
  });

  it('shows a knockout pending state when no knockout stage exists', async () => {
    (publicShape as any).stages = publicShape.stages.filter((s: any) => s.progression_format !== 'knockout');
    mockApi();
    renderPublic();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Knockout' }));
    expect(await screen.findByTestId('gsk-knockout-pending')).toBeTruthy();
    (publicShape as any).stages = [
      { id: 5, name: 'Group Stage', stage_order: 1, progression_format: 'round_robin', config: { groupStage: { groupCount: 2, participantsPerGroup: 2, qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } } } },
      { id: 6, name: 'Knockout', stage_order: 2, progression_format: 'knockout', config: { knockout: { startingRound: 'semifinals' } } },
    ];
  });

  it('opens the shared MatchDetailsDrawer from a public match', async () => {
    renderPublic();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Knockout' }));
    const ko = await screen.findByTestId('gsk-knockout');
    fireEvent.click(within(ko).getAllByRole('button')[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  it('renders standings and exposes no admin/private data', async () => {
    renderPublic();
    await screen.findByText('GSK Cup');
    fireEvent.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(screen.getByTestId('public-standings-heading')).toBeTruthy();
    expect(screen.queryByText(/Fee:/)).toBeNull();
    expect(screen.queryByText(/Organisation:/)).toBeNull();
    expect(screen.queryByText('Padel Edge')).toBeNull();
  });
});

describe('Step 4C/4E — regression: non-GSK behaviour preserved', () => {
  it('player non-GSK keeps the Bracket tab and has no GSK tabs', async () => {
    mockApi(__state.ko);
    renderPlayer();
    await screen.findByText('GSK Cup');
    expect(screen.getByText('Bracket')).toBeTruthy();
    expect(screen.queryByText('Groups')).toBeNull();
    expect(screen.queryByText('Qualification')).toBeNull();
    expect(screen.queryByText('Knockout')).toBeNull();
  });

  it('public non-GSK keeps the "Bracket" heading', async () => {
    publicShape.format = 'knockout';
    mockApi();
    renderPublic();
    await screen.findByText('GSK Cup');
    expect(screen.getByTestId('public-bracket-heading').textContent).toBe('Bracket');
    publicShape.format = 'group_stage_knockout';
  });
});

describe('Step 4C — TUX-04 player GSK dependent sub-tab error handling', () => {
  const RETRY = 'common.retry';

  it('groups: rejected standings query shows error + Retry, never the unavailable per-group state', async () => {
    mockApi(__state.gsk, ['/tournaments/1/standings']);
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Groups');

    expect(await screen.findByText('Unable to load standings.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
    expect(screen.queryByTestId('gsk-groups')).toBeNull();
    expect(screen.queryByText('tournaments.hub.gsk.noStandings')).toBeNull();
  });

  it('groups: Retry recovers and renders the real per-group standings', async () => {
    mockApi(__state.gsk, ['/tournaments/1/standings']);
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Groups');

    expect(await screen.findByText('Unable to load standings.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));

    expect(await screen.findByTestId('gsk-groups')).toBeTruthy();
    expect(screen.queryByText('Unable to load standings.')).toBeNull();
    expect(screen.getByText('Ali')).toBeTruthy();
  });

  it('qualification: rejected matches query shows error + Retry, never the incomplete state', async () => {
    mockApi(__state.gsk, ['/tournaments/1/matches']);
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Qualification');

    expect(await screen.findByText('Unable to load matches.')).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY })).toBeTruthy();
    expect(screen.queryByTestId('gsk-qual-incomplete')).toBeNull();
  });

  it('qualification: Retry recovers and restores the qualification view', async () => {
    mockApi(__state.gsk, ['/tournaments/1/matches']);
    renderPlayer();
    await screen.findByText('GSK Cup');
    clickTab('Qualification');

    expect(await screen.findByText('Unable to load matches.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));

    expect(await screen.findByTestId('gsk-qualification')).toBeTruthy();
    expect(screen.queryByText('Unable to load matches.')).toBeNull();
    expect(screen.queryByTestId('gsk-qual-incomplete')).toBeNull();
  });
});
