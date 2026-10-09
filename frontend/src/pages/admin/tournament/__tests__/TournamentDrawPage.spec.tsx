import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDrawPage from '../TournamentDrawPage';

type DrawEntry = {
  id: number;
  participant_id: number;
  position: number;
  display_name: string;
  seed_number: number | null;
  placement_source: string;
  overridden: number;
};
type CurrentDraw = {
  id: number;
  tournament_id: number;
  attempt_number: number;
  status: string;
  entries: DrawEntry[];
};

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  format: 'knockout' as string,
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
  } as Partial<CurrentDraw> | null,
  validation: { valid: true } as { valid: boolean; message?: string },
  errors: { tournament: false, participants: false, draw: false, validation: false } as Record<string, boolean>,
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
    if (__state.errors.validation && url.includes('/draw/validate')) return Promise.reject(new Error('validation failed'));
    if (__state.errors.draw && url.includes('/draw') && !url.includes('/draw/validate')) return Promise.reject(new Error('draw failed'));
    if (__state.errors.participants && url.includes('/participants')) return Promise.reject(new Error('participants failed'));
    if (url.includes('/draw/validate')) return Promise.resolve({ data: __state.validation });
    if (url.includes('/draw')) return Promise.resolve({ data: __state.currentDraw });
    if (url.includes('/participants')) return Promise.resolve({ data: __state.participants });
    if (__state.errors.tournament && (url.includes('/admin/tournaments/1') || url.includes('/org/1/tournaments/1'))) return Promise.reject(new Error('tournament failed'));
    if (url.includes('/admin/tournaments/1') || url.includes(`/org/1/tournaments/1`)) return Promise.resolve({ data: { id: 1, format: __state.format } });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.userPermissions = ['*'];
  __state.format = 'knockout';
  __state.currentDraw = {
    id: 10, tournament_id: 1, attempt_number: 1, status: 'draft',
    entries: [
      { id: 1, participant_id: 1, position: 0, display_name: 'Player A', seed_number: 1, placement_source: 'auto', overridden: 0 },
      { id: 2, participant_id: 2, position: 1, display_name: 'Player B', seed_number: null, placement_source: 'auto', overridden: 0 },
      { id: 3, participant_id: 3, position: 2, display_name: 'Player C', seed_number: null, placement_source: 'auto', overridden: 0 },
      { id: 4, participant_id: 4, position: 3, display_name: 'Player D', seed_number: null, placement_source: 'auto', overridden: 0 },
    ],
  };
  __state.validation = { valid: true };
  __state.errors = { tournament: false, participants: false, draw: false, validation: false };
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

