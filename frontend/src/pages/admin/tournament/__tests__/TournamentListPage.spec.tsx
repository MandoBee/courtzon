import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentListPage from '../TournamentListPage';

const __state = vi.hoisted(() => ({
  adminApi: {
    getTournaments: vi.fn(),
    updateTournament: vi.fn(),
    publish: vi.fn(),
    openRegistration: vi.fn(),
    closeRegistration: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    archive: vi.fn(),
  },
  orgApi: {
    getTournaments: vi.fn(),
    updateTournament: vi.fn(),
    publish: vi.fn(),
    openRegistration: vi.fn(),
    closeRegistration: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    archive: vi.fn(),
  },
  listPayload: {
    data: [
      {
        id: 1,
        name: 'Padel Test Tournament',
        code: null,
        format: 'knockout',
        category: null,
        status: 'draft',
        max_players: 16,
        max_participants: 16,
        start_date: '2026-10-01T00:00:00.000Z',
        end_date: '2026-10-05T00:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  },
}));

vi.mock('../../../../services/tournament', () => ({
  tournamentApi: __state.adminApi,
  orgTournamentApi: __state.orgApi,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

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
  __state.adminApi.getTournaments.mockResolvedValue(__state.listPayload);
  __state.orgApi.getTournaments.mockResolvedValue(__state.listPayload);
});

describe('TournamentListPage — populated list contract (UAT "e is not a function" regression)', () => {
  it('admin mode renders Tournament ID 1 without a crash (translation fn not shadowed by the row)', async () => {
    renderPage('/admin/tournament/list', '/admin/tournament/list', <TournamentListPage mode="admin" />);

    expect(await screen.findByText('Padel Test Tournament')).toBeTruthy();
    // The status badge renders through the translation function t(...); before the
    // fix the map callback shadowed `t` with the tournament row and threw
    // `t is not a function` -> minified `e is not a function`.
    expect(screen.getAllByText('tournaments.status.draft').length).toBeGreaterThan(0);
    expect(screen.getAllByText('tournaments.action.publish').length).toBeGreaterThan(0);
    expect(screen.getAllByText('16').length).toBeGreaterThan(0);
  });

  it('org mode renders the same populated list without a crash', async () => {
    renderPage('/org/6/tournaments', '/org/:orgId/tournaments', <TournamentListPage mode="org" orgId="6" />);

    expect(await screen.findByText('Padel Test Tournament')).toBeTruthy();
    expect(screen.getAllByText('tournaments.status.draft').length).toBeGreaterThan(0);
  });
});