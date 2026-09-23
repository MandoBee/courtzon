import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDrawPage from '../TournamentDrawPage';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  participants: [
    { id: 1, participant_type: 'individual', name: null, display_name: 'Player A', status: 'active', seed: { seed_number: 1, source: 'manual' } },
    { id: 2, participant_type: 'individual', name: null, display_name: 'Player B', status: 'active', seed: null },
    { id: 3, participant_type: 'pair', name: 'Pair Alpha', display_name: 'Pair Alpha', status: 'active', seed: { seed_number: 2, source: 'rating', rating_snapshot: 1800 }, members: [{ id: 1, user_id: 30, full_name: 'Player P1', status: 'active', member_order: 0 }, { id: 2, user_id: 31, full_name: 'Player P2', status: 'active', member_order: 1 }] },
  ],
  currentDraw: {
    id: 10, tournament_id: 1, attempt_number: 1, status: 'draft',
    entries: [
      { id: 1, participant_id: 1, position: 0, display_name: 'Player A', seed_number: 1, placement_source: 'auto', overridden: 0 },
      { id: 2, participant_id: 2, position: 1, display_name: 'Player B', seed_number: null, placement_source: 'auto', overridden: 0 },
    ],
  },
  validation: { valid: true } as { valid: boolean; message?: string },
}));

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn(),
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
      <MemoryRouter initialEntries={['/admin/tournament/list/1/draw']}>
        <Routes>
          <Route path="/admin/tournament/list/:id/draw" element={<TournamentDrawPage mode="admin" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockApi() {
  (api.get as any).mockImplementation((url: string) => {
    if (url.includes('/draw/validate')) return Promise.resolve({ data: __state.validation });
    if (url.includes('/draw')) return Promise.resolve({ data: __state.currentDraw });
    if (url.includes('/participants')) return Promise.resolve({ data: __state.participants });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.userPermissions = ['*'];
  __state.currentDraw = {
    id: 10, tournament_id: 1, attempt_number: 1, status: 'draft',
    entries: [
      { id: 1, participant_id: 1, position: 0, display_name: 'Player A', seed_number: 1, placement_source: 'auto', overridden: 0 },
      { id: 2, participant_id: 2, position: 1, display_name: 'Player B', seed_number: null, placement_source: 'auto', overridden: 0 },
    ],
  };
  __state.validation = { valid: true };
  mockApi();
});

describe('TournamentDrawPage — G8', () => {
  it('renders the draw board with participants, seeds and a pair members list', async () => {
    renderPage();
    expect(await screen.findAllByText('Player A')).toBeTruthy();
    // 'Player B' appears in the sidebar AND in a draw slot.
    expect(screen.getAllByText('Player B').length).toBeGreaterThan(0);
    expect(screen.getByText('Pair Alpha')).toBeTruthy();
    expect(screen.getByText('Player P1 + Player P2')).toBeTruthy();
    // seed #1 (manual) + rating snapshot display for the pair seed #2
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0);
    expect(screen.getByText('Rating: 1800%')).toBeTruthy();
    expect(screen.getByText(/attempt #1/)).toBeTruthy();
  });

  it('shows explicit warnings when the draw is invalid', async () => {
    __state.validation = { valid: false, message: 'Seed #2 must occupy the protected position.' };
    renderPage();
    expect(await screen.findByText(/Seed #2 must occupy/)).toBeTruthy();
  });

  it('approve + lock actions are gated behind the manage permission (RBAC)', async () => {
    __state.userPermissions = ['tournament.view'];
    renderPage();
    await screen.findAllByText('Player A');
    expect(screen.queryByText('Approve Draw')).toBeNull();
    expect(screen.queryByText('Lock Draw')).toBeNull();
  });

  it('locked draw disables movement and warns', async () => {
    __state.currentDraw = { ...__state.currentDraw, status: 'locked' };
    renderPage();
    await screen.findAllByText('Player A');
    expect(screen.getAllByText(/The draw is finalized/).length).toBeGreaterThan(0);
  });

  it('generate/re-draw calls the draw endpoint (post)', async () => {
    renderPage();
    await screen.findAllByText('Player A');
    const btn = screen.getAllByText('Re-Draw')[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect((api.post as any).mock.calls.some((c: any[]) => c[0].includes('/draw'))).toBe(true), { timeout: 3000 });
  });
});