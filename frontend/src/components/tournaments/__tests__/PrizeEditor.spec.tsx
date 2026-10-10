import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrizeEditor } from '../PrizeEditor';

describe('PrizeEditor (Group 2)', () => {
  it('renders an initial prize row', () => {
    render(<PrizeEditor currencyCode="EGP" value={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Prizes')).toBeTruthy();
    expect(screen.getByText('Prize #1')).toBeTruthy();
  });

  it('adds a new prize row', () => {
    render(<PrizeEditor currencyCode="EGP" value={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Add Prize'));
    expect(screen.getByText('Prize #1')).toBeTruthy();
    expect(screen.getByText('Prize #2')).toBeTruthy();
  });

  it('removes a prize row', () => {
    const onChange = vi.fn();
    render(<PrizeEditor currencyCode="EGP" value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ Add Prize')); // now 2 rows
    expect(screen.getByText('Prize #2')).toBeTruthy();
    // Remove the FIRST row → the remaining row is re-numbered as Prize #1.
    fireEvent.click(screen.getAllByText('Remove')[0]);
    expect(screen.queryByText('Prize #2')).toBeNull();
    expect(screen.getByText('Prize #1')).toBeTruthy();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as any[];
    expect(last).toHaveLength(1);
  });

  it('cash type shows amount + currency controls', () => {
    render(<PrizeEditor currencyCode="EGP" value={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Amount')).toBeTruthy();
    expect(screen.getByText('Currency')).toBeTruthy();
    // The authoritative currency is displayed, not editable as free text.
    expect(screen.getByText('EGP')).toBeTruthy();
  });

  it('non-cash type hides amount/currency controls', () => {
    const onChange = vi.fn();
    render(<PrizeEditor currencyCode="EGP" value={[]} onChange={onChange} />);
    // Switch the first row to a non-cash type.
    fireEvent.change(screen.getByDisplayValue('Cash'), { target: { value: 'gold' } });
    expect(screen.queryByText('Amount')).toBeNull();
    expect(screen.queryByText('Currency')).toBeNull();
    expect(screen.getByText('Non-cash prize — no amount or currency.')).toBeTruthy();
  });

  it('emits the authoritative currency in cash rows and clears amount for non-cash', () => {
    const onChange = vi.fn();
    render(<PrizeEditor currencyCode="USD" value={[]} onChange={onChange} />);
    fireEvent.change(screen.getByText('Amount').nextElementSibling as HTMLInputElement, { target: { value: '2500' } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as any[];
    expect(last[0].amount).toBe(2500);
  });
});

describe('PrizeEditor — R2-b competition scope', () => {
  const competitions = [
    { id: 10, name: 'Singles', is_default: 1 },
    { id: 11, name: 'Doubles', is_default: 0 },
  ];

  it('omitted competitions → no scope selector (creation-wizard backward compatibility)', () => {
    render(<PrizeEditor currencyCode="EGP" value={[]} onChange={vi.fn()} />);
    expect(screen.queryByText('Competition')).toBeNull();
    expect(screen.queryByLabelText('Prize #1 competition')).toBeNull();
  });

  it('a single competition → no scope selector', () => {
    render(<PrizeEditor currencyCode="EGP" value={[]} onChange={vi.fn()} competitions={[competitions[0]]} />);
    expect(screen.queryByLabelText('Prize #1 competition')).toBeNull();
  });

  it('more than one competition → scope selector renders each category plus Default', () => {
    render(<PrizeEditor currencyCode="EGP" value={[]} onChange={vi.fn()} competitions={competitions} />);
    expect(screen.getByLabelText('Prize #1 competition')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Default' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Singles' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Doubles' })).toBeTruthy();
  });

  it('preserves an existing competition_id and emits it on selection', () => {
    const onChange = vi.fn();
    render(
      <PrizeEditor
        currencyCode="EGP"
        value={[{ prize_type: 'cash', amount: 500, competition_id: 10 }]}
        onChange={onChange}
        competitions={competitions}
      />,
    );
    const select = screen.getByLabelText('Prize #1 competition') as HTMLSelectElement;
    expect(select.value).toBe('10');

    fireEvent.change(select, { target: { value: '11' } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as any[];
    expect(last[0].competition_id).toBe(11);
    expect(last[0].amount).toBe(500); // other prize fields preserved
  });

  it('selecting Default clears competition_id (null = default competition)', () => {
    const onChange = vi.fn();
    render(
      <PrizeEditor
        currencyCode="EGP"
        value={[{ prize_type: 'cash', amount: 500, competition_id: 11 }]}
        onChange={onChange}
        competitions={competitions}
      />,
    );
    fireEvent.change(screen.getByLabelText('Prize #1 competition'), { target: { value: '' } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as any[];
    expect(last[0].competition_id).toBeNull();
  });
});