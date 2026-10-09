import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDetailPage from '../TournamentDetailPage';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  user: { id: 42, permissions: ['*'] } as any,
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
    prizes: [] as any[],
    effective_registration_payment_methods: ['cash', 'card'] as string[],
  } as any,
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
          <Route path="/matches/:id/result" element={<div>RESULT_ENTRY_PAGE</div>} />
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
  __state.user = { id: 42, permissions: [...__state.userPermissions] };
  mockDetailApi();
});

/** Set the acting user's permissions (keeps $Can$ and `can()` in sync). */
function setPerms(perms: string[]) {
  __state.userPermissions = [...perms];
  __state.user = { id: 42, permissions: [...perms] };
}

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

  it('renders the draft status badge with a readable foreground (F-01 regression)', async () => {
    // gray-100 AND gray-700 both resolve to var(--color-border), so the old
    // `text-gray-700` draft badge was invisible on its `bg-gray-100` background.
    // gray-600 resolves to var(--color-text): readable in light and dark themes.
    __state.tournament = { ...__state.tournament, status: 'draft' };
    renderPage();

    await screen.findByText('Padel Open');
    const pill = screen.getByText('draft');
    expect(pill.className).toContain('text-gray-600');
    expect(pill.className).not.toContain('text-gray-700');

    // Restore the shared fixture default for the remaining tests.
    __state.tournament = { ...__state.tournament, status: 'registration_open' };
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

  it('legacy prize_description fallback — rendered when no structured prizes exist', async () => {
    __state.tournament = { ...__state.tournament, prizes: [] };
    mockDetailApi();

    renderPage();
    await screen.findByText('Padel Open');
    expect(screen.getAllByText(/Trophy \+ 5000 EGP/).length).toBeGreaterThan(0);
  });

  it('structured prizes take precedence over legacy prize_description', async () => {
    __state.tournament = {
      ...__state.tournament,
      prize_description: 'Trophy + 5000 EGP',
      prizes: [
        { id: 1, placement: 1, prize_type: 'cash', amount: 10000, currency_code: 'EGP', display_order: 0 },
        { id: 2, placement: 1, prize_type: 'gold', description: 'Gold medal', display_order: 1 },
        { id: 3, placement: null, prize_type: 'gift', description: 'Padel racket', display_order: 2 },
      ],
    };
    mockDetailApi();

    renderPage();
    await screen.findByText('Padel Open');
    // Structured display is primary.
    expect(screen.getAllByText(/1st Place/).length).toBeGreaterThan(0);
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('Gold Medal')).toBeTruthy();
    expect(screen.getByText('Gift')).toBeTruthy();
    // The legacy free-text is NOT shown as a duplicate when structured prizes exist.
    expect(screen.queryByText(/Trophy \+ 5000 EGP/)).toBeNull();
  });
});

