import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentAwardsPage from '../TournamentAwardsPage';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  tournament: { id: 1, name: 'Awards Cup', currency_code: 'EGP' },
  awards: [
    { id: 11, tournament_id: 1, prize_id: 5, placement: 1, registration_id: 3, winner_user_id: 30, winner_name: 'Winner A', amount: '500.00', currency_code: 'EGP', funding_source: 'organization', collection_method: 'card', status: 'credited', bind_source: 'bracket' },
    { id: 12, tournament_id: 1, prize_id: 6, placement: 2, registration_id: 4, winner_user_id: 31, winner_name: 'Winner B', amount: '250.00', currency_code: 'EGP', funding_source: 'organization', collection_method: 'cash', status: 'refunded', bind_source: 'standings' },
  ],
  prizes: [
    { id: 5, placement: 1, prize_type: 'cash', description: 'Winner', amount: '500.00', currency_code: 'EGP' },
    { id: 6, placement: 2, prize_type: 'cash', description: 'Runner-up', amount: '250.00', currency_code: 'EGP' },
  ],
  participants: [
    { id: 3, registration_id: 3, name: 'Winner A', member_user_ids: [30] },
    { id: 4, registration_id: 4, name: 'Winner B', member_user_ids: [31] },
  ],
  errors: { tournament: false, awards: false, prizes: false, participants: false } as Record<string, boolean>,
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('../../../../services/api', () => ({
  default: { get: __state.getMock, post: __state.postMock, put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ permission, children }: any) => {
    const perms = __state.userPermissions;
    if (perms.includes('*') || perms.includes(permission)) return <>{children}</>;
    return null;
  },
}));

// G11.14 — the page gates its award DATA QUERIES with useCan; align the test's
// permission harness so the mock mirrors the same permission set as <Can>.
vi.mock('../../../../hooks/useCan', () => ({
  useCan: () => ({
    can: (permission: string) => __state.userPermissions.includes('*') || __state.userPermissions.includes(permission),
  }),
}));

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import api from '../../../../services/api';

function renderPage(permissions: string[], initialEntry = '/admin/tournament/list/1/awards') {
  __state.userPermissions = permissions;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin/tournament/list/:id/awards" element={<TournamentAwardsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.errors = { tournament: false, awards: false, prizes: false, participants: false };
  __state.getMock.mockImplementation((url: string) => {
    if (url.includes('/awards/prizes') && __state.errors.prizes) return Promise.reject(new Error('prizes failed'));
    if (url.includes('/awards') && !url.includes('/prizes') && __state.errors.awards) return Promise.reject(new Error('awards failed'));
    if (url.includes('/participants') && __state.errors.participants) return Promise.reject(new Error('participants failed'));
    if (url.includes('/admin/tournaments') && !url.includes('/awards') && !url.includes('/participants') && __state.errors.tournament) return Promise.reject(new Error('tournament failed'));
    if (url.includes('/awards/prizes')) return Promise.resolve({ data: __state.prizes });
    if (url.includes('/awards')) return Promise.resolve({ data: __state.awards });
    if (url.includes('/participants')) return Promise.resolve({ data: __state.participants });
    return Promise.resolve({ data: __state.tournament }); // tournament detail
  });
  __state.postMock.mockResolvedValue({ data: {} });
});

describe('TournamentAwardsPage — G11.5 award management (G11 Phase 4)', () => {
  it('lists awards and the grant form when the holder has awards.view/grant', async () => {
    renderPage(['tournaments.awards.view', 'tournaments.awards.grant', 'tournaments.awards.refund']);
    expect(await screen.findByText('Winner A')).toBeTruthy();
    expect(screen.getByText('Winner B')).toBeTruthy();
    // Grant panel is gated by tournaments.awards.grant.
    expect(screen.getByText(/Grant prize to a participant/i)).toBeTruthy();
    expect(api.get).toHaveBeenCalled();
  });

  it('refund action is only offered for credited awards and requires awards.refund', async () => {
    renderPage(['tournaments.awards.view', 'tournaments.awards.refund']);
    await screen.findByText('Winner A'); // credited
    // Exactly ONE refund button (credited award only; the refunded award has none).
    const refundButtons = await waitFor(() => screen.getAllByRole('button', { name: /^Refund$/i }));
    expect(refundButtons.length).toBe(1);

    // TUX-05 — the refunded status pill must use a readable foreground token
    // (gray-600 → --color-text), never the low-contrast gray-500 on gray-100.
    const refundedBadge = screen.getByText('refunded');
    expect(refundedBadge.className).toContain('text-gray-600');
    expect(refundedBadge.className).not.toContain('text-gray-500');
  });

  it('grant button is hidden for a holder without tournaments.awards.grant (authorization)', async () => {
    renderPage(['tournaments.awards.view']);
    await screen.findByText('Winner A');
    expect(screen.queryByText(/Grant prize to a participant/i)).toBeNull();
  });

  it('grant mutation posts to the existing org-funded backend route (no platform path)', async () => {
    const { fireEvent: fe } = await import('@testing-library/react');
    renderPage(['tournaments.awards.view', 'tournaments.awards.grant']);
    await screen.findByText('Winner A');
    // Select the prize + winner and grant.
    const selects = Array.from(document.querySelectorAll('select'));
    const prizeSelect = selects.find((s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent?.includes('500.00')))!;
    fe.change(prizeSelect, { target: { value: '5' } });
    const winnerSelect = selects.find((s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent?.includes('Winner A (30)')))!;
    fe.change(winnerSelect, { target: { value: '30' } });
    fe.click(screen.getByText('Grant prize'));
    await waitFor(() => expect(__state.postMock).toHaveBeenCalled());
    const [url, body] = __state.postMock.mock.calls[0] as [string, any];
    expect(url).toBe('/admin/tournaments/1/awards');
    expect(body).toMatchObject({ prizeId: 5, winnerUserId: 30 });
  });
});

