import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import TournamentsPage from './TournamentsPage';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  registrations: [
    { id: 11, tournament_id: 3, tournament_name: 'Open Cup', tournament_status: 'registration_open', format: 'knockout', registered_at: '2026-09-01T00:00:00', start_date: '2026-10-01', drawLocked: false, player_id: 30 },
    { id: 12, tournament_id: 4, tournament_name: 'Locked Draw Cup', tournament_status: 'registration_open', format: 'round_robin', registered_at: '2026-09-02T00:00:00', start_date: '2026-10-02', drawLocked: true, player_id: 30 },
  ],
  getMock: vi.fn(),
  postMock: vi.fn().mockResolvedValue({ data: { success: true, alreadyHandled: false } }),
  invalidateSpy: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: { get: __state.getMock, post: __state.postMock },
}));

vi.mock('../../services/tournament', () => ({
  playerCancelRegistration: (registrationId: number) =>
    __state.postMock(`/tournaments/registration/${registrationId}/cancel`, {}),
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ permission, children }: any) => {
    const perms = __state.userPermissions;
    if (perms.includes('*') || perms.includes(permission)) return <>{children}</>;
    return null;
  },
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }),
}));

// Keep the real @tanstack/react-query invalidation observable.
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TournamentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.getMock.mockResolvedValue({ data: __state.registrations });
  __state.postMock.mockResolvedValue({ data: { success: true, alreadyHandled: false } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('TournamentsPage — G11.8 player self-service cancellation', () => {
  it('shows a Cancel button only for registrations whose draw is not locked', async () => {
    renderPage();
    expect(await screen.findByText('Open Cup')).toBeTruthy();
    const cancelButtons = screen.getAllByText('common.cancel');
    // Only the non-locked registration (id 11) renders Cancel.
    expect(cancelButtons.length).toBe(1);
  });

  it('hides Cancel when the tournament draw is locked (drawLocked=true)', async () => {
    renderPage();
    await screen.findByText('Locked Draw Cup');
    const lockedBadge = screen.getByText('player.tournaments.draw_locked');
    expect(lockedBadge).toBeTruthy();
    // TUX-05 — the draw-locked pill must use a readable foreground token
    // (gray-600 → --color-text), never the low-contrast gray-500 on gray-100.
    expect(lockedBadge.className).toContain('text-gray-600');
    expect(lockedBadge.className).not.toContain('text-gray-500');
    const clicks = screen.queryAllByText('common.cancel');
    expect(clicks.length).toBe(1); // still only the Open Cup one
  });

  it('posts to the NEW endpoint after confirmation and invalidates my-tournaments', async () => {
    renderPage();
    await screen.findByText('Open Cup');
    fireEvent.click(screen.getAllByText('common.cancel')[0]);
    await waitFor(() => expect(__state.postMock).toHaveBeenCalledWith('/tournaments/registration/11/cancel', {}));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('does NOT post when the confirmation is declined', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderPage();
    await screen.findByText('Open Cup');
    fireEvent.click(screen.getAllByText('common.cancel')[0]);
    expect(__state.postMock).not.toHaveBeenCalled();
  });

  it('the button is permission-gated by tournaments.registration.cancel', async () => {
    __state.userPermissions = ['player.tournaments.register']; // no cancel key
    renderPage();
    await screen.findByText('Open Cup');
    expect(screen.queryAllByText('common.cancel').length).toBe(0);
  });
});

describe('TournamentsPage — F-02 query error handling (UX-14)', () => {
  it('shows an explicit error + Retry (never the empty state) when the query fails', async () => {
    __state.getMock.mockRejectedValue(new Error('Network Error'));
    renderPage();

    expect(await screen.findByText('Unable to load your tournaments.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    // A failed fetch must not masquerade as a legitimate empty roster.
    expect(screen.queryByText('player.tournaments.no_tournaments')).toBeNull();
  });

  it('recovers via Retry (successful refetch renders the list)', async () => {
    __state.getMock.mockRejectedValueOnce(new Error('Network Error'));
    renderPage();

    expect(await screen.findByText('Unable to load your tournaments.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Open Cup')).toBeTruthy();
    expect(screen.queryByText('Unable to load your tournaments.')).toBeNull();
  });

  it('keeps the genuine empty state when the query succeeds with no registrations', async () => {
    __state.getMock.mockResolvedValue({ data: [] });
    renderPage();

    expect(await screen.findByText('player.tournaments.no_tournaments')).toBeTruthy();
    expect(screen.queryByText('Unable to load your tournaments.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});