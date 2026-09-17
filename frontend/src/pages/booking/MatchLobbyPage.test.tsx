import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MatchLobbyPage from './MatchLobbyPage';
import { ToastProvider } from '../../components/ui/Toast';

const __state = vi.hoisted(() => ({
  match: {
    id: 42,
    type: 'public',
    status: 'open',
    sport_name: 'Padel',
    resource_name: 'Court 1',
    organisation_name: 'Org',
    branch_name: 'Main',
    booking_date: '2026-09-20',
    start_time: '14:00:00',
    end_time: '15:00:00',
    participant_count: 1,
    max_players: 2,
    auto_accept: 0,
    participants_json: JSON.stringify([{ userId: 1, role: 'host', fullName: 'Me' }]),
    is_participant: true,
    creator_id: 1,
    result_state: 'none',
  } as any,
}));

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (String(url).endsWith('/matches/42')) {
        return Promise.resolve({ data: { data: __state.match } });
      }
      if (String(url).endsWith('/matches/42/result')) {
        return Promise.resolve({ data: { data: { record: null, participants: [] } } });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    }),
    post: vi.fn(),
  },
}));

vi.mock('../../services/socket', () => ({
  socketService: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../../services/match-result.api', () => ({
  fetchMatchResult: vi.fn(() => Promise.resolve({ record: null, participants: [] })),
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 1 } }),
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../components/booking/ManageApplicantsPopup', () => ({
  default: () => <div data-testid="applicants-popup" />,
}));

vi.mock('../../components/match-result/ResultSummaryView', () => ({
  default: () => <div data-testid="result-summary">summary</div>,
}));

vi.mock('../../components/booking/MatchErrorState', () => ({
  default: () => <div>Match error</div>,
}));

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/matches/42']}>
          <Routes>
            <Route path="/matches/:id" element={<MatchLobbyPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe('MatchLobbyPage — creator actions on terminal matches (UAT)', () => {
  beforeEach(() => {
    __state.match.status = 'open';
    __state.match.result_state = 'none';
  });

  it('shows Manage Applicants / Close Applications / Cancel Match for an open match creator', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Manage Applicants')).toBeTruthy();
      expect(screen.getByText('Close Applications')).toBeTruthy();
      expect(screen.getByText('Cancel Match')).toBeTruthy();
    });
  });

  it.each(['completed', 'cancelled', 'void'])(
    'hides all active-match creator actions when the match is %s',
    async (status) => {
      __state.match.status = status;
      renderPage();
      await waitFor(() => expect(screen.getByText('Court 1')).toBeTruthy());
      expect(screen.queryByText('Manage Applicants')).toBeNull();
      expect(screen.queryByText('Close Applications')).toBeNull();
      expect(screen.queryByText('Cancel Match')).toBeNull();
      expect(screen.queryByText('Join Match')).toBeNull();
      expect(screen.queryByText('Join Waiting List')).toBeNull();
      expect(screen.queryByText('Withdraw')).toBeNull();
    },
  );
});