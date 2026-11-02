import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfilePage from './ProfilePage';

vi.mock('../../services/api', () => {
  const get = vi.fn((url: string) => {
    if (url === '/public/languages') {
      return Promise.resolve({ data: { data: [{ id: 1, code: 'en', native_name: 'English' }] } });
    }
    if (url === '/sports') return Promise.resolve({ data: [{ id: 22, name: 'Padel' }] });
    if (url === '/coaches/profile/me') {
      return Promise.resolve({ data: { bio: 'QA', experience_years: 3, hourly_rate: 100, currency_code: 'EGP', is_available: true, is_verified: 1, sports: '[22]', certifications: '[]' } });
    }
    if (url === '/notification-preferences') return Promise.resolve({ data: { data: [] } });
    if (url === '/marketplace/player/status') return Promise.resolve({ data: { active: false } });
    return Promise.resolve({ data: { data: [] } });
  });
  return {
    default: { get, put: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn(() => Promise.resolve({ data: {} })), patch: vi.fn(() => Promise.resolve({ data: {} })), delete: vi.fn(() => Promise.resolve({ data: {} })) },
    authApi: { logout: vi.fn(), checkAuth: vi.fn(), refresh: vi.fn() },
  };
});

vi.mock('../../hooks/useCan', () => ({ useCan: () => ({ can: () => true }) }));
vi.mock('../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));
vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'en' }),
  setLocale: vi.fn(),
}));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../store/theme.store', () => ({ syncUserThemePreference: vi.fn() }));

const USER = {
  id: 1,
  fullName: 'QA Player',
  fullPhone: '+200000000000',
  email: 'qa@example.com',
  mainSportId: 22,
  gender: 'male',
  birthDate: '1995-05-05',
  isPublic: true,
  coachStatus: 'approved',
  isSeller: false,
  languageId: null,
  darkMode: 'system',
  playingHand: 'right',
  defaultCurrency: 'EGP',
};

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: any) => selector({ user: USER, setUser: vi.fn() }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProfilePage touch targets (D-13)', () => {
  it('coach tab CTA has a 44px minimum hit height', async () => {
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'profile.tabs.coach' }));
    await waitFor(() => {
      const link = container.querySelector('a[href="/coaches/profile"]');
      expect(link).toBeTruthy();
      expect(link!.className).toContain('min-h-11');
      expect(link!.className).toContain('inline-flex');
    });
  });

  it('settings selects are 44px tall', async () => {
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'profile.tabs.settings' }));
    await waitFor(() => {
      const selects = container.querySelectorAll('select');
      expect(selects.length).toBeGreaterThanOrEqual(2);
      selects.forEach((s) => expect(s.className).toContain('h-11'));
    });
  });

  it('every toggle in settings exposes a 44x44 hit area', async () => {
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'profile.tabs.settings' }));
    await waitFor(() => {
      const switches = [...container.querySelectorAll('input.sr-only.peer')].map((i) => i.closest('label'));
      expect(switches.length).toBeGreaterThan(0);
      switches.forEach((label) => {
        expect(label).toBeTruthy();
        expect(label!.className).toContain('min-h-11');
        expect(label!.className).toContain('min-w-11');
      });
      // knobs must anchor to the pill (relative), not to the enlarged label
      const pills = [...container.querySelectorAll('div.peer')];
      expect(pills.length).toBeGreaterThan(0);
      pills.forEach((p) => expect(p.className).toContain('relative'));
    });
  });
});