// Every option across both selects (prize + winner), as plain text for assertions.
function optionTexts() {
  return Array.from(document.querySelectorAll('option')).map((o) => o.textContent ?? '');
}

describe('TournamentAwardsPage — F-02 fetch-error states', () => {
  it('awards failure: shows error + Retry instead of "No prize awards yet." while the grant card still renders; Retry recovers the rows', async () => {
    __state.errors.awards = true;
    renderPage(['tournaments.awards.view', 'tournaments.awards.grant']);
    expect(await screen.findByText('Unable to load prize awards.')).toBeTruthy();
    // A failed awards fetch must never masquerade as a legitimate empty list.
    expect(screen.queryByText('No prize awards yet.')).toBeNull();
    expect(screen.queryByText('Winner A')).toBeNull();
    // Independent grant card still renders.
    expect(screen.getByText(/Grant prize to a participant/i)).toBeTruthy();
    // Retry recovery restores the award rows.
    __state.errors.awards = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Winner A')).toBeTruthy();
  });

  it('prizes failure: shows error + Retry, grant stays disabled (no selectable prize), winner dropdown independent; Retry recovers the prize list', async () => {
    __state.errors.prizes = true;
    renderPage(['tournaments.awards.view', 'tournaments.awards.grant']);
    expect(await screen.findByText('Unable to load prizes.')).toBeTruthy();
    expect(optionTexts().some((s) => s.includes('#1 Winner'))).toBe(false);
    // With the prize source empty the grant can never fire on an unknown target.
    expect((screen.getByText('Grant prize') as HTMLButtonElement).disabled).toBe(true);
    // The participants query is independent — winner options still render.
    await waitFor(() => expect(optionTexts().some((s) => s.includes('Winner A (30)'))).toBe(true));
    // Retry recovery restores the prize options.
    __state.errors.prizes = false;
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(optionTexts().some((s) => s.includes('#1 Winner'))).toBe(true));
  });

  it('participants failure: shows error + Retry, grant stays disabled (no selectable winner), prize dropdown independent; Retry recovers winner options', async () => {
    __state.errors.participants = true;
    renderPage(['tournaments.awards.view', 'tournaments.awards.grant']);
    expect(await screen.findByText('Unable to load participants.')).toBeTruthy();
    expect(optionTexts().some((s) => s.includes('Winner A (30)'))).toBe(false);
    expect((screen.getByText('Grant prize') as HTMLButtonElement).disabled).toBe(true);
    // The prizes query is independent — prize options still render.
    await waitFor(() => expect(optionTexts().some((s) => s.includes('#1 Winner'))).toBe(true));
    // Retry recovery restores the winner options.
    __state.errors.participants = false;
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(optionTexts().some((s) => s.includes('Winner A (30)'))).toBe(true));
  });

  it('tournament failure: header shows error + Retry instead of "—" while awards still render; Retry recovers the name', async () => {
    __state.errors.tournament = true;
    renderPage(['tournaments.awards.view']);
    expect(await screen.findByText('Unable to load tournament.')).toBeTruthy();
    expect(screen.queryByText('Awards Cup')).toBeNull();
    // The awards query is independent — rows still render.
    expect(await screen.findByText('Winner A')).toBeTruthy();
    // Retry recovery restores the tournament header.
    __state.errors.tournament = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText(/Awards Cup/)).toBeTruthy();
  });

  it('genuine empty awards are preserved — "No prize awards yet." with no error text and a working grant form', async () => {
    __state.awards = [];
    renderPage(['tournaments.awards.view', 'tournaments.awards.grant']);
    expect(await screen.findByText('No prize awards yet.')).toBeTruthy();
    expect(screen.queryByText(/Unable to load/)).toBeNull();
    // The grant form still works on a genuinely empty award list (prizes + winners load).
    await waitFor(() => {
      expect(optionTexts().some((s) => s.includes('#1 Winner'))).toBe(true);
      expect(optionTexts().some((s) => s.includes('Winner A (30)'))).toBe(true);
    });
  });

  it('independent failures stack: prizes + awards each render their own panel with Retry', async () => {
    __state.errors.prizes = true;
    __state.errors.awards = true;
    renderPage(['tournaments.awards.view', 'tournaments.awards.grant']);
    expect(await screen.findByText('Unable to load prize awards.')).toBeTruthy();
    expect(screen.getByText('Unable to load prizes.')).toBeTruthy();
    expect(screen.getAllByText('Retry').length).toBeGreaterThanOrEqual(2);
  });
});