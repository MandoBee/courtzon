import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import TournamentSchedulePage from '../TournamentSchedulePage';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  tApi: {
    getTournament: vi.fn(),
    getMatches: vi.fn(),
  },
  orgTApi: {
    getTournament: vi.fn(),
    getMatches: vi.fn(),
  },
  pApi: {
    getEligibleCourts: vi.fn(),
  },
  orgPApi: {
    getEligibleCourts: vi.fn(),
  },
}));

vi.mock('../../../../services/tournament', () => ({
  tournamentApi: __state.tApi,
  orgTournamentApi: __state.orgTApi,
  tournamentParticipantApi: __state.pApi,
  orgTournamentParticipantApi: __state.orgPApi,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }),
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ permission, children }: { permission: string; children: ReactNode }) => {
    const perms = __state.userPermissions;
    if (perms.includes('*') || perms.includes(permission)) return <>{children}</>;
    return null;
  },
}));

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const tournamentFixture = {
  id: 42,
  name: 'Padel Cup',
  start_date: '2026-10-01T00:00:00.000Z',
  end_date: '2026-10-05T00:00:00.000Z',
  daily_start_time: '09:00:00',
  daily_end_time: '18:00:00',
};

const matchesFixture = [
  {
    id: 1,
    match_id: 101,
    round_name: 'Final',
    participant1_name: 'Alpha',
    participant2_name: 'Beta',
    start_time: '2026-10-03T09:00:00',
    booking_id: null,
    resource_id: null,
  },
];

const courtsFixture = [
  { id: 7, name: 'Court 1', opening_time: '08:00:00', closing_time: '22:00:00' },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/tournament/list/42/schedule']}>
        <Routes>
          <Route path="/admin/tournament/list/:id/schedule" element={<TournamentSchedulePage mode="admin" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.userPermissions = ['*'];
  __state.tApi.getTournament.mockResolvedValue(tournamentFixture);
  __state.tApi.getMatches.mockResolvedValue(matchesFixture);
  __state.pApi.getEligibleCourts.mockResolvedValue(courtsFixture);
  __state.orgTApi.getTournament.mockResolvedValue(tournamentFixture);
  __state.orgTApi.getMatches.mockResolvedValue(matchesFixture);
  __state.orgPApi.getEligibleCourts.mockResolvedValue(courtsFixture);
});

describe('TournamentSchedulePage — F-02 fetch-error handling (UX-8)', () => {
  it('renders the schedule window, match table, and eligible courts when all queries succeed', async () => {
    renderPage();

    expect(await screen.findByText('Final')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText(/Tournament window/)).toBeTruthy();
    expect(screen.getByText('Eligible Courts')).toBeTruthy();
    expect(screen.getByText('Court 1')).toBeTruthy();
    expect(screen.queryByText('Unable to load matches.')).toBeNull();
    expect(screen.queryByText('Unable to load courts.')).toBeNull();
    expect(screen.queryByText('Unable to load tournament.')).toBeNull();
  });

  it('matches query failure shows an error + Retry instead of the false "no matches generated" empty state, and Retry recovers', async () => {
    __state.tApi.getMatches.mockRejectedValueOnce(new Error('network'));
    renderPage();

    await screen.findByText('Unable to load matches.');

    // The failure must NEVER present itself as legitimate empty schedule data.
    expect(screen.queryByText('No matches generated yet. Lock the draw, then generate the match set.')).toBeNull();
    expect(screen.queryByText('Final')).toBeNull();

    // Unrelated sections are still served — courts render independently.
    expect(screen.getByText('Eligible Courts')).toBeTruthy();
    expect(screen.getByText('Court 1')).toBeTruthy();

    // Retry refetches the matches query and renders the table.
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Final')).toBeTruthy();
    expect(screen.queryByText('Unable to load matches.')).toBeNull();
  });

  it('courts query failure shows an error + Retry without blocking the match table, and Retry recovers', async () => {
    __state.pApi.getEligibleCourts.mockRejectedValueOnce(new Error('network'));
    renderPage();

    await screen.findByText('Unable to load courts.');

    // Independent query handling — the schedule table still works.
    expect(screen.getByText('Final')).toBeTruthy();
    expect(screen.queryByText('Court 1')).toBeNull();

    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Court 1')).toBeTruthy();
    expect(screen.queryByText('Unable to load courts.')).toBeNull();
  });

  it('tournament context query failure shows an inline error + Retry without blocking scheduling, and Retry recovers', async () => {
    __state.tApi.getTournament.mockRejectedValueOnce(new Error('network'));
    renderPage();

    await screen.findByText('Unable to load tournament.');

    // Matches and courts still render while the header context is in error.
    expect(screen.getByText('Final')).toBeTruthy();
    expect(screen.getByText('Court 1')).toBeTruthy();
    expect(screen.queryByText(/Tournament window/)).toBeNull();

    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText(/Tournament window/)).toBeTruthy();
    expect(screen.queryByText('Unable to load tournament.')).toBeNull();
  });

  it('preserves the genuine empty state when matches are truly empty and no courts exist', async () => {
    __state.tApi.getMatches.mockResolvedValue([]);
    __state.pApi.getEligibleCourts.mockResolvedValue([]);
    renderPage();

    await screen.findByText('No matches generated yet. Lock the draw, then generate the match set.');

    // No error states leak in on the success/empty path.
    expect(screen.queryByText('Unable to load matches.')).toBeNull();
    expect(screen.queryByText('Unable to load courts.')).toBeNull();
    expect(screen.queryByText('Unable to load tournament.')).toBeNull();
    // Genuinely-empty courts keep the pre-existing behavior: section hidden.
    expect(screen.queryByText('Eligible Courts')).toBeNull();
    expect(screen.queryByText('Final')).toBeNull();
  });
});