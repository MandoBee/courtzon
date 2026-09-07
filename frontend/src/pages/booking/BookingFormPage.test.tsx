import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookingFormPage from './BookingFormPage';
import api from '../../services/api';
import { ToastProvider } from '../../components/ui/Toast';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../realtime/useResourceRoom', () => ({
  useResourceRoom: () => {},
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const RESOURCE = { id: 5, name: 'Court 1', branch_id: 9, slot_duration: 60 };

const COACH_CANDIDATES = (coachIds: number[]) => [
  {
    activityType: 'coach_session',
    date: '2026-09-10',
    startTime: '10:00',
    endTime: '11:00',
    resources: coachIds.map((id) => ({
      resourceType: 'coach',
      resourceId: id,
      capabilities: { name: `Coach ${id}`, hourlyRate: 100 },
    })),
  },
];

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url.includes('/slots')) return Promise.resolve({ data: { data: [{ slot_start: '10:00', slot_end: '11:00', status: 'available' }] } });
  if (url.startsWith('/resources/5')) return Promise.resolve({ data: RESOURCE });
  return Promise.resolve({ data: {} });
});

vi.mocked(api.post).mockImplementation((url: string) => {
  if (url === '/scheduling/search') return Promise.resolve({ data: { data: COACH_CANDIDATES([101]) } });
  return Promise.resolve({ data: {} });
});

function renderWithParams(params: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={[`/book/5${params}`]}>
      <Routes>
        <Route path="/book/:resourceId" element={
          <QueryClientProvider client={qc}>
            <ToastProvider>
              <BookingFormPage />
            </ToastProvider>
          </QueryClientProvider>
        } />
      </Routes>
    </MemoryRouter>
  );
}

describe('BookingFormPage — coach branch eligibility in the unified booking flow', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockClear();
    vi.mocked(api.post).mockClear();
    (api.get as any).mockImplementation(vi.mocked(api.get).getMockImplementation()!);
    (api.post as any).mockImplementation(vi.mocked(api.post).getMockImplementation()!);
  });

  it('player only sees coaches eligible for the selected branch (candidates from backend)', async () => {
    renderWithParams('?date=2026-09-10&startTime=10:00&endTime=11:00');
    // Select the date + slot so the coach candidates query fires.
    await screen.findByText('Book: Court 1');
    fireEvent.click(screen.getByText('10:00 - 11:00'));
    await screen.findByText('Add a Coach (optional)');
    // Only eligible coach 101 is listed.
    expect(screen.getByText('Coach 101')).toBeTruthy();
    expect(screen.queryByText('Coach 999')).toBeNull();
  });

  it('a pre-selected coach who is not eligible at the branch is removed (falls back to court only)', async () => {
    // Preset coach 999, but the backend candidates only contain coach 101.
    renderWithParams('?date=2026-09-10&startTime=10:00&endTime=11:00&coachId=999');
    await screen.findByText('Book: Court 1');
    await waitFor(() => {
      expect(screen.getByText('The requested coach is not available at this branch for the chosen time.')).toBeTruthy();
    });
    // The submit button falls back to court-only booking.
    const btn = screen.getByRole('button', { name: 'Confirm Booking' });
    expect(btn).toBeTruthy();
  });

  it('an eligible pre-selected coach stays selected', async () => {
    renderWithParams('?date=2026-09-10&startTime=10:00&endTime=11:00&coachId=101');
    await screen.findByText('Book: Court 1');
    // The candidate search auto-fires (date/start/end preset from the URL); the
    // eligible coach 101 must remain selected without any warning/fallback.
    await waitFor(() => {
      expect(screen.queryByText('The requested coach is not available at this branch for the chosen time.')).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm Booking with Coach' })).toBeTruthy();
    });
  });
});