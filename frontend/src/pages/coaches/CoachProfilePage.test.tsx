import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CoachProfilePage from './CoachProfilePage';
import api from '../../services/api';
import { ToastProvider } from '../../components/ui/Toast';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../hooks/useCan', () => ({
  useCan: () => ({ can: () => true }),
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: any) => selector({ user: { id: 1, defaultCurrency: 'EGP' } }),
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const SPORTS = [
  { id: 1, name: 'Tennis' },
  { id: 2, name: 'Padel' },
  { id: 3, name: 'Squash' },
];

const PROFILE = {
  bio: 'Coach bio',
  experience_years: 5,
  hourly_rate: 350,
  currency_code: 'EGP',
  is_available: true,
  is_verified: 1,
  // Legacy data: multiple sports — the UI must show only the primary (first).
  sports: '[1,2]',
  certifications: '[]',
};

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url === '/coaches/profile/me') return Promise.resolve({ data: PROFILE });
  if (url === '/sports') return Promise.resolve({ data: SPORTS });
  if (url === '/organisations') return Promise.resolve({ data: { data: [] } });
  if (url === '/coaches/agreements') return Promise.resolve({ data: { data: [] } });
  return Promise.resolve({ data: {} });
});

vi.mocked(api.put).mockImplementation(() => Promise.resolve({ data: PROFILE }));

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={['/coaches/profile']}>
      <Routes>
        <Route path="/coaches/profile" element={
          <QueryClientProvider client={qc}>
            <ToastProvider>
              <CoachProfilePage />
            </ToastProvider>
          </QueryClientProvider>
        } />
      </Routes>
    </MemoryRouter>
  );
};

describe('CoachProfilePage — single sport selection', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockClear();
    vi.mocked(api.put).mockClear();
    (api.get as any).mockImplementation(vi.mocked(api.get).getMockImplementation()!);
    (api.put as any).mockImplementation(vi.mocked(api.put).getMockImplementation()!);
  });

  it('renders the Sports section as radio (single-choice) controls, not checkboxes', async () => {
    renderPage();
    await screen.findByText('Sports');
    const radios = await screen.findAllByRole('radio');
    expect(radios.length).toBe(SPORTS.length);
    // No checkboxes in the sports area.
    expect(screen.queryAllByRole('checkbox').length).toBe(1); // only the "Available for bookings" checkbox
  });

  it('legacy multi-sport profile shows only the primary (first) sport selected', async () => {
    renderPage();
    await screen.findByText('Sports');
    const radios = screen.getAllByRole('radio');
    const checked = radios.filter((r) => (r as HTMLInputElement).checked).map((r) => (r as HTMLInputElement).value);
    // Legacy '[1,2]' → only sport 1 is checked.
    expect(checked).toEqual(['1']);
  });

  it('selecting a second sport replaces the first (single selection)', async () => {
    renderPage();
    await screen.findByText('Sports');
    // Sport 1 is pre-selected (legacy primary). Click Padel (id 2).
    fireEvent.click(screen.getByLabelText('Padel'));
    const after = screen.getAllByRole('radio');
    const checked = after.filter((r) => (r as HTMLInputElement).checked).map((r) => (r as HTMLInputElement).value);
    expect(checked).toEqual(['2']);
  });

  it('saving persists exactly one sport', async () => {
    renderPage();
    await screen.findByText('Sports');
    fireEvent.click(screen.getByLabelText('Squash'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      const calls = (api.put as any).mock.calls;
      const payload = calls.find((c: any[]) => String(c[0]).endsWith('/coaches/profile'))?.[1];
      expect(payload.sports).toEqual([3]);
    });
  });
});