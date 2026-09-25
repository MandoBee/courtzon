import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MatchListPage from './MatchListPage';
import { ToastProvider } from '../../components/ui/Toast';
import api from '../../services/api';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../services/socket', () => ({
  socketService: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, def?: string, _p?: Record<string, string | number>) => {
      const defaults: Record<string, string> = {
        'booking.qr_action': 'QR',
        'common.view': 'View',
        'matchResult.enterScore': 'Enter Score',
        'matchResult.view': 'View Score',
        'matchResult.expiredState': 'expired',
        'nav.matches': 'Matches',
        'nav.home': 'Home',
        'nav.bookings': 'Bookings',
        'nav.coaches': 'Coaches',
        'nav.tournaments': 'Tournaments',
        'nav.academies': 'Academies',
        'nav.messages': 'Messages',
        'nav.marketplace': 'Marketplace',
        'nav.profile': 'Profile',
        'nav.logout': 'Logout',
        'common.error': 'Error',
      };
      return defaults[key] ?? def ?? key;
    },
  }),
}));

const FUTURE_MATCH = {
  id: 101, type: 'public', status: 'open', sport_name: 'Padel',
  booking_id: 1001, public_id: 'pub-future-1', booking_status: 'confirmed',
  booking_date: '2026-09-20', start_time: '14:00:00', end_time: '15:00:00',
  start_at_utc: '2026-09-20T11:00:00.000Z',
  resource_name: 'Court 1', branch_name: 'MASPIRO', organisation_name: 'Org',
  latitude: null, longitude: null, auto_accept: 0, max_players: 2,
  participant_count: 1, target_gender: null, min_age: null, max_age: null,
  target_level_name: null, deadline: null,
  invitation_id: null, invitation_status: null, join_request_id: null, join_request_status: null,
  is_participant: 1, result_state: 'none', result_entry_open: 0, played_at: null,
};

const COMPLETED_MATCH = {
  ...FUTURE_MATCH,
  id: 102, booking_id: 1002, public_id: 'pub-completed-1',
  status: 'completed', booking_date: '2026-09-16', start_time: '14:00:00', end_time: '15:00:00',
  start_at_utc: '2026-09-16T11:00:00.000Z',
  is_participant: 1, result_state: 'enter', result_entry_open: 1, played_at: '2026-09-16T12:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === '/matches') return Promise.resolve({ data: { data: [FUTURE_MATCH] } });
    if (url === '/matches/my') return Promise.resolve({ data: { data: [FUTURE_MATCH, COMPLETED_MATCH] } });
    return Promise.resolve({ data: { data: [] } });
  });
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MatchListPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('MatchListPage — active vs History classification (Part 3)', () => {
  it('future joined match appears in the Joined tab', async () => {
    renderPage();
    await screen.findByText(/Joined/);
    fireEvent.click(screen.getByText(/Joined/));
    await waitFor(() => {
      expect(screen.getByText('Court 1')).toBeTruthy();
    });
  });

  it('completed match does NOT appear in Joined but DOES appear in History', async () => {
    renderPage();
    await screen.findByText(/Joined/);

    // Joined tab must NOT list the completed match.
    fireEvent.click(screen.getByText(/Joined/));
    await waitFor(() => {
      const cards = screen.queryAllByText('Court 1');
      // Only the future match (101) is listed; 102 (completed) is excluded.
      expect(cards.length).toBe(1);
    });

    // History tab lists the completed match with a View action.
    fireEvent.click(screen.getByText(/History/));
    await waitFor(() => {
      const viewLinks = screen.queryAllByText('View');
      expect(viewLinks.length).toBeGreaterThan(0);
    });
    // The completed match card is present in History.
    expect(screen.getAllByText('Court 1').length).toBeGreaterThan(0);
  });

  it('active match in Joined does not expose historical result controls when result_state is none', async () => {
    renderPage();
    await screen.findByText(/Joined/);
    fireEvent.click(screen.getByText(/Joined/));
    await waitFor(() => {
      // No "Enter Score" link is shown for the active match (result_state none).
      expect(screen.queryByText('Enter Score')).toBeNull();
    });
  });
});

describe('MatchListPage — sport display (Group 4)', () => {
  it('renders sport_name and sport_icon on the match card', async () => {
    const withIcon = { ...FUTURE_MATCH, sport_icon: '/uploads/sport/icon/padel.webp' };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/matches') return Promise.resolve({ data: { data: [withIcon] } });
      if (url === '/matches/my') return Promise.resolve({ data: { data: [withIcon] } });
      return Promise.resolve({ data: { data: [] } });
    });
    renderPage();
    await screen.findByText(/Joined/);
    fireEvent.click(screen.getByText(/Joined/));
    await screen.findByText('Padel');
    const img = document.querySelector('img[alt="Padel"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('padel.webp');
  });

  it('renders sport_name without an icon when icon data is absent', async () => {
    renderPage();
    await screen.findByText(/Joined/);
    fireEvent.click(screen.getByText(/Joined/));
    await screen.findByText('Padel');
    const img = document.querySelector('img[alt="Padel"]');
    expect(img).toBeNull();
  });
});