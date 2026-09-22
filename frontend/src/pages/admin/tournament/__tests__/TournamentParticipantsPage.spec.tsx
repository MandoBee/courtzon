import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentParticipantsPage from '../TournamentParticipantsPage';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  participants: [
    { id: 1, player_id: 10, display_name: 'Player A', global_rating: null, seed: null, draw_position: 0 },
    { id: 2, player_id: 20, display_name: 'Player B', global_rating: 1650, seed: { seed_number: 2, source: 'manual' }, draw_position: 1 },
    { id: 3, player_id: 30, display_name: 'Player C', global_rating: 1800, seed: { seed_number: 3, source: 'rating', rating_snapshot: 1800 }, draw_position: 2 },
  ],
  currentDraw: {
    id: 10, tournament_id: 1, attempt_number: 1, status: 'draft',
    entries: [
      { id: 1, participant_id: 1, position: 0, display_name: 'Player A', seed_number: 1, placement_source: 'auto', overridden: 0 },
      { id: 2, participant_id: 2, position: 1, display_name: 'Player B', seed_number: 2, placement_source: 'auto', overridden: 0 },
      { id: 3, participant_id: 3, position: 2, display_name: 'Player C', seed_number: 3, placement_source: 'auto', overridden: 0 },
    ],
  },
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/tournament/list/1/participants']}>
        <Routes>
          <Route path="/admin/tournament/list/:id/participants" element={<TournamentParticipantsPage mode="admin" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockApi() {
  (api.get as any).mockImplementation((url: string) => {
    if (url.includes('/participants')) return Promise.resolve({ data: __state.participants });
    if (url.includes('/draw')) return Promise.resolve({ data: __state.currentDraw });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.userPermissions = ['*'];
  mockApi();
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