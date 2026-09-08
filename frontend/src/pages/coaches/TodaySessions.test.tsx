import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TodaySessions from './TodaySessions';
import api from '../../services/api';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../utils/formatDate', () => ({
  formatISODate: (d: string) => d,
}));

vi.mock('../../utils/dateRange', () => ({
  localToday: () => '2099-01-05',
}));

vi.mock('../../components/workspace', () => ({
  EmptyStateCard: ({ title }: any) => <div>{title}</div>,
  SessionTimeline: () => <div>timeline</div>,
}));

function makeSession(id: number, status: string) {
  return {
    id,
    player_name: `Player ${id}`,
    status,
    start_time: '2099-02-05T10:00:00',
    end_time: '2099-02-05T11:00:00',
    price: 200,
    currency_code: 'EGP',
    organisation_name: 'Org',
    branch_name: 'Branch',
  };
}

function renderWith(statuses: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('/coaches/sessions/me')) {
      return Promise.resolve({ data: { data: statuses.map((s, i) => makeSession(i + 1, s)) } });
    }
    if (url.includes('/coach-sessions/')) {
      return Promise.resolve({ data: { session: {}, timeline: [], allowedTransitions: [] } });
    }
    return Promise.resolve({ data: {} });
  });
  return render(
    <QueryClientProvider client={qc}>
      <TodaySessions />
    </QueryClientProvider>,
  );
}

describe('TodaySessions — canonical lifecycle actions', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ data: { session: {} } } as any);
  });

  it('scheduled session → Start and Cancel visible; Complete and No-Show hidden', async () => {
    renderWith(['scheduled']);
    await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());
    expect(screen.getByText('▶️ Start')).toBeTruthy();
    expect(screen.getByText('🚫 Cancel')).toBeTruthy();
    expect(screen.queryByText('🏁 Complete')).toBeNull();
    expect(screen.queryByText('👤 No Show')).toBeNull();
  });

  it('in_progress session → Complete and Cancel visible; Start hidden', async () => {
    renderWith(['in_progress']);
    await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());
    expect(screen.getByText('🏁 Complete')).toBeTruthy();
    expect(screen.getByText('👤 No Show')).toBeTruthy();
    expect(screen.getByText('🚫 Cancel')).toBeTruthy();
    expect(screen.queryByText('▶️ Start')).toBeNull();
  });

  it('completed session → no lifecycle action buttons', async () => {
    renderWith(['completed']);
    await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());
    expect(screen.queryByText('▶️ Start')).toBeNull();
    expect(screen.queryByText('🏁 Complete')).toBeNull();
    expect(screen.queryByText('👤 No Show')).toBeNull();
    expect(screen.queryByText('🚫 Cancel')).toBeNull();
  });

  it('cancelled session → no lifecycle action buttons', async () => {
    renderWith(['cancelled']);
    await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());
    expect(screen.queryByText('▶️ Start')).toBeNull();
    expect(screen.queryByText('🏁 Complete')).toBeNull();
    expect(screen.queryByText('👤 No Show')).toBeNull();
    expect(screen.queryByText('🚫 Cancel')).toBeNull();
  });

  it('confirmed legacy session → Start and Cancel still visible', async () => {
    renderWith(['confirmed']);
    await waitFor(() => expect(screen.getByText('Player 1')).toBeTruthy());
    expect(screen.getByText('▶️ Start')).toBeTruthy();
    expect(screen.getByText('🚫 Cancel')).toBeTruthy();
  });

  it('scheduled Start click calls POST /coach-sessions/1/start', async () => {
    renderWith(['scheduled']);
    await waitFor(() => expect(screen.getByText('▶️ Start')).toBeTruthy());
    fireEvent.click(screen.getByText('▶️ Start'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/coach-sessions/1/start'));
  });

  it('scheduled Cancel click calls POST /coach-sessions/1/cancel', async () => {
    renderWith(['scheduled']);
    await waitFor(() => expect(screen.getByText('🚫 Cancel')).toBeTruthy());
    fireEvent.click(screen.getByText('🚫 Cancel'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/coach-sessions/1/cancel'));
  });
});