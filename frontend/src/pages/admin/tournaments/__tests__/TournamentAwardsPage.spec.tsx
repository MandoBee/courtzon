import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  __state.getMock.mockImplementation((url: string) => {
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