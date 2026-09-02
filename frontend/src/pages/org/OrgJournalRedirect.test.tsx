import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../../App';
import { useAuthStore } from '../../store/auth.store';

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  authApi: {
    login: vi.fn(),
    refresh: vi.fn().mockResolvedValue({ user: null }),
    me: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    checkUniqueness: vi.fn(),
    requestReactivation: vi.fn(),
  },
}));

vi.mock('../../realtime/SocketContext', () => ({
  useSocketContext: () => ({ socket: null, isConnected: false, state: 'uninitialized', subscribe: () => () => {} }),
  SocketProvider: ({ children }: any) => children,
}));

vi.mock('../../components/pwa/PWAUpdatePrompt', () => ({ default: () => null }));
vi.mock('../../components/pwa/IOSInstallSheet', () => ({ default: () => null }));
vi.mock('../../components/InstallPrompt', () => ({ default: () => null }));

const orgUser = {
  id: 6,
  publicId: 'o6',
  fullName: 'Org Admin',
  email: 'org@example.com',
  phoneNumber: '',
  fullPhone: '',
  gender: '',
  birthDate: null,
  avatarUrl: null,
  languageId: null,
  timezone: 'UTC',
  darkMode: 'light' as const,
  isCoach: false,
  isSeller: false,
  mainSportId: null,
  mainLevelId: null,
  roles: ['org-admin'],
  permissions: ['*'],
  organisations: [{ id: 6, name: 'Test Org', logoUrl: null, scopeType: 'organisation', isVerified: true, isActive: true }],
};

describe('Organisation Journal Entries — removed from the org UI', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    window.history.pushState({}, '', '/org/6/accounting/journal');
    useAuthStore.setState({
      user: orgUser,
      isAuthenticated: true,
      isLoading: false,
      checkAuth: async () => {},
    } as any);
  });

  it('redirects the old organisation journal URL to Organisation → Accounting Records', async () => {
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/org/6/accounting/records'), { timeout: 15000 });

    expect(await screen.findByRole('heading', { name: 'Accounting Records' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Journal Entries' })).toBeNull();
    expect(screen.queryByText('Manual journal entries for this organisation (read-only)')).toBeNull();
  });

  it('does not render a Manual Journal item in the organisation sidebar', async () => {
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/org/6/accounting/records'), { timeout: 15000 });
    await screen.findByRole('heading', { name: 'Accounting Records' });

    expect(screen.queryByText('Manual Journal')).toBeNull();
    expect(screen.queryByText('Journal Entries')).toBeNull();
  });
});
