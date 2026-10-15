import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentParticipantsPage from '../TournamentParticipantsPage';

/**
 * Test fixture shape for an admin participant row. Mirrors the production
 * participants contract the page consumes: individual/pair/team participants,
 * their `competition_id` scope (B4), and their normalized active `members`.
 */
type ParticipantFixture = {
  id: number;
  player_id: number;
  display_name: string;
  status: string;
  global_rating?: number | null;
  seed?: { seed_number: number; source: string; rating_snapshot?: number } | null;
  draw_position?: number;
  name?: string | null;
  participant_type?: 'individual' | 'pair' | 'team';
  competition_id?: number | null;
  members?: Array<{ id?: number; user_id: number; full_name?: string | null; status: string; member_order?: number }>;
};

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  participants: [
    { id: 1, player_id: 10, display_name: 'Player A', status: 'active', global_rating: null, seed: null, draw_position: 0 },
    { id: 2, player_id: 20, display_name: 'Player B', status: 'active', global_rating: 1650, seed: { seed_number: 2, source: 'manual' }, draw_position: 1 },
    { id: 3, player_id: 30, display_name: 'Player C', status: 'active', global_rating: 1800, seed: { seed_number: 3, source: 'rating', rating_snapshot: 1800 }, draw_position: 2 },
  ] as ParticipantFixture[],
  currentDraw: {
    id: 10, tournament_id: 1, attempt_number: 1, status: 'draft',
    entries: [
      { id: 1, participant_id: 1, position: 0, display_name: 'Player A', seed_number: 1, placement_source: 'auto', overridden: 0 },
      { id: 2, participant_id: 2, position: 1, display_name: 'Player B', seed_number: 2, placement_source: 'auto', overridden: 0 },
      { id: 3, participant_id: 3, position: 2, display_name: 'Player C', seed_number: 3, placement_source: 'auto', overridden: 0 },
    ],
  },
  waitlist: [
    { id: 20, tournament_id: 1, registration_id: 20, status: 'waiting', waiting_order: 1, member_user_ids: [200], player_id: 200, display_name: 'Player W1' },
    { id: 21, tournament_id: 1, registration_id: 21, status: 'waiting', waiting_order: 2, member_user_ids: [201], player_id: 201, display_name: 'Player W2' },
  ],
  // Group 7 — a pair participant with normalized members + a replacement request
  pair: { id: 4, player_id: 40, display_name: 'Pair Alpha', name: 'Pair Alpha', participant_type: 'pair', status: 'active', global_rating: null, seed: { seed_number: 4, source: 'manual' }, members: [
    { id: 1, user_id: 40, full_name: 'Player P1', status: 'active', member_order: 0 },
    { id: 2, user_id: 41, full_name: 'Player P2', status: 'active', member_order: 1 },
  ] },
  replacementRequests: [
    { id: 900, tournament_id: 1, participant_id: 4, outgoing_member_user_id: 40, replacement_user_id: 50, requested_by: 1, requested_at: '2026-09-01T00:00:00.000Z', status: 'pending', participant_name: 'Pair Alpha', outgoing_member_name: 'Player P1', replacement_user_name: 'Player P5', requested_by_name: 'Admin' },
  ],
  errors: { participants: false, draw: false, waitlist: false, competitions: false, replacement: false } as Record<string, boolean>,
  competitions: [] as Array<{ id: number; name: string }>,
  // B4 — registrations feed the name-search picker (player_id + player_name ONLY).
  registrations: [
    { player_id: 10, player_name: 'Player A' },
    { player_id: 20, player_name: 'Player B' },
    { player_id: 30, player_name: 'Player C' },
    { player_id: 50, player_name: 'Player D' },
    { player_id: 60, player_name: 'Player E' },
  ] as Array<{ player_id: number; player_name: string }>,
  emptyParticipants: false,
  noDraw: false,
}));

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ permission, children }: any) => {
    const perms = __state.userPermissions;
    if (perms.includes('*') || perms.includes(permission)) return <>{children}</>;
    return null;
  },
}));

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import api from '../../../../services/api';

