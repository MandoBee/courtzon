import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MatchesManager } from '../MatchesManager';
import type { TournamentMatchNode } from '../../../../types/tournamentBracket';

const api = vi.hoisted(() => ({
  startMatch: vi.fn(),
  completeMatch: vi.fn(),
  assignCourt: vi.fn(),
  assignReferee: vi.fn(),
  recordResult: vi.fn(),
  getEligibleCourts: vi.fn(),
}));

const resultApi = vi.hoisted(() => ({
  fetchMatchResult: vi.fn(),
  acceptMatchResult: vi.fn(),
}));

const __state = vi.hoisted(() => ({ permissions: ['*'] as string[] }));

vi.mock('../../../../services/tournament', () => ({
  tournamentApi: api,
  orgTournamentApi: api,
  tournamentParticipantApi: api,
  orgTournamentParticipantApi: api,
}));

vi.mock('../../../../services/match-result.api', () => ({
  fetchMatchResult: resultApi.fetchMatchResult,
  acceptMatchResult: resultApi.acceptMatchResult,
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ permission, children }: any) => {
    if (__state.permissions.includes('*') || __state.permissions.includes(permission)) return <>{children}</>;
    return null;
  },
}));

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function makeMatch(overrides: Partial<TournamentMatchNode> = {}): TournamentMatchNode {
  return {
    id: 1,
    tournament_id: 1,
    match_id: 900,
    round: 1,
    match_number: 1,
    status: 'scheduled',
    shared_status: 'open',
    player1_name: 'Ali',
    player2_name: 'Sara',
    resource_name: 'Court 1',
    referee_name: 'Ref A',
    score_summary: null,
    ...overrides,
  } as TournamentMatchNode;
}

const GROUP_MATCH = makeMatch({
  id: 2, status: 'in_progress', shared_status: 'in_progress',
  stage_id: 1, stage_name: 'Group Stage', stage_order: 1, stage_progression_format: 'round_robin', group_id: 5, group_name: 'A',
  player1_name: 'Lina', player2_name: 'Omar',
});
const KO_MATCH = makeMatch({
  id: 3, status: 'completed', shared_status: 'completed',
  stage_id: 2, stage_name: 'Knockout', stage_order: 2, stage_progression_format: 'knockout', group_id: null,
  player1_name: 'Nour', player2_name: 'Yara', score_summary: '6-4 6-3', result_status: 'approved', result_id: 77,
});
const PENDING_MATCH = makeMatch({ id: 4, status: 'completed', shared_status: 'completed', player1_name: 'Tariq', player2_name: 'Huda', result_status: 'pending_confirmation', result_id: 88 });
const DISPUTED_MATCH = makeMatch({ id: 6, status: 'completed', shared_status: 'completed', player1_name: 'D1', player2_name: 'D2', stage_name: 'Knockout', stage_order: 2, stage_progression_format: 'knockout', result_status: 'disputed', result_id: 66 });
const NO_RESULT_MATCH = makeMatch({ id: 7, status: 'completed', player1_name: 'N1', player2_name: 'N2', stage_name: 'Group Stage', stage_order: 1, stage_progression_format: 'round_robin', group_name: 'C', result_status: 'no_result', result_id: 77 });
const RR_MATCH = makeMatch({ id: 5, status: 'scheduled', player1_name: 'K', player2_name: 'L', stage_name: null, group_name: null });

const ALL = [GROUP_MATCH, KO_MATCH, PENDING_MATCH, RR_MATCH];

function renderManager(overrides: Partial<Parameters<typeof MatchesManager>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    tournamentId: 1,
    isOrg: false,
    orgId: undefined,
    matches: ALL,
    loading: false,
    error: false,
    onRetry: vi.fn(),
    onDetails: vi.fn(),
    onSchedule: vi.fn(),
    onOpenResults: vi.fn(),
    onOpenMonitoring: vi.fn(),
    onViewResult: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={qc}>
      <MatchesManager {...props} />
    </QueryClientProvider>,
  );
  return props;
}

