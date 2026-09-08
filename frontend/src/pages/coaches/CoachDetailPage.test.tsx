import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CoachDetailPage from './CoachDetailPage';
import api from '../../services/api';
import { ToastProvider } from '../../components/ui/Toast';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../hooks/useFeatureFlag', () => ({
  useFeatureFlag: () => false,
}));

const COACH = {
  id: 7,
  user_id: 21,
  full_name: 'Test Coach',
  bio: 'A great coach',
  is_available: true,
  hourly_rate: 150,
  experience_years: 5,
  rating_avg: 4.8,
  rating_count: 12,
  certifications: [],
  agreements: [],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={['/coaches/7']}>
      <Routes>
        <Route
          path="/coaches/:id"
          element={
            <QueryClientProvider client={qc}>
              <ToastProvider>
                <CoachDetailPage />
              </ToastProvider>
            </QueryClientProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('CoachDetailPage', () => {
  it('directs players to the Unified Book a Coach flow only (no legacy request CTA)', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/coaches/7') return Promise.resolve({ data: COACH });
      return Promise.resolve({ data: {} });
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Test Coach')).toBeTruthy());
    expect(screen.getByText('Book a Coach')).toBeTruthy();
    expect(screen.queryByText('Request Session')).toBeNull();
    expect(screen.queryByText('Request a Session')).toBeNull();
    expect(vi.mocked(api.post)).not.toHaveBeenCalledWith('/coach-sessions/request', expect.anything());
  });
});