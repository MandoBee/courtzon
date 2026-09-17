import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SideSelection from './SideSelection';

vi.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        'match.side_home': 'Home',
        'match.side_away': 'Away',
        'match.side_full': 'Full',
        'match.side_available': 'Available',
        'match.side_you': 'You',
        'match.side_legacy': 'Sides are not configured for this match',
        'match.side_format': 'Format: {format}',
        'match.side_capacity': '{count}/{capacity}',
      };
      let value = map[key] || key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          value = value.replace(`{${k}}`, String(v));
        });
      }
      return value;
    },
  }),
}));

describe('SideSelection (Group 3)', () => {
  beforeEach(() => vi.clearAllMocks());

  const slots = (sides: Array<{ side: 'home' | 'away'; userId: number; fullName?: string }>) =>
    sides.map((s) => ({ ...s, fullName: s.fullName || `Player ${s.userId}`, avatarUrl: null, role: 'joiner' }));

  it('singles displays one slot per side (capacity 1)', () => {
    render(
      <SideSelection
        formatName="Tennis Standard"
        formatType="singles"
        playersPerSide={1}
        slots={slots([{ side: 'home', userId: 1 }])}
        selected={null}
        onSelect={() => {}}
        editable
      />,
    );
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Away')).toBeTruthy();
    expect(screen.getByText('Format: Tennis Standard')).toBeTruthy();
  });

  it('doubles displays two slots per side (capacity 2)', () => {
    render(
      <SideSelection
        formatName="Padel Standard"
        formatType="doubles"
        playersPerSide={2}
        slots={slots([{ side: 'home', userId: 1 }, { side: 'home', userId: 2 }])}
        selected={null}
        onSelect={() => {}}
        editable
      />,
    );
    expect(screen.getByText('0/2')).toBeTruthy(); // away count/capacity (empty side)
  });

  it('full side is disabled/unavailable', () => {
    const onSelect = vi.fn();
    render(
      <SideSelection
        formatName="Padel Standard"
        formatType="doubles"
        playersPerSide={2}
        slots={slots([{ side: 'home', userId: 1 }, { side: 'home', userId: 2 }])}
        selected={null}
        onSelect={onSelect}
        editable
      />,
    );
    const homeBtn = screen.getByText('Full');
    expect(homeBtn).toBeTruthy();
    // Clicking the full home side must not fire selection.
    fireEvent.click(homeBtn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selected side is visually marked and selectable', () => {
    const onSelect = vi.fn();
    render(
      <SideSelection
        formatName="Tennis Standard"
        formatType="singles"
        playersPerSide={1}
        slots={slots([])}
        selected="away"
        onSelect={onSelect}
        editable
      />,
    );
    fireEvent.click(screen.getByText('Away'));
    expect(onSelect).toHaveBeenCalledWith('away');
  });

  it('marks the current user with the You label', () => {
    render(
      <SideSelection
        formatName="Tennis Standard"
        formatType="singles"
        playersPerSide={1}
        slots={slots([{ side: 'home', userId: 42, fullName: 'Sami' }])}
        selected="home"
        currentUserId={42}
        onSelect={() => {}}
        editable={false}
      />,
    );
    expect(screen.getByText(/Sami/)).toBeTruthy();
    expect(screen.getByText('(You)')).toBeTruthy();
  });

  it('legacy match without format capacity shows a notice', () => {
    render(
      <SideSelection
        formatName={null}
        formatType={null}
        playersPerSide={null}
        slots={slots([{ side: 'home', userId: 1 }, { side: 'away', userId: 2 }])}
        selected={null}
        onSelect={() => {}}
        editable={false}
      />,
    );
    expect(screen.getByText('Sides are not configured for this match')).toBeTruthy();
  });
});