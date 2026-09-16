import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MatchErrorState from '../MatchErrorState';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('MatchErrorState', () => {
  it('maps 404 to the not-found message', () => {
    render(<MatchErrorState error={{ response: { status: 404 } }} />);
    expect(screen.getByText('matchResult.notFound')).toBeTruthy();
  });

  it('maps 403 to the forbidden message', () => {
    render(<MatchErrorState error={{ response: { status: 403 } }} />);
    expect(screen.getByText('matchResult.forbidden')).toBeTruthy();
  });

  it('maps 401 to the sign-in message', () => {
    render(<MatchErrorState error={{ response: { status: 401 } }} />);
    expect(screen.getByText('matchResult.notAuthenticated')).toBeTruthy();
  });

  it('maps network / 5xx to a generic load error and offers a retry', () => {
    const onRetry = vi.fn();
    render(<MatchErrorState error={{ response: { status: 500 } }} onRetry={onRetry} />);
    expect(screen.getByText('matchResult.loadError')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('does not offer retry for a 404 (stale link — nothing to retry)', () => {
    render(<MatchErrorState error={{ response: { status: 404 } }} onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'common.retry' })).toBeNull();
  });
});