describe('TournamentDetailPage — registration payment methods (Group 3)', () => {
  it('displays "Cash or Card / Online" when both methods are effective', async () => {
    __state.tournament = { ...__state.tournament, entry_fee: 800, effective_registration_payment_methods: ['cash', 'card'] };
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    expect(screen.getAllByText(/Cash or Card \/ Online/).length).toBeGreaterThan(0);
  });

  it('displays "Cash" for a cash-only tournament and NEVER shows Wallet', async () => {
    __state.tournament = { ...__state.tournament, entry_fee: 800, effective_registration_payment_methods: ['cash'] };
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    expect(screen.getAllByText('Cash').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Wallet/i)).toBeNull();
  });

  it('displays "Card / Online" for a card-only tournament', async () => {
    __state.tournament = { ...__state.tournament, entry_fee: 800, effective_registration_payment_methods: ['card'] };
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    expect(screen.getAllByText(/Card \/ Online/).length).toBeGreaterThan(0);
  });

  it('displays "Free" and offers no payment method for a free tournament', async () => {
    __state.tournament = { ...__state.tournament, entry_fee: 0, effective_registration_payment_methods: [] };
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
  });

  it('register modal shows ONLY the effective allowed methods (cash-only — no card, no wallet)', async () => {
    __state.user = { id: 99 }; // not a participant → the Register action is offered
    __state.tournament = { ...__state.tournament, status: 'registration_open', entry_fee: 800, effective_registration_payment_methods: ['cash'] };
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    fireEvent.click(screen.getByText('Register & Pay'));
    expect(await screen.findByText('Payment Method')).toBeTruthy();
    const radios = document.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(1);
    expect(screen.queryByText('Card / Online')).toBeNull();
    expect(screen.queryByText(/Wallet/i)).toBeNull();
  });

  it('register modal offers BOTH methods when both are effective, and submits the chosen method', async () => {
    __state.user = { id: 99 };
    __state.tournament = { ...__state.tournament, status: 'registration_open', entry_fee: 800, effective_registration_payment_methods: ['cash', 'card'] };
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    fireEvent.click(screen.getByText('Register & Pay'));
    await screen.findByText('Payment Method');
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(2);
    const cardRadio = Array.from(document.querySelectorAll('input[type="radio"]')).find((r) => (r as HTMLInputElement).value === 'card') as HTMLInputElement;
    fireEvent.click(cardRadio);
    // The modal submit button is the LAST "Register & Pay" element (the header one stays mounted).
    const submitButtons = screen.getAllByText('Register & Pay');
    fireEvent.click(submitButtons[submitButtons.length - 1]);
    await waitFor(() => expect((api.post as any).mock.calls.length).toBeGreaterThan(0));
    const payload = (api.post as any).mock.calls[0][1] as any;
    expect(payload.payment_method).toBe('card');
  });
});

describe('TournamentDetailPage — venue, map + daily playing window (Group 4)', () => {
  it('displays the venue name, address, map action and daily playing time', async () => {
    __state.tournament = {
      ...__state.tournament,
      daily_start_time: '09:00:00',
      daily_end_time: '21:00:00',
      sport_icon: '/icons/padel.png',
      venue: {
        branchId: 5, name: 'Padel Edge City', addressLine1: '12 Corniche', city: 'Dubai',
        latitude: 25.2048, longitude: 55.2708, mapsUrl: 'https://www.google.com/maps/search/?api=1&query=25.2048,55.2708',
      },
    };
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    expect(screen.getAllByText('Padel Edge City').length).toBeGreaterThan(0);
    expect(screen.getByText(/12 Corniche/)).toBeTruthy();
    expect(screen.getByText(/09:00 – 21:00/)).toBeTruthy();
    const mapLink = document.querySelector('a[href*="google.com/maps"]') as HTMLAnchorElement;
    expect(mapLink).toBeTruthy();
    expect(mapLink.textContent).toContain('View on Map');
    const sportIcon = document.querySelector('img[alt="Padel"]') as HTMLImageElement;
    expect(sportIcon).toBeTruthy();
    expect(sportIcon.src).toContain('padel.png');
  });

  it('shows no map action when the venue has no address/coordinates (never invented)', async () => {
    __state.tournament = {
      ...__state.tournament,
      daily_start_time: undefined,
      daily_end_time: undefined,
      venue: { branchId: 5, name: 'Anon Branch', addressLine1: null, city: null, latitude: null, longitude: null, mapsUrl: null },
    };
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    expect(screen.getByText('Anon Branch')).toBeTruthy();
    expect(document.querySelector('a[href*="google.com/maps"]')).toBeNull();
    // daily playing time placeholder ('—' appears for the unconfigured window)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders the responsive header grid (mobile-first layout contract)', async () => {
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    const grid = Array.from(document.querySelectorAll('div')).find((d) => d.className.includes('grid-cols-2') && d.className.includes('md:grid-cols-4'));
    expect(grid).toBeTruthy();
  });
});

