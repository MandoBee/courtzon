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
  if (url === '/coaches/service-locations/me') return Promise.resolve({ data: [] });
  if (url === '/coaches/service-locations/me/available-branches') return Promise.resolve({ data: { data: BRANCHES } });
  return Promise.resolve({ data: {} });
});

const BRANCHES = [
  { id: 10, name: 'Branch A', organisation_name: 'Org 1', coach_policy: 'contract_required' },
  { id: 11, name: 'Branch B', organisation_name: 'Org 1', coach_policy: 'independent_coaches_allowed' },
];

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

describe('CoachProfilePage — service locations', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockClear();
    vi.mocked(api.put).mockClear();
    (api.get as any).mockImplementation(vi.mocked(api.get).getMockImplementation()!);
    (api.put as any).mockImplementation(vi.mocked(api.put).getMockImplementation()!);
  });

  async function openLocationsTab() {
    renderPage();
    // i18n is mocked to return the raw key, so the tab label is the key string.
    fireEvent.click(await screen.findByText('coach.profile.tab_locations'));
    await screen.findByText('Service Locations');
  }

  it('shows a clear empty state when the coach has zero service locations', async () => {
    await openLocationsTab();
    expect(screen.getByText('No service locations selected yet')).toBeTruthy();
    expect(screen.getByText(/haven't selected any service locations/i)).toBeTruthy();
    // No branch is pre-selected (no automatic assumption of service locations).
    const checked = screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked);
    expect(checked.length).toBe(0);
  });

  it('selecting a branch saves exactly that branch via the API', async () => {
    await openLocationsTab();
    fireEvent.click(screen.getByLabelText(/Branch A/));
    await waitFor(() => {
      const calls = (api.put as any).mock.calls;
      const payload = calls.find((c: any[]) => String(c[0]).endsWith('/coaches/service-locations/me'))?.[1];
      expect(payload).toEqual({ branchIds: [10] });
    });
  });

  it('deselecting a branch saves the remaining selection', async () => {
    // Coach already has Branch A selected.
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/coaches/service-locations/me') return Promise.resolve({ data: [{ id: 1, branch_id: 10, branch_name: 'Branch A', organisation_name: 'Org 1', coach_policy: 'contract_required' }] });
      if (url === '/coaches/profile/me') return Promise.resolve({ data: PROFILE });
      if (url === '/sports') return Promise.resolve({ data: SPORTS });
      if (url === '/organisations') return Promise.resolve({ data: { data: [] } });
      if (url === '/coaches/agreements') return Promise.resolve({ data: { data: [] } });
      if (url === '/coaches/service-locations/me/available-branches') return Promise.resolve({ data: { data: BRANCHES } });
      return Promise.resolve({ data: {} });
    });
    await openLocationsTab();
    // Deselect Branch A — no other branch is selected, so this must be blocked.
    fireEvent.click(screen.getByLabelText(/Branch A/));
    await waitFor(() => {
      const calls = (api.put as any).mock.calls;
      const serviceCalls = calls.filter((c: any[]) => String(c[0]).endsWith('/coaches/service-locations/me'));
      expect(serviceCalls.length).toBe(0); // empty save blocked client-side
    });
    // The checkbox must remain checked (server state preserved).
    const a = screen.getByLabelText(/Branch A/) as HTMLInputElement;
    expect(a.checked).toBe(true);
  });

  it('adding a second branch then deselecting the first persists the second', async () => {
    // Stateful mock: after each successful save the server-side selection updates.
    let currentLocations: any[] = [{ id: 1, branch_id: 10, branch_name: 'Branch A', organisation_name: 'Org 1', coach_policy: 'contract_required' }];
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/coaches/service-locations/me') return Promise.resolve({ data: currentLocations });
      if (url === '/coaches/profile/me') return Promise.resolve({ data: PROFILE });
      if (url === '/sports') return Promise.resolve({ data: SPORTS });
      if (url === '/organisations') return Promise.resolve({ data: { data: [] } });
      if (url === '/coaches/agreements') return Promise.resolve({ data: { data: [] } });
      if (url === '/coaches/service-locations/me/available-branches') return Promise.resolve({ data: { data: BRANCHES } });
      return Promise.resolve({ data: {} });
    });
    (api.put as any).mockImplementation((url: string, payload: any) => {
      if (String(url).endsWith('/coaches/service-locations/me')) {
        currentLocations = payload.branchIds.map((bid: number, i: number) => ({
          id: i + 1,
          branch_id: bid,
          branch_name: bid === 10 ? 'Branch A' : 'Branch B',
          organisation_name: 'Org 1',
          coach_policy: bid === 10 ? 'contract_required' : 'independent_coaches_allowed',
        }));
        return Promise.resolve({ data: currentLocations });
      }
      return Promise.resolve({ data: PROFILE });
    });
    await openLocationsTab();
    // Select Branch B → both selected.
    fireEvent.click(screen.getByLabelText(/Branch B/));
    await waitFor(() => {
      const calls = (api.put as any).mock.calls;
      const payload = calls.find((c: any[]) => String(c[0]).endsWith('/coaches/service-locations/me'))?.[1];
      expect(payload).toEqual({ branchIds: [10, 11] });
    });
    // Deselect Branch A → only Branch B remains.
    (api.put as any).mockClear();
    fireEvent.click(screen.getByLabelText(/Branch A/));
    await waitFor(() => {
      const calls = (api.put as any).mock.calls;
      const payload = calls.find((c: any[]) => String(c[0]).endsWith('/coaches/service-locations/me'))?.[1];
      expect(payload).toEqual({ branchIds: [11] });
    });
  });
});
