import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommandPalette from './CommandPalette';

const buildAdminCommandsSpy = vi.fn(() => []);

vi.mock('./adminSearch', () => ({
  buildAdminCommands: () => buildAdminCommandsSpy(),
}));

const mockUser: { permissions: string[] } = { permissions: ['marketplace.view'] };

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: any) => unknown) => selector({ user: mockUser }),
}));

const mockT = (k: string) => k;

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: mockT, locale: 'en', loading: false, setLocale: vi.fn(), getLocale: vi.fn() }),
  I18nProvider: ({ children }: any) => children,
}));

const mockFlags: Record<string, boolean> = {};

vi.mock('../../store/feature-flags.store', () => ({
  useFeatureFlagsStore: (selector: (s: any) => unknown) => selector({ flags: mockFlags }),
}));

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const storeState = {
  isOpen: true,
  query: '',
  close: vi.fn(),
  open: vi.fn(),
  setQuery: vi.fn(),
  addRecent: vi.fn(),
  recentSearches: [],
  togglePin: vi.fn(),
  clearRecent: vi.fn(),
};

vi.mock('./SearchProvider', () => ({
  useSearchStore: (selector?: any) => (selector ? selector(storeState) : storeState),
}));

describe('CommandPalette adminCommands effect', () => {
  beforeEach(() => {
    buildAdminCommandsSpy.mockClear();
    storeState.isOpen = true;
    storeState.query = '';
    mockUser.permissions = ['marketplace.view'];
  });

  it('calls buildAdminCommands once after search module loads', async () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(buildAdminCommandsSpy).toHaveBeenCalledTimes(1);
  });

  it('does not regenerate commands on rerender with stable permissions', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const before = buildAdminCommandsSpy.mock.calls.length;

    rerender(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(buildAdminCommandsSpy).toHaveBeenCalledTimes(before);
  });
});
