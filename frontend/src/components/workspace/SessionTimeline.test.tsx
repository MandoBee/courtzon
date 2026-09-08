import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionTimeline from './SessionTimeline';

function makeEvent(event: string, overrides: Record<string, any> = {}) {
  return {
    id: 1,
    event,
    actor_role: 'coach',
    created_at: '2026-09-09T10:00:00',
    metadata: null,
    ...overrides,
  };
}

describe('SessionTimeline', () => {
  it('renders the canonical scheduled → in_progress event as "Session started"', () => {
    render(<SessionTimeline events={[makeEvent('in_progress')]} />);
    expect(screen.getByText('Session started')).toBeTruthy();
  });

  it('still renders the legacy started event as "Session started"', () => {
    render(<SessionTimeline events={[makeEvent('started')]} />);
    expect(screen.getByText('Session started')).toBeTruthy();
  });

  it('preserves the raw-event fallback for unknown events', () => {
    render(<SessionTimeline events={[makeEvent('some_future_event')]} />);
    expect(screen.getByText('some_future_event')).toBeTruthy();
  });
});