describe('TournamentDetailPage — overview prediction line (no internal ids)', () => {
  /** Prediction labels of the "Match Summary" card (middle span of every row). */
  function predictionLines(): string[] {
    const heading = screen.getByText('Match Summary');
    const card = heading.parentElement as HTMLElement;
    const rows = Array.from(card.querySelectorAll('div.flex.items-center.justify-between'));
    return rows.map((row) => {
      const spans = row.querySelectorAll('span');
      return (spans[1]?.textContent ?? '').trim();
    });
  }

  async function renderWithMatches(matches: any[]) {
    __state.matches = matches;
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');
    await waitFor(() => expect(predictionLines().length).toBeGreaterThan(0));
    return predictionLines();
  }

  const idOnlyMatch = (id: number) => ({
    id, round: 1, bracket_position: 0, match_number: 1,
    player1_id: 701, player2_id: 702, status: 'scheduled', match_id: 900 + id,
  });

  it('shows the real player names when they are available', async () => {
    const lines = await renderWithMatches([
      { id: 31, round: 1, bracket_position: 0, match_number: 1,
        player1_id: 42, player1_name: 'Ali', player2_id: 43, player2_name: 'Sara',
        status: 'scheduled', match_id: 931 },
    ]);
    expect(lines).toEqual(['Ali vs Sara']);
  });

  it('falls back to the participant display name (pair/team slots)', async () => {
    const lines = await renderWithMatches([
      { id: 32, round: 1, bracket_position: 0, match_number: 1,
        participant1_name: 'Team Alpha', participant2_name: 'Team Bravo',
        status: 'scheduled', match_id: 932 },
    ]);
    expect(lines).toEqual(['Team Alpha vs Team Bravo']);
  });

  it('keeps the Bye presentation for an unassigned side', async () => {
    const lines = await renderWithMatches([
      { id: 33, round: 1, bracket_position: 0, match_number: 1,
        player1_name: 'Ali', player2_id: null, match_id: null, status: 'scheduled' },
    ]);
    expect(lines).toEqual(['Ali vs Bye']);
  });

  it('keeps the TBD presentation for an unassigned side', async () => {
    const lines = await renderWithMatches([
      { id: 34, round: 1, bracket_position: 0, match_number: 1,
        player1_id: null, player2_id: null, match_id: 934, status: 'scheduled' },
    ]);
    expect(lines[0]).toContain('TBD');
    expect(lines[0]).not.toMatch(/\bP\d+\b/);
  });

  it('never renders P{id} for a participant that only has an internal id', async () => {
    const lines = await renderWithMatches([idOnlyMatch(35)]);
    expect(lines[0]).not.toMatch(/\bP\d+\b/);
    expect(lines[0]).not.toMatch(/\b70[12]\b/);
    expect(lines[0]).toBe('Not available');
  });

  it('keeps the vs structure but no raw ids when only one side has a name', async () => {
    const lines = await renderWithMatches([
      { id: 36, round: 1, bracket_position: 0, match_number: 1,
        player1_id: 42, player1_name: 'Ali', player2_id: 702, status: 'scheduled', match_id: 936 },
    ]);
    expect(lines[0]).toBe('Ali vs Not available');
    expect(lines[0]).not.toMatch(/\bP\d+\b/);
    expect(lines[0]).not.toContain('702');
  });

  it('never exposes raw numeric participant ids anywhere in the prediction line', async () => {
    const lines = await renderWithMatches([idOnlyMatch(37), idOnlyMatch(38)]);
    for (const line of lines) {
      expect(line).not.toMatch(/\bP\d+\b/);
      expect(line).not.toMatch(/\b\d{3,}\b/);
      expect(line).not.toContain('#');
    }
  });

  it('keeps the existing prediction-line behavior intact when valid names exist', async () => {
    const lines = await renderWithMatches([
      { id: 39, round: 1, bracket_position: 0, match_number: 1,
        player1_id: 42, player1_name: 'Ali', player2_id: 43, player2_name: 'Sara',
        winner_id: 42, status: 'completed', score_summary: '6-4 6-3', match_id: 939 },
      { id: 40, round: 2, bracket_position: 0, match_number: 2,
        player1_id: 44, player1_name: 'Nour', player2_id: 43, player2_name: 'Sara',
        status: 'scheduled', match_id: 940 },
    ]);
    expect(lines).toEqual(['Ali vs Sara', 'Nour vs Sara']);
    // Round/status cells around the prediction line are untouched.
    expect(screen.getByText('R1 M0')).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
  });
});
describe('TournamentDetailPage � player result permission gate (Step 5A)', () => {
  const LIVE_MATCH = {
    id: 11, round: 1, match_number: 1, bracket_position: 0,
    player1_id: 42, player1_name: 'Ali', player2_id: 43, player2_name: 'Sara',
    status: 'in_progress', score_summary: null, match_id: 77,
  };

  it('shows Enter Score for an authorized player (matches.result.submit) and opens the shared result page', async () => {
    setPerms(['matches.result.submit']);
    __state.matches = [LIVE_MATCH as any];
    renderPage();
    await screen.findByText('Padel Open');
    clickTab('Bracket');
    const btn = await screen.findByText('Enter Score');
    fireEvent.click(btn);
    expect(await screen.findByText('RESULT_ENTRY_PAGE')).toBeTruthy();
  });

  it('hides Enter Score when the player is not authorized', async () => {
    setPerms([]);
    __state.matches = [LIVE_MATCH as any];
    renderPage();
    await screen.findByText('Padel Open');
    clickTab('Bracket');
    expect(screen.queryByText('Enter Score')).toBeNull();
  });

  it('hides Enter Score on completed matches (lifecycle state guards the action)', async () => {
    setPerms(['matches.result.submit']);
    __state.matches = [{ ...LIVE_MATCH, status: 'completed', score_summary: '6-4 6-3' } as any];
    renderPage();
    await screen.findByText('Padel Open');
    clickTab('Bracket');
    expect(screen.queryByText('Enter Score')).toBeNull();
  });

  it('no stale tournaments.enter_scores usage remains in the player-facing detail flow', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync('src/pages/tournaments/TournamentDetailPage.tsx', 'utf8');
    expect(src).not.toContain("can('tournaments.enter_scores')");
  });
});

