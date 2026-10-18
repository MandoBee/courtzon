/**
 * Focused test for the LoginSplash deferred-redirect fix.
 *
 * The welcome splash must NOT override an intentional navigation performed while
 * it is visible (this was the cause of `/tournaments` bouncing back to `/app`).
 * It must still send a stationary user to `/app` when the splash finishes.
 *
 * Safe by construction: no DB, no network, no browser login.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import LoginSplash from './LoginSplash';
import { LOGIN_SPLASH_KEY } from '../../constants/login-splash';

vi.mock('../../store/auth.store', () => {
  const user = { fullName: 'Test Player' };
  return {
    useAuthStore: (selector: (s: { user: { fullName: string } }) => unknown) =>
      selector({ user }),
  };
});

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../branding/SiteBrand', () => ({ default: () => <div data-testid="brand" /> }));

const DISPLAY_MS = 2600;
const FADE_MS = 400;

let navigateRef: ((to: string) => void) | null = null;

function Probe() {
  const navigate = useNavigate();
  const location = useLocation();
  navigateRef = navigate as unknown as (to: string) => void;
  return <div data-testid="path">{location.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoginSplash />
      <Probe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  navigateRef = null;
  sessionStorage.setItem(LOGIN_SPLASH_KEY, '1');
});

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('LoginSplash deferred redirect', () => {
  it('sends a stationary user to /app after the splash', () => {
    renderAt('/profile');
    act(() => {
      vi.advanceTimersByTime(DISPLAY_MS + FADE_MS + 20);
    });
    expect(screen.getByTestId('path').textContent).toBe('/app');
  });

  it('does NOT override navigation performed during the visible splash', () => {
    renderAt('/app');
    act(() => {
      vi.advanceTimersByTime(500); // still inside the DISPLAY window
    });
    act(() => {
      navigateRef!('/tournaments'); // user navigates away
    });
    act(() => {
      vi.advanceTimersByTime(DISPLAY_MS + FADE_MS + 20);
    });
    expect(screen.getByTestId('path').textContent).toBe('/tournaments');
  });

  it('does NOT override navigation performed during the fade window', () => {
    renderAt('/app');
    act(() => {
      vi.advanceTimersByTime(DISPLAY_MS + 50); // fade has started
    });
    act(() => {
      navigateRef!('/tournaments');
    });
    act(() => {
      vi.advanceTimersByTime(FADE_MS + 20);
    });
    expect(screen.getByTestId('path').textContent).toBe('/tournaments');
  });
});
