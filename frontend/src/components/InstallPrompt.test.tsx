/**
 * P3-06 regression — InstallPrompt visibility is derived from permissions-free
 * external state (install event, route, dismissal, standalone display mode) instead
 * of being copied into state from an effect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InstallPrompt from './InstallPrompt';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function makeInstallEvent(): InstallEvent {
  const event = new Event('beforeinstallprompt') as InstallEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  return event;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InstallPrompt />
    </MemoryRouter>,
  );
}

beforeEach(() => {
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

describe('InstallPrompt derived visibility', () => {
  it('stays hidden until the browser fires beforeinstallprompt', () => {
    renderAt('/');
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('shows the banner on a landing path after the install event', () => {
    renderAt('/');
    act(() => {
      window.dispatchEvent(makeInstallEvent());
    });
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
  });

  it('hides the banner after "Not now" without another render cycle', () => {
    renderAt('/');
    act(() => {
      window.dispatchEvent(makeInstallEvent());
    });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('does not show the banner on a non-landing path', () => {
    renderAt('/app');
    act(() => {
      window.dispatchEvent(makeInstallEvent());
    });
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('hides the banner after a completed install', async () => {
    renderAt('/');
    const event = makeInstallEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }));
      await event.userChoice;
    });
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });
});