describe('TournamentDetailPage — F-02 query failure handling (UX-7)', () => {
  /** Per-URL api.get override; unhandled URLs resolve to an empty list (never throw, never undefined). */
  function overrideDetailApi(handlers: Record<string, () => Promise<unknown>>) {
    vi.mocked(api.get).mockImplementation((url: string) => {
      const hit = handlers[url];
      return hit ? hit() : Promise.resolve({ data: { data: [] } });
    });
  }

  it('shows an explicit load-error + Retry (never "Tournament not found") when the primary query fails', async () => {
    overrideDetailApi({ '/tournaments/1': () => Promise.reject(new Error('Network Error')) });
    renderPage();

    expect(await screen.findByText('Unable to load tournament.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText('Tournament not found.')).toBeNull();
  });

  it('keeps "Tournament not found." for a genuine HTTP 404 response (no Retry)', async () => {
    overrideDetailApi({
      '/tournaments/1': () => Promise.reject({ response: { status: 404, data: { message: 'Tournament not found' } } }),
    });
    renderPage();

    expect(await screen.findByText('Tournament not found.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByText('Unable to load tournament.')).toBeNull();
  });

  it('recovers via Retry after a primary-query failure', async () => {
    let calls = 0;
    overrideDetailApi({
      '/tournaments/1': () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('Network Error')) : Promise.resolve({ data: __state.tournament });
      },
    });
    renderPage();

    expect(await screen.findByText('Unable to load tournament.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Padel Open')).toBeTruthy();
    expect(screen.queryByText('Unable to load tournament.')).toBeNull();
  });

  it('does not treat a participant-query failure as an empty list or as "not registered"', async () => {
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/participants': () => Promise.reject(new Error('Network Error')),
    });
    renderPage();
    await screen.findByText('Padel Open');

    // Failure is surfaced — never conflated with an empty roster.
    expect(screen.getByText('Unable to load participants.')).toBeTruthy();
    expect(screen.queryByText('No participants yet.')).toBeNull();
    // Fabricated counts are avoided (header Players cell + ELO card).
    expect(screen.queryByText('0/16')).toBeNull();
    // With membership unknown, no Register/Your-registration/Refund affordances.
    expect(screen.queryByText('Register & Pay')).toBeNull();
    expect(screen.queryByText(/Your registration/)).toBeNull();
    expect(screen.queryByText('Request Refund')).toBeNull();

    // The Players tab surfaces the same failure.
    clickTab('Players');
    expect(await screen.findByText('Unable to load participants.')).toBeTruthy();
    expect(screen.queryByText('No participants yet.')).toBeNull();
  });

  it('keeps the genuine empty state (no participants, no query error)', async () => {
    __state.participants = [];
    mockDetailApi();
    renderPage();
    await screen.findByText('Padel Open');

    expect(screen.getByText('No participants yet.')).toBeTruthy();
    expect(screen.queryByText('Unable to load participants.')).toBeNull();
    // A legitimately empty roster shows the real count and implies non-registration.
    expect(screen.getByText('0/16')).toBeTruthy();
    expect(screen.getByText('Register & Pay')).toBeTruthy();
  });
});

