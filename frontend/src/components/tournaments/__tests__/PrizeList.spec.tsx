import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrizeList } from '../PrizeList';

describe('PrizeList (Group 2)', () => {
  it('renders nothing when no prizes and no legacy description', () => {
    const { container } = render(<PrizeList prizes={[]} legacyDescription={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('legacy fallback — renders prize_description when no structured prizes exist', () => {
    render(<PrizeList prizes={[]} legacyDescription="Trophy + 5000 EGP" />);
    expect(screen.getByText(/Trophy \+ 5000 EGP/)).toBeTruthy();
  });

  it('structured prizes take precedence — legacy description not shown', () => {
    render(<PrizeList prizes={[{ id: 1, placement: 1, prize_type: 'cash', amount: 10000, currency_code: 'EGP' }]} legacyDescription="Trophy + 5000 EGP" />);
    expect(screen.getByText(/1st Place/)).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.queryByText(/Trophy \+ 5000 EGP/)).toBeNull();
  });

  it('cash prize renders formatted amount + currency', () => {
    render(<PrizeList prizes={[{ id: 1, placement: 1, prize_type: 'cash', amount: 10000, currency_code: 'EGP' }]} />);
    expect(screen.getByText(/10,000\.00/)).toBeTruthy();
  });

  it('special prize (null placement) renders as Special Prize', () => {
    render(<PrizeList prizes={[{ id: 2, placement: null, prize_type: 'gift', description: 'Padel racket' }]} />);
    expect(screen.getByText('Special Prize')).toBeTruthy();
    expect(screen.getByText('Gift')).toBeTruthy();
    expect(screen.getByText('Padel racket')).toBeTruthy();
  });

  it('renders multiple prizes per placement and non-cash descriptions', () => {
    render(<PrizeList prizes={[
      { id: 1, placement: 1, prize_type: 'cash', amount: 10000, currency_code: 'EGP' },
      { id: 2, placement: 1, prize_type: 'gold', description: 'Gold medal' },
      { id: 3, placement: 2, prize_type: 'silver', description: 'Silver medal' },
    ]} />);
    expect(screen.getAllByText('1st Place')).toHaveLength(2);
    expect(screen.getByText('Gold medal')).toBeTruthy();
    expect(screen.getByText('2nd Place')).toBeTruthy();
    expect(screen.getByText('Silver medal')).toBeTruthy();
  });
});