describe('TournamentDrawPage — bracket rendering contract (Part 4)', () => {
  it('knockout: renders ROUND 1 (actual filled slots), Semi-final and Final as awaiting-winner structure', async () => {
    renderPage();
    // Round-1 actual participants
    expect((await screen.findAllByText('Player A')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Player B').length).toBeGreaterThan(0);
    // Structural later rounds: 4 participants → Semi-final + Final columns (awaiting winner)
    expect(screen.getByText('Semi-final')).toBeTruthy();
    expect(screen.getByText('Final')).toBeTruthy();
    expect(screen.getAllByText(/awaiting winner/).length).toBeGreaterThan(0);
  });

  it('round_robin: shows round-by-round pairings (NOT a knockout bracket)', async () => {
    __state.format = 'round_robin';
    renderPage();
    expect(await screen.findAllByText('Round 1')).toBeTruthy();
    expect(screen.getAllByText(/Round \d/).length).toBeGreaterThanOrEqual(3); // 4 participants → 3 rounds
  });

  it('unsupported format: shows an explicit unsupported state (no fabricated bracket)', async () => {
    __state.format = 'double_elimination';
    renderPage();
    expect(await screen.findByText('Unsupported bracket type')).toBeTruthy();
    expect(screen.queryByText('Semi-final')).toBeNull();
  });
});

describe('TournamentDrawPage — F-02 fetch-error states', () => {
  it('tournament failure: shows error + Retry in the board area (never the "Generate a draw" empty hint) while the participant sidebar still renders; Retry recovers the board', async () => {
    __state.errors.tournament = true;
    renderPage();
    expect(await screen.findByText('Unable to load tournament.')).toBeTruthy();
    // The failure must NOT masquerade as a fresh/no-draw state.
    expect(screen.queryByText('Generate a draw to start placing participants.')).toBeNull();
    expect(screen.queryByText('Semi-final')).toBeNull();
    // Independent queries still render — participants sidebar stays available.
    expect(screen.getByText('Pair Alpha')).toBeTruthy();
    // Retry recovery restores the board.
    __state.errors.tournament = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Semi-final')).toBeTruthy();
  });

  it('participants failure: sidebar shows error + Retry (not "No participants yet.") while the draw board still renders; Retry recovers the list', async () => {
    __state.errors.participants = true;
    renderPage();
    expect(await screen.findByText('Unable to load participants.')).toBeTruthy();
    expect(screen.queryByText('No participants yet.')).toBeNull();
    // The board is draw-derived and must remain available.
    expect(screen.getByText('Semi-final')).toBeTruthy();
    // Retry recovery restores the sidebar participant list.
    __state.errors.participants = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Player P1 + Player P2')).toBeTruthy();
  });

  it('draw failure: shows error + Retry (never a fake empty bracket) while the sidebar still renders; Retry recovers the board', async () => {
    __state.errors.draw = true;
    renderPage();
    expect(await screen.findByText('Unable to load draw.')).toBeTruthy();
    // The failure must NOT present a fabricated empty board (no slots, no structure).
    expect(screen.queryByText('drop here')).toBeNull();
    expect(screen.queryByText('Semi-final')).toBeNull();
    // Generating on unknown draw state must be disabled — never a blind re-draw.
    expect((screen.getByText('Generate Draw') as HTMLButtonElement).disabled).toBe(true);
    // Independent queries still render — participants sidebar stays available.
    expect(screen.getByText('Pair Alpha')).toBeTruthy();
    // Retry recovery restores the draw board.
    __state.errors.draw = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Semi-final')).toBeTruthy();
  });

  it('validation failure: shows error + Retry while the board still renders; Retry re-validates', async () => {
    __state.errors.validation = true;
    renderPage();
    expect(await screen.findByText('Unable to load draw validation.')).toBeTruthy();
    expect(screen.getByText('Semi-final')).toBeTruthy();
    // Retry recovery re-runs validation and surfaces the warning again.
    __state.errors.validation = false;
    __state.validation = { valid: false, message: 'Seed violation detected.' };
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText(/Seed violation detected/)).toBeTruthy();
  });

  it('genuine empty (no draw yet + no participants) is preserved — no error text', async () => {
    __state.currentDraw = null;
    __state.participants = [];
    renderPage();
    // Real empty states keep their original copy:
    expect(await screen.findByText('No participants yet.')).toBeTruthy();
    // A genuine non-error empty board still renders its empty slots:
    expect(screen.getAllByText('drop here').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Unable to load/)).toBeNull();
    // And the draw query SUCCEEDED (legitimately absent) — Generate Draw must
    // remain enabled so the operator can create the first draw.
    const genBtn = screen.getByText('Generate Draw') as HTMLButtonElement;
    expect(genBtn.disabled).toBe(false);
  });

  it('independent failures stack: tournament + draw each render their own error panel with Retry', async () => {
    __state.errors.tournament = true;
    __state.errors.draw = true;
    renderPage();
    expect(await screen.findByText('Unable to load tournament.')).toBeTruthy();
    expect(screen.getByText('Unable to load draw.')).toBeTruthy();
    expect(screen.getAllByText('Retry').length).toBeGreaterThanOrEqual(2);
  });
});