describe('TournamentDetailPage — F-02 remaining query failures (UX-12)', () => {
  /** Per-URL api.get override; unhandled URLs resolve to an empty list. */
  function overrideDetailApi(handlers: Record<string, () => Promise<unknown>>) {
    vi.mocked(api.get).mockImplementation((url: string) => {
      const hit = handlers[url];
      return hit ? hit() : Promise.resolve({ data: { data: [] } });
    });
  }

  // Deterministic base for these tests (the shared fixture is mutated elsewhere).
  beforeEach(() => {
    __state.tournament = {
      ...__state.tournament,
      format: 'knockout',
      status: 'registration_open',
      entry_fee: 800,
      effective_registration_payment_methods: ['cash', 'card'],
    };
  });

  it('matches failure: Overview + Matches + Bracket all surface error + Retry (never "No matches yet.")', async () => {
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/matches': () => Promise.reject(new Error('Network Error')),
    });
    renderPage();
    await screen.findByText('Padel Open');

    // Overview "Match Summary" must not masquerade as a genuine empty bracket.
    expect(await screen.findByText('Unable to load matches.')).toBeTruthy();
    expect(screen.queryByText('No matches yet.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();

    await clickTab('Matches');
    expect(await screen.findByText('Unable to load matches.')).toBeTruthy();

    await clickTab('Bracket');
    expect(await screen.findByText('Unable to load the bracket.')).toBeTruthy();
    expect(screen.queryByText('Bracket not yet generated.')).toBeNull();
  });

  it('matches failure recovers via Retry', async () => {
    __state.matches = [{
      id: 11, round: 1, match_number: 1, bracket_position: 0,
      player1_id: 42, player1_name: 'Ali', player2_id: 43, player2_name: 'Sara',
      winner_id: 42, status: 'completed', score_summary: '6-4 6-3', match_id: 77,
    }];
    let calls = 0;
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/matches': () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('Network Error')) : Promise.resolve({ data: { data: __state.matches } });
      },
    });
    renderPage();
    await screen.findByText('Padel Open');

    await clickTab('Matches');
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('6-4 6-3')).toBeTruthy();
  });

  it('matches failure does not block standings (independent queries)', async () => {
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/matches': () => Promise.reject(new Error('Network Error')),
      '/tournaments/1/standings': () => Promise.resolve({ data: { data: [{ id: 1, rank_position: 1, registration_id: 10, player_name: 'Ali', points: 3, wins: 1, losses: 0, games_won: 2, games_lost: 0 }] } }),
    });
    renderPage();
    await screen.findByText('Padel Open');
    await clickTab('Standings');
    expect(await screen.findByText('Ali')).toBeTruthy();
    expect(screen.queryByText('Unable to load standings.')).toBeNull();
  });

  it('standings failure: error + Retry (never "No standings available yet.")', async () => {
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/standings': () => Promise.reject(new Error('Network Error')),
    });
    renderPage();
    await screen.findByText('Padel Open');
    await clickTab('Standings');
    expect(await screen.findByText('Unable to load standings.')).toBeTruthy();
    expect(screen.queryByText('No standings available yet.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('standings failure recovers via Retry', async () => {
    let calls = 0;
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/standings': () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('Network Error'))
          : Promise.resolve({ data: { data: [{ id: 1, rank_position: 1, registration_id: 10, player_name: 'Ali', points: 3, wins: 1, losses: 0, games_won: 2, games_lost: 0 }] } });
      },
    });
    renderPage();
    await screen.findByText('Padel Open');
    await clickTab('Standings');
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ali')).toBeTruthy();
  });

  it('genuine empty matches/standings are preserved with no error', async () => {
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/matches': () => Promise.resolve({ data: { data: [] } }),
      '/tournaments/1/standings': () => Promise.resolve({ data: { data: [] } }),
    });
    renderPage();
    await screen.findByText('Padel Open');
    expect(await screen.findByText('No matches yet.')).toBeTruthy();
    await clickTab('Standings');
    expect(await screen.findByText('No standings available yet.')).toBeTruthy();
    expect(screen.queryByText(/Unable to load/)).toBeNull();
  });

  it('competitions failure is never mistaken for an empty list; free registration is fail-closed with Retry', async () => {
    __state.user = { id: 99, permissions: ['*'] }; // not a participant → Register offered
    __state.tournament = { ...__state.tournament, entry_fee: 0, effective_registration_payment_methods: [] };
    let calls = 0;
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/competitions': () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('Network Error')) : Promise.resolve({ data: { data: [] } });
      },
    });
    renderPage();
    await screen.findByText('Padel Open');

    fireEvent.click(screen.getByText('Register'));
    expect(await screen.findByText('Unable to load competitions.')).toBeTruthy();

    const modalSubmit = () => screen.getAllByText('Register').pop() as HTMLButtonElement;
    // Fail-closed: cannot submit while the competition categories are unknown.
    expect(modalSubmit().disabled).toBe(true);

    // Retry recovers the (genuinely empty) competition list and re-enables free registration.
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Unable to load competitions.')).toBeNull());
    await waitFor(() => expect(modalSubmit().disabled).toBe(false));
  });

  it('refund-request failure is surfaced with Retry and withholds the Request Refund action', async () => {
    const me = { id: 10, player_id: 42, player_name: 'Ali', seed_rank: 1, status: 'registered', registered_at: '2026-09-01T00:00:00.000Z', registration_id: 10 };
    __state.participants = [me];
    let calls = 0;
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/participants': () => Promise.resolve({ data: { data: __state.participants } }),
      '/tournaments/registrations/10/refund-request': () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('Network Error')) : Promise.resolve({ data: { status: null } });
      },
    });
    renderPage();
    await screen.findByText('Padel Open');

    expect(await screen.findByText('Unable to load refund request.')).toBeTruthy();
    // The current refund state is unknown — do not invite a duplicate submission.
    expect(screen.queryByText('Request Refund')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Request Refund')).toBeTruthy();
    expect(screen.queryByText('Unable to load refund request.')).toBeNull();
  });

  it('refund-request failure does not block matches (independent queries)', async () => {
    const me = { id: 10, player_id: 42, player_name: 'Ali', seed_rank: 1, status: 'registered', registered_at: '2026-09-01T00:00:00.000Z', registration_id: 10 };
    __state.participants = [me];
    __state.matches = [{
      id: 11, round: 1, match_number: 1, bracket_position: 0,
      player1_id: 42, player1_name: 'Ali', player2_id: 43, player2_name: 'Sara',
      winner_id: 42, status: 'completed', score_summary: '6-4 6-3', match_id: 77,
    }];
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/participants': () => Promise.resolve({ data: { data: __state.participants } }),
      '/tournaments/1/matches': () => Promise.resolve({ data: { data: __state.matches } }),
      '/tournaments/registrations/10/refund-request': () => Promise.reject(new Error('Network Error')),
    });
    renderPage();
    await screen.findByText('Padel Open');

    expect(await screen.findByText('Unable to load refund request.')).toBeTruthy();
    await clickTab('Matches');
    expect(await screen.findByText('6-4 6-3')).toBeTruthy();
  });

  it('gskStages failure: Knockout + Qualification show error + Retry, never the false "not generated yet" states', async () => {
    __state.tournament = { ...__state.tournament, format: 'group_stage_knockout' };
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/participants': () => Promise.resolve({ data: { data: [] } }),
      '/admin/tournaments/1/groups': () => Promise.resolve({ data: [] }),
      '/admin/tournaments/1/stages': () => Promise.reject(new Error('Network Error')),
    });
    renderPage();
    await screen.findByText('Padel Open');

    // Knockout tab must NOT claim the stage is genuinely absent.
    await clickTab('Knockout');
    expect(await screen.findByText('Unable to load stages.')).toBeTruthy();
    expect(screen.queryByTestId('gsk-knockout-pending')).toBeNull();

    // Qualification tab: unknown, not "pending".
    await clickTab('Qualification');
    expect(await screen.findByText('Unable to load stages.')).toBeTruthy();
    expect(screen.queryByTestId('gsk-qual-pending')).toBeNull();

    __state.tournament = { ...__state.tournament, format: 'knockout' };
  });

  it('gskStages failure recovers via Retry to the real knockout bracket', async () => {
    __state.tournament = { ...__state.tournament, format: 'group_stage_knockout' };
    const koMatch = { id: 200, round: 1, match_number: 1, bracket_position: 0, player1_id: 0, player1_name: 'Ali', player2_id: 0, player2_name: 'Nour', winner_id: 0, status: 'scheduled', score_summary: '', match_id: 902, stage_id: 6, round_name: 'Semi-final' };
    __state.matches = [koMatch];
    let calls = 0;
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/matches': () => Promise.resolve({ data: { data: __state.matches } }),
      '/tournaments/1/participants': () => Promise.resolve({ data: { data: [] } }),
      '/admin/tournaments/1/stages': () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('Network Error'))
          : Promise.resolve({ data: { data: [{ id: 5, progression_format: 'round_robin', config: {} }, { id: 6, progression_format: 'knockout', config: {} }] } });
      },
    });
    renderPage();
    await screen.findByText('Padel Open');

    await clickTab('Knockout');
    expect(await screen.findByText('Unable to load stages.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('gsk-knockout')).toBeTruthy();
    expect(screen.queryByText('Unable to load stages.')).toBeNull();

    __state.tournament = { ...__state.tournament, format: 'knockout' };
  });

  it('gskGroups failure: Groups tab shows error + Retry, never the false "not generated yet" state', async () => {
    __state.tournament = { ...__state.tournament, format: 'group_stage_knockout' };
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/participants': () => Promise.resolve({ data: { data: [] } }),
      '/admin/tournaments/1/stages': () => Promise.resolve({ data: { data: [] } }),
      '/admin/tournaments/1/groups': () => Promise.reject(new Error('Network Error')),
    });
    renderPage();
    await screen.findByText('Padel Open');

    await clickTab('Groups');
    expect(await screen.findByText('Unable to load groups.')).toBeTruthy();
    expect(screen.queryByTestId('gsk-groups-empty')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();

    __state.tournament = { ...__state.tournament, format: 'knockout' };
  });

  it('gskGroups genuine empty is preserved ("Groups have not been generated yet.") with no error', async () => {
    __state.tournament = { ...__state.tournament, format: 'group_stage_knockout' };
    overrideDetailApi({
      '/tournaments/1': () => Promise.resolve({ data: __state.tournament }),
      '/tournaments/1/participants': () => Promise.resolve({ data: { data: [] } }),
      '/admin/tournaments/1/stages': () => Promise.resolve({ data: { data: [] } }),
      '/admin/tournaments/1/groups': () => Promise.resolve({ data: [] }),
    });
    renderPage();
    await screen.findByText('Padel Open');

    await clickTab('Groups');
    expect(await screen.findByTestId('gsk-groups-empty')).toBeTruthy();
    expect(screen.queryByText('Unable to load groups.')).toBeNull();

    __state.tournament = { ...__state.tournament, format: 'knockout' };
  });
});