function renderPage(mode: 'admin' | 'org' = 'admin') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const path = mode === 'org' ? '/org/6/tournaments/1/participants' : '/admin/tournament/list/1/participants';
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/tournament/list/:id/participants" element={<TournamentParticipantsPage mode="admin" />} />
          <Route path="/org/:orgId/tournaments/:id/participants" element={<TournamentParticipantsPage mode="org" orgId="6" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The pristine participant fixture — restored before every test (tests reassign it). */
const BASE_PARTICIPANTS = __state.participants;

function mockApi() {
  (api.get as any).mockImplementation((url: string) => {
    if (__state.errors.replacement && url.includes('/replacement-requests')) return Promise.reject(new Error('replacement failed'));
    if (__state.errors.waitlist && url.includes('/waitlist')) return Promise.reject(new Error('waitlist failed'));
    if (__state.errors.draw && url.includes('/draw')) return Promise.reject(new Error('draw failed'));
    if (__state.errors.competitions && url.includes('/competitions')) return Promise.reject(new Error('competitions failed'));
    if (__state.errors.participants && url.includes('/participants')) return Promise.reject(new Error('participants failed'));
    if (url.includes('/registrations')) return Promise.resolve({ data: __state.registrations });
    if (url.includes('/replacement-requests')) return Promise.resolve({ data: __state.replacementRequests });
    if (url.includes('/participants')) return Promise.resolve({ data: __state.emptyParticipants ? [] : [...__state.participants, __state.pair] });
    if (url.includes('/waitlist')) return Promise.resolve({ data: __state.waitlist });
    if (url.includes('/draw')) return Promise.resolve({ data: __state.noDraw ? null : __state.currentDraw });
    if (url.includes('/competitions')) return Promise.resolve({ data: { data: __state.competitions } });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.userPermissions = ['*'];
  __state.errors = { participants: false, draw: false, waitlist: false, competitions: false, replacement: false };
  __state.competitions = [];
  __state.participants = [...BASE_PARTICIPANTS];
  __state.emptyParticipants = false;
  __state.noDraw = false;
  mockApi();
});

describe('B4 — doubles pairing player picker (name search, competition scope)', () => {
  async function openPairModal() {
    const view = renderPage();
    fireEvent.click(await screen.findByText('Add Pair'));
    await screen.findByLabelText('Players (search by name)');
    return view;
  }
  const competitionSelect = () => document.getElementById('pair-competition') as HTMLSelectElement;
  const candidates = () => within(screen.getByLabelText('Registered players'));
  const selected = () => within(screen.getByLabelText('Selected players'));
  const submitBtn = () => screen.getByText('Create Participant').closest('button') as HTMLButtonElement;

  it('lists registered players by NAME and filters by name search', async () => {
    await openPairModal();
    expect(candidates().getByText('Player A')).toBeTruthy();
    expect(candidates().getByText('Player E')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Players (search by name)'), { target: { value: 'player d' } });
    await waitFor(() => expect(candidates().queryByText('Player A')).toBeNull());
    expect(candidates().getByText('Player D')).toBeTruthy();
  });

  it('submits the REAL user ids and the selected competition id (unchanged contract)', async () => {
    __state.competitions = [{ id: 7, name: 'Doubles Open' }];
    await openPairModal();
    fireEvent.click(candidates().getByText('Player A'));
    fireEvent.click(candidates().getByText('Player D'));
    await waitFor(() => expect(selected().getByText('Player A')).toBeTruthy());
    fireEvent.click(submitBtn());
    await waitFor(() => expect((api.post as any).mock.calls.length).toBeGreaterThan(0));
    const [, payload] = (api.post as any).mock.calls[0] as [string, any];
    expect(payload.member_user_ids).toEqual([10, 50]);
    expect(payload.competition_id).toBe(7);
  });

  it('prevents selecting the same player twice', async () => {
    await openPairModal();
    fireEvent.click(candidates().getByText('Player A'));
    await waitFor(() => expect(selected().getByText('Player A')).toBeTruthy());
    const row = candidates().getByText('Player A').closest('button') as HTMLButtonElement;
    expect(row.disabled).toBe(true); // already-selected candidate is not re-addable
    fireEvent.click(row);
    expect(selected().getAllByText('Player A')).toHaveLength(1);
  });

  it('excludes players active in the SELECTED competition only', async () => {
    __state.competitions = [{ id: 7, name: 'Doubles Open' }];
    __state.participants = [
      ...__state.participants,
      { id: 9, player_id: 90, display_name: 'Pair A', status: 'active', participant_type: 'pair', competition_id: 7, members: [
        { user_id: 20, status: 'active', full_name: 'Player B' },
        { user_id: 30, status: 'active', full_name: 'Player C' },
      ] },
      { id: 11, player_id: 110, display_name: 'Pair B', status: 'active', participant_type: 'pair', competition_id: 9, members: [
        { user_id: 60, status: 'active', full_name: 'Player E' },
      ] },
    ];
    await openPairModal();
    // Player B is already paired in competition 7 → shown with a reason, not addable.
    expect(candidates().getAllByText('Already in a pair/team').length).toBeGreaterThan(0);
    expect((candidates().getByText('Player B').closest('button') as HTMLButtonElement).disabled).toBe(true);
    // Player E is active in a DIFFERENT competition → still available here.
    expect((candidates().getByText('Player E').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('requires an explicit competition when the tournament has several', async () => {
    __state.competitions = [{ id: 7, name: 'Group A' }, { id: 8, name: 'Group B' }];
    await openPairModal();
    await waitFor(() => expect(competitionSelect()).toBeTruthy());
    expect(submitBtn().disabled).toBe(true);
    expect(screen.getByText('Select a competition before creating a pair.')).toBeTruthy();
    fireEvent.change(competitionSelect(), { target: { value: '8' } });
    fireEvent.click(candidates().getByText('Player A'));
    fireEvent.click(candidates().getByText('Player D'));
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
  });

  it('an active participant with UNKNOWN competition association is never offered as available', async () => {
    __state.competitions = [{ id: 7, name: 'Doubles Open' }];
    __state.participants = [
      ...__state.participants,
      // The real response may carry a null association — it must NOT become a false
      // "available": the player is shown with an explicit unverifiable reason.
      { id: 12, player_id: 120, display_name: 'Pair C', status: 'active', participant_type: 'pair', competition_id: null, members: [
        { user_id: 50, status: 'active', full_name: 'Player D' },
      ] },
    ];
    await openPairModal();
    expect(
      candidates().getAllByText('Availability cannot be verified for the selected competition').length,
    ).toBeGreaterThan(0);
    expect((candidates().getByText('Player D').closest('button') as HTMLButtonElement).disabled).toBe(true);
    // …and it cannot be submitted (the candidate is not selectable).
    expect(submitBtn().disabled).toBe(true);
  });

  it('removes stale selected players when the competition scope changes', async () => {
    __state.competitions = [{ id: 7, name: 'Group A' }, { id: 8, name: 'Group B' }];
    await openPairModal();
    await waitFor(() => expect(competitionSelect()).toBeTruthy());
    fireEvent.change(competitionSelect(), { target: { value: '7' } });
    fireEvent.click(candidates().getByText('Player A'));
    fireEvent.click(candidates().getByText('Player D'));
    await waitFor(() => expect(selected().getByText('Player A')).toBeTruthy());

    fireEvent.change(competitionSelect(), { target: { value: '8' } });

    await waitFor(() => expect(screen.getByLabelText('Selected players').textContent).toBe(''));
    expect(submitBtn().disabled).toBe(true);
  });

  it('org mode uses the ORG-scoped registrations query and never the platform endpoint', async () => {
    renderPage('org');
    fireEvent.click(await screen.findByText('Add Pair'));
    await screen.findByLabelText('Players (search by name)');
    const urls: string[] = (api.get as any).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls.some((u: string) => u.includes('/org/6/tournaments/1/registrations'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/admin/tournaments/1/registrations'))).toBe(false);
  });
});

describe('TournamentParticipantsPage — Group 5 foundation', () => {
  it('lists participants with global rating, tournament seed and seed source', async () => {
    renderPage();
    expect((await screen.findAllByText('Player A')).length).toBeGreaterThan(0);
    // Player B: rating + manual seed
    expect(screen.getByText('1650%')).toBeTruthy();
    expect(screen.getAllByText('#2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('manual').length).toBeGreaterThan(0);
    // Player C: rating-derived seed (source rating)
    expect(screen.getByText('1800%')).toBeTruthy();
    expect(screen.getByText('rating')).toBeTruthy();
    // Player A has no rating and no seed
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders the current draw positions with seed + placement', async () => {
    renderPage();
    expect((await screen.findAllByText('Player A')).length).toBeGreaterThan(0);
    expect(screen.getByText('Draw Positions')).toBeTruthy();
    expect(screen.getAllByText('auto').length).toBeGreaterThan(0);
    expect(screen.getByText(/attempt #1/)).toBeTruthy();
  });

  it('manual seed assignment submits seed_number + source and shows the hint', async () => {
    renderPage();
    await screen.findAllByText('Player A');
    const assignBtn = screen.getAllByText('Assign Seed')[0];
    expect(assignBtn).toBeTruthy();
    fireEvent.click(assignBtn);
    expect(await screen.findByText('Assign Tournament Seed')).toBeTruthy();
    expect(screen.getByText(/does not change the player's global rating/)).toBeTruthy();
    // Enter a seed number so the submit button becomes enabled, then submit.
    const seedInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(seedInput, { target: { value: '1' } });
    const buttons = screen.getAllByText('Assign Seed');
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect((api.post as any).mock.calls.length).toBeGreaterThan(0));
    const [url, body] = (api.post as any).mock.calls[0];
    expect(url).toContain('/participants/1/seed');
    expect(body.source).toBe('manual');
    expect(body.seed_number).toBe(1);
  });

  it('hides draw/seed actions when the manage permission is absent (RBAC)', async () => {
    __state.userPermissions = ['tournament.view'];
    renderPage();
    await screen.findAllByText('Player A');
    expect(screen.queryByText('Generate Draw')).toBeNull();
    expect(screen.queryByText('Assign Seed')).toBeNull();
  });
});

describe('TournamentParticipantsPage — participant lifecycle (Group 6)', () => {
  it('renders the FIFO waitlist with positions and a Promote action', async () => {
    renderPage();
    expect((await screen.findAllByText(/Waitlist/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Player W1')).toBeTruthy();
    expect(screen.getByText('Player W2')).toBeTruthy();
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0);
    expect(screen.getByText('Promote Next')).toBeTruthy();
  });

  it('withdraw action calls the withdraw lifecycle endpoint', async () => {
    renderPage();
    await screen.findAllByText('Player A');
    const withdrawBtns = screen.getAllByText('Withdraw');
    expect(withdrawBtns.length).toBeGreaterThan(0);
    (globalThis as any).confirm = () => true;
    fireEvent.click(withdrawBtns[0]);
    await waitFor(() => expect((api.post as any).mock.calls.length).toBeGreaterThan(0));
    const [url] = (api.post as any).mock.calls[0];
    expect(url).toContain('/participants/1/withdraw');
  });

  it('promote next calls the waitlist promote endpoint', async () => {
    renderPage();
    await screen.findAllByText('Player A');
    fireEvent.click(screen.getByText('Promote Next'));
    await waitFor(() => expect((api.post as any).mock.calls.length).toBeGreaterThan(0));
    const [url] = (api.post as any).mock.calls[0];
    expect(url).toContain('/waitlist/promote');
  });

  it('lifecycle actions are RBAC-gated', async () => {
    __state.userPermissions = ['tournament.view'];
    renderPage();
    await screen.findAllByText('Player A');
    expect(screen.queryByText('Withdraw')).toBeNull();
    expect(screen.queryByText('Promote Next')).toBeNull();
    // Read-only surfaces still render.
    expect(screen.getByText('Player W1')).toBeTruthy();
  });
});

describe('TournamentParticipantsPage — pair/team management (Group 7)', () => {
  it('renders a pair participant with its authoritative members and seed', async () => {
    renderPage();
    expect((await screen.findAllByText('Pair Alpha')).length).toBeGreaterThan(0);
    // 'Player P1' appears in the pair's member list AND the replacement request row.
    expect(screen.getAllByText('Player P1').length).toBeGreaterThan(0);
    expect(screen.getByText('Player P2')).toBeTruthy();
    expect(screen.getAllByText('#4').length).toBeGreaterThan(0);
  });

  it('opens the Add Team modal and submits to /participants/teams', async () => {
    renderPage();
    await screen.findAllByText('Player A');
    fireEvent.click(screen.getByText('Add Team'));
    // B4 — the numeric user-id fields were replaced by the name-search picker.
    expect(await screen.findByText(/Select registered players by name/)).toBeTruthy();
    const list = within(screen.getByLabelText('Registered players'));
    fireEvent.click(list.getByText('Player A'));
    fireEvent.click(list.getByText('Player B'));
    fireEvent.click(screen.getByText('Create Participant'));
    await waitFor(() => expect((api.post as any).mock.calls.length).toBeGreaterThan(0));
    const [url, body] = (api.post as any).mock.calls.find((c: any[]) => c[0].includes('/teams'));
    expect(url).toContain('/participants/teams');
    expect(body.member_user_ids).toEqual([10, 20]);
  });

  it('opens the replacement modal and submits a durable replacement request', async () => {
    renderPage();
    await screen.findAllByText('Player A');
    const reqBtn = screen.getAllByText('Request Replacement')[0];
    expect(reqBtn).toBeTruthy();
    fireEvent.click(reqBtn);
    expect(await screen.findByText('Request Player Replacement')).toBeTruthy();
    expect(screen.getAllByText(/does not change the team's\/pair's Tournament Seed/).length).toBeGreaterThan(0);
    // Select the current player and enter the replacement user ID so submit enables.
    fireEvent.change(document.querySelector('select') as HTMLSelectElement, { target: { value: '40' } });
    const numberInputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[numberInputs.length - 1], { target: { value: '50' } });
    fireEvent.click(screen.getByText('Submit Request'));
    await waitFor(() => expect((api.post as any).mock.calls.some((c: any[]) => c[0].includes('/replacement-requests'))).toBe(true));
    const [url, body] = (api.post as any).mock.calls.find((c: any[]) => c[0].includes('/replacement-requests'));
    expect(url).toContain('/participants/4/replacement-requests');
    expect(body.outgoing_user_id).toBe(40);
    expect(body.replacement_user_id).toBe(50);
  });

  it('renders pending replacement requests with approve/reject/cancel actions', async () => {
    renderPage();
    expect((await screen.findAllByText(/Replacement Requests/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Player P1').length).toBeGreaterThan(0);
    expect(screen.getByText('Player P5')).toBeTruthy();
    // The header "Approve" (draw) and the row "Approve" (replacement) both exist.
    expect(screen.getAllByText('Approve').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Reject').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText('Approve')[screen.getAllByText('Approve').length - 1]);
    await waitFor(() => expect((api.post as any).mock.calls.some((c: any[]) => c[0].includes('/approve'))).toBe(true));
  });

  it('approve/reject/cancel replacement actions are RBAC-gated (view-only)', async () => {
    __state.userPermissions = ['tournament.view'];
    renderPage();
    await screen.findAllByText('Player A');
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Add Pair')).toBeNull();
    // Read-only surfaces still render.
    expect(screen.getByText('Player P5')).toBeTruthy();
  });
});

describe('TournamentParticipantsPage — F-02 fetch-error states', () => {
  it('participants failure: shows error + Retry instead of an empty table while independent sections still render; Retry recovers the list', async () => {
    __state.errors.participants = true;
    renderPage();
    expect(await screen.findByText('Unable to load participants.')).toBeTruthy();
    // No fabricated empty table — the headers must not masquerade as a real list.
    expect(screen.queryByText('Global Rating')).toBeNull();
    expect(screen.queryByText('1650%')).toBeNull();
    // Independent queries still render — waitlist, replacement requests, draw positions.
    expect(screen.getByText('Player W1')).toBeTruthy();
    expect(screen.getByText('Player P5')).toBeTruthy();
    expect(screen.getByText('Draw Positions')).toBeTruthy();
    // Retry recovery restores the participant list.
    __state.errors.participants = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('1650%')).toBeTruthy();
  });

  it('draw failure: status banner shows error + Retry (never "Draw status: —"), positions hidden, and Generate Draw is disabled; Retry recovers', async () => {
    __state.errors.draw = true;
    renderPage();
    expect(await screen.findByText('Unable to load draw.')).toBeTruthy();
    // The banner must not masquerade as an unknown-but-fine draw state.
    expect(screen.queryByText(/Draw status:/)).toBeNull();
    expect(screen.queryByText('Draw Positions')).toBeNull();
    // generateDraw has always-replace semantics — no blind re-draw on unknown draw state.
    expect((screen.getByText('Generate Draw') as HTMLButtonElement).disabled).toBe(true);
    // Independent queries still render — participant list + waitlist stay available.
    expect(screen.getAllByText('Player A').length).toBeGreaterThan(0);
    expect(screen.getByText('1650%')).toBeTruthy();
    expect(screen.getByText('Player W1')).toBeTruthy();
    // Retry recovery restores the draw status + positions.
    __state.errors.draw = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText(/attempt #1/)).toBeTruthy();
    expect(screen.getByText('Draw Positions')).toBeTruthy();
  });

  it('waitlist failure: shows error + Retry (never "The waitlist is empty.") while the participant table still renders; Retry recovers', async () => {
    __state.errors.waitlist = true;
    renderPage();
    expect(await screen.findByText('Unable to load waitlist.')).toBeTruthy();
    expect(screen.queryByText('The waitlist is empty.')).toBeNull();
    expect(screen.queryByText('Player W1')).toBeNull();
    // Independent query still renders — participant list.
    expect(screen.getAllByText('Player A').length).toBeGreaterThan(0);
    // Retry recovery restores the waitlist rows.
    __state.errors.waitlist = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Player W1')).toBeTruthy();
  });

  it('replacement requests failure: shows error + Retry (never "No replacement requests."); Retry recovers', async () => {
    __state.errors.replacement = true;
    renderPage();
    expect(await screen.findByText('Unable to load replacement requests.')).toBeTruthy();
    expect(screen.queryByText('No replacement requests.')).toBeNull();
    expect(screen.queryByText('Player P5')).toBeNull();
    // Independent query still renders — participant list.
    expect(screen.getAllByText('Player A').length).toBeGreaterThan(0);
    // Retry recovery restores the pending requests.
    __state.errors.replacement = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Player P5')).toBeTruthy();
  });

  it('competitions failure: shows error + Retry while the waitlist still renders; Retry clears the banner', async () => {
    __state.errors.competitions = true;
    renderPage();
    expect(await screen.findByText('Unable to load competitions.')).toBeTruthy();
    // The waitlist is independent of the competitions query and keeps rendering.
    expect(screen.getByText('Player W1')).toBeTruthy();
    // Retry recovery clears the banner.
    __state.errors.competitions = false;
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.queryByText('Unable to load competitions.')).toBeNull());
  });

  it('genuine empty results are preserved — no error text, original empty copy intact, Generate Draw enabled', async () => {
    __state.emptyParticipants = true;
    __state.waitlist = [];
    __state.noDraw = true;
    renderPage();
    // Real empty states keep their original copy:
    expect(await screen.findByText('The waitlist is empty.')).toBeTruthy();
    expect(screen.queryByText(/Unable to load/)).toBeNull();
    // A genuinely empty participant result still renders the table headers.
    expect(screen.getByText('Global Rating')).toBeTruthy();
    // A legitimately absent draw hides the positions section (no fabricated structure)…
    expect(screen.queryByText('Draw Positions')).toBeNull();
    // …and the draw query SUCCEEDED — Generate Draw stays enabled for the first draw.
    const genBtn = screen.getByText('Generate Draw') as HTMLButtonElement;
    expect(genBtn.disabled).toBe(false);
  });

  it('independent failures stack: participants + waitlist each render their own panel with Retry', async () => {
    __state.errors.participants = true;
    __state.errors.waitlist = true;
    renderPage();
    expect(await screen.findByText('Unable to load participants.')).toBeTruthy();
    expect(screen.getByText('Unable to load waitlist.')).toBeTruthy();
    expect(screen.getAllByText('Retry').length).toBeGreaterThanOrEqual(2);
  });
});

describe('TournamentParticipantsPage — competition-scoped draw (G11.18 Phase 3)', () => {
  it('multi-competition: blocks the draw action until a competition is selected', async () => {
    __state.competitions = [{ id: 11, name: 'Singles A' }, { id: 12, name: 'Singles B' }];
    renderPage();
    await screen.findAllByText('Player A');
    const btn = (await screen.findByRole('button', { name: /Generate Draw|Re-Draw/ })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('single-competition / legacy: the draw action stays available without a selection', async () => {
    __state.competitions = [{ id: 11, name: 'Singles A' }];
    renderPage();
    await screen.findAllByText('Player A');
    const btn = (await screen.findByRole('button', { name: /Generate Draw|Re-Draw/ })) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});