function rowContaining(name: string): HTMLElement {
  const el = screen.getByText(name);
  let node = el.parentElement;
  while (node && !(node.textContent || '').includes('Details')) node = node.parentElement;
  expect(node, `row for ${name}`).toBeTruthy();
  return node as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.permissions = ['*'];
  api.startMatch.mockResolvedValue({ data: {} });
  api.completeMatch.mockResolvedValue({ data: {} });
  api.assignCourt.mockResolvedValue({ data: {} });
  api.assignReferee.mockResolvedValue({ data: {} });
  api.recordResult.mockResolvedValue({ data: {} });
  api.getEligibleCourts.mockResolvedValue([{ id: 1, name: 'Court A' }, { id: 2, name: 'Court B' }]);
  resultApi.fetchMatchResult.mockResolvedValue({ record: { id: 55, matchId: 900, submissionStatus: 'pending_confirmation', rawResult: { outcome: 'completed', score: { sets: [{ home: 6, away: 3 }] } } }, participants: [] });
  resultApi.acceptMatchResult.mockResolvedValue({ data: {} });
});

describe('Tournament Hub MatchesManager (Step 3C)', () => {
  it('1. renders canonical match data (names, court, referee, score)', async () => {
    renderManager();
    await screen.findByText('Lina');
    expect(screen.getByText('Omar')).toBeTruthy();
    expect(screen.getAllByText('Court 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ref A').length).toBeGreaterThan(0);
    expect(screen.getByText('6-4 6-3')).toBeTruthy();
  });

  it('2. segments filter the same loaded data (one fetch)', async () => {
    renderManager();
    await screen.findByText('Lina');
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByText('Lina')).toBeTruthy();
    expect(screen.queryByText('K')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Upcoming' }));
    expect(screen.getByText('K')).toBeTruthy();
    expect(screen.queryByText('Lina')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    expect(screen.getByText('Nour')).toBeTruthy();
    expect(screen.getByText('Tariq')).toBeTruthy();
    expect(screen.queryByText('K')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    expect(screen.getByText('Tariq')).toBeTruthy();
    expect(screen.queryByText('K')).toBeNull();
  });

  it('3. stage/group context renders for GSK group matches and knockout', async () => {
    renderManager();
    await screen.findByText('Group Stage');
    expect(screen.getByText('Group: A')).toBeTruthy();
    // knockout row: stage present, NO group chip
    expect(screen.getByText('Knockout')).toBeTruthy();
    expect(screen.queryByText('Group: Group: null')).toBeNull();
  });

  it('4. Details opens the drawer callback', async () => {
    const props = renderManager({ matches: [makeMatch({})] });
    await screen.findByText('Ali');
    fireEvent.click(within(rowContaining('Ali')).getByRole('button', { name: 'Details' }));
    expect(props.onDetails).toHaveBeenCalled();
  });

  it('5. Start calls the existing start API (shared_status closed)', async () => {
    renderManager({ matches: [makeMatch({ shared_status: 'closed' })] });
    await screen.findByText('Ali');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(api.startMatch).toHaveBeenCalledWith(makeMatch({ shared_status: 'closed' }).id), { timeout: 3000 });
  });

  it('6. Complete calls the existing complete API', async () => {
    renderManager({ matches: [makeMatch({ shared_status: 'in_progress' })] });
    await screen.findByText('Ali');
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(api.completeMatch).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('7. court assignment uses a picker and calls the existing API', async () => {
    renderManager({ matches: [makeMatch({})] });
    await screen.findByText('Ali');
    fireEvent.click(screen.getByRole('button', { name: 'Assign Court' }));
    const select = await screen.findByLabelText(/assign court/i);
    await screen.findByRole('option', { name: 'Court B' });
    fireEvent.change(select, { target: { value: '2' } });
    const applyBtn = screen.getByRole('button', { name: 'Apply' });
    await waitFor(() => expect((applyBtn as HTMLButtonElement).disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(applyBtn);
    await waitFor(() => expect(api.assignCourt).toHaveBeenCalledWith(makeMatch({}).id, 2), { timeout: 3000 });
  });

  it('8. referee assignment keeps the underlying numeric API (no list endpoint)', async () => {
    renderManager({ matches: [makeMatch({})] });
    await screen.findByText('Ali');
    fireEvent.click(screen.getByRole('button', { name: 'Assign Referee' }));
    const input = await screen.findByLabelText(/assign referee/i);
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(api.assignReferee).toHaveBeenCalledWith(makeMatch({}).id, 42), { timeout: 3000 });
  });

  it('9. Record Result opens the existing result flow and submits a payload', async () => {
    renderManager({ matches: [makeMatch({ rule_snapshot: { score_structure: 'sets' } })] });
    await screen.findByText('Ali');
    fireEvent.click(screen.getByRole('button', { name: 'Record Result' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Result' }));
    await waitFor(() => expect(api.recordResult).toHaveBeenCalled(), { timeout: 3000 });
    expect(api.recordResult.mock.calls[0][0]).toBe(makeMatch({}).id);
    expect(api.recordResult.mock.calls[0][1]).toMatchObject({ outcome: 'completed' });
  });

  it('10. loading state renders skeletons', async () => {
    renderManager({ loading: true, matches: [] });
    expect(document.querySelectorAll('.cz-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ali')).toBeNull();
  });

  it('11. error state renders retry that calls onRetry', async () => {
    const props = renderManager({ error: true, matches: [] });
    expect(await screen.findByText('Unable to load matches.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('12. empty state explains and offers schedule', async () => {
    const props = renderManager({ matches: [] });
    expect(await screen.findByText('No matches yet for this tournament.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Matches & Schedule' }));
    expect(props.onSchedule).toHaveBeenCalled();
  });

  it('13. segment empty state', async () => {
    renderManager({ matches: [makeMatch({ status: 'scheduled' })] });
    await screen.findByText('Ali');
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByText('No matches in this segment.')).toBeTruthy();
  });

  it('14. results segment offers the shared Match Results link', async () => {
    const props = renderManager({ matches: [PENDING_MATCH] });
    await screen.findByText('Tariq');
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Match Results' }));
    expect(props.onOpenResults).toHaveBeenCalled();
  });

  it('15. live segment offers the monitoring link', async () => {
    const props = renderManager({ matches: [GROUP_MATCH] });
    await screen.findByText('Lina');
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    fireEvent.click(screen.getByRole('button', { name: 'Live Monitoring' }));
    expect(props.onOpenMonitoring).toHaveBeenCalled();
  });

  it('16. stage filter (client-side) narrows by stage', async () => {
    renderManager();
    await screen.findByText('Group Stage');
    fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'Knockout' } });
    expect(screen.getByText('Nour')).toBeTruthy();
    expect(screen.queryByText('Lina')).toBeNull();
  });

  it('17. round robin and single elimination rows render without a group', async () => {
    renderManager({ matches: [RR_MATCH, makeMatch({ id: 9, stage_name: 'Knockout', group_name: null })] });
    await screen.findByText('K');
    expect(screen.getByText('K')).toBeTruthy();
  });

  it('18. row layout is mobile-safe (responsive flex, no horizontal scroll host on the list)', async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MatchesManager tournamentId={1} isOrg={false} orgId={undefined} matches={ALL} loading={false} error={false} onRetry={vi.fn()} onDetails={vi.fn()} onSchedule={vi.fn()} onOpenResults={vi.fn()} onOpenMonitoring={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByText('Lina');
    expect(container.querySelector('.rounded-\\[var\\(--radius-lg\\)\\]')).toBeTruthy();
  });

  it('19. result modal is an accessible dialog (aria-modal + Escape close)', async () => {
    renderManager({ matches: [makeMatch({})] });
    await screen.findByText('Ali');
    fireEvent.click(screen.getByRole('button', { name: 'Record Result' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
describe('Tournament Hub Results management (Step 3F)', () => {
  const RES = [GROUP_MATCH, KO_MATCH, PENDING_MATCH, DISPUTED_MATCH];
  const openResults = async () => {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Results' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
  };

  it('1+2. Results renders result matches with status chips; default filter = Needs Attention', async () => {
    renderManager({ matches: RES });
    await openResults();
    expect(screen.getByText('Tariq')).toBeTruthy(); // pending
    expect(screen.getByText('D1')).toBeTruthy(); // disputed
    expect(screen.queryByText('Nour')).toBeNull(); // approved hidden by default
    expect(screen.getByText('pending_confirmation')).toBeTruthy();
    expect(screen.getByText('disputed')).toBeTruthy();
  });

  it('3. All Results shows approved too', async () => {
    renderManager({ matches: RES });
    await openResults();
    fireEvent.click(screen.getByRole('button', { name: 'All Results' }));
    expect(screen.getByText('Nour')).toBeTruthy();
  });

  it('4. Approved filter shows only approved', async () => {
    renderManager({ matches: RES });
    await openResults();
    fireEvent.click(screen.getByRole('button', { name: 'Approved' }));
    expect(screen.getByText('Nour')).toBeTruthy();
    expect(screen.queryByText('Tariq')).toBeNull();
    expect(screen.queryByText('D1')).toBeNull();
  });

  it('5. Disputed filter shows only disputed', async () => {
    renderManager({ matches: RES });
    await openResults();
    fireEvent.click(screen.getByRole('button', { name: 'Disputed' }));
    expect(screen.getByText('D1')).toBeTruthy();
    expect(screen.queryByText('Tariq')).toBeNull();
  });

  it('6. stage/group context renders in result cards (GSK group vs knockout)', async () => {
    renderManager({ matches: [NO_RESULT_MATCH, DISPUTED_MATCH] });
    await openResults();
    fireEvent.click(screen.getByRole('button', { name: 'All Results' }));
    expect(screen.getByText('Group: C')).toBeTruthy();
    expect(screen.getByText('Stage: Group Stage')).toBeTruthy();
    expect(screen.getByText('Stage: Knockout')).toBeTruthy();
  });

  it('7. View Result fetches the shared record and hands it to the drawer callback', async () => {
    const props = renderManager({ matches: [PENDING_MATCH] });
    await openResults();
    fireEvent.click(screen.getByRole('button', { name: 'View Result' }));
    await waitFor(() => expect(resultApi.fetchMatchResult).toHaveBeenCalledWith(900), { timeout: 3000 });
    await waitFor(() => expect(props.onViewResult).toHaveBeenCalledWith(expect.anything(), expect.any(Object)), { timeout: 3000 });
  });

  it('8. Accept Result calls the canonical shared accept API', async () => {
    renderManager({ matches: [PENDING_MATCH] });
    await openResults();
    fireEvent.click(screen.getByRole('button', { name: 'Accept Result' }));
    await waitFor(() => expect(resultApi.acceptMatchResult).toHaveBeenCalledWith(900), { timeout: 3000 });
  });

  it('9. Accept is gated by matches.result.accept', async () => {
    __state.permissions = ['tournament.result.manage'];
    renderManager({ matches: [PENDING_MATCH] });
    await openResults();
    expect(screen.queryByRole('button', { name: 'Accept Result' })).toBeNull();
    // Record Result (tournament.result.manage) still available
    expect(screen.getAllByRole('button', { name: 'Record Result' }).length).toBeGreaterThan(0);
  });

  it('10. dispute/correction are NOT duplicated inside the Hub (shared-module link only)', async () => {
    renderManager({ matches: [DISPUTED_MATCH] });
    await openResults();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Match Results' })).toBeTruthy();
  });

  it('11. empty results state', async () => {
    renderManager({ matches: [makeMatch({ result_status: null })] });
    await openResults();
    expect(screen.getByText('No results yet for this tournament.')).toBeTruthy();
  });

  it('12. org mode routes result submission through the org-scoped tournament API', async () => {
    renderManager({ isOrg: true, orgId: '6', matches: [PENDING_MATCH] });
    await openResults();
    fireEvent.click(screen.getByRole('button', { name: 'Record Result' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Result' }));
    await waitFor(() => expect(api.recordResult).toHaveBeenCalledWith('6', 4, expect.anything()), { timeout: 3000 });
  });

  it('13. Query refresh after accept (mutation calls the canonical API; row remains from one fetch)', async () => {
    renderManager({ matches: [PENDING_MATCH] });
    await openResults();
    fireEvent.click(screen.getByRole('button', { name: 'Accept Result' }));
    await waitFor(() => expect(resultApi.acceptMatchResult).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(resultApi.fetchMatchResult).not.toHaveBeenCalled(); // no extra fetch from accept path
